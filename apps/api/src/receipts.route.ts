/**
 * `/v1/receipts/:claimToken` — biên nhận cho **người lao động**, không cần API key.
 *
 * Vì sao route này tồn tại và vì sao nó public:
 *
 * Người lao động gig không có tài khoản trên hệ thống của chúng ta, không có API key, và
 * không nên phải cài một ứng dụng để biết mình đã được trả chưa. Cách duy nhất để họ tự
 * kiểm là một đường link. Nhưng link đó là **bí mật**: ai có token thì xem được biên nhận.
 *
 * Ba quy tắc bảo mật, mỗi quy tắc chặn một sự cố thật:
 *
 * 1. **Token đủ dài và ngẫu nhiên** (32 byte hex). Token 6 ký tự thì đoán được, và người
 *    đoán được token sẽ đọc được thu nhập của người khác.
 * 2. **Không trả địa chỉ ví đầy đủ.** Biên nhận cần chứng minh *đã trả*; địa chỉ đầy đủ
 *    biến link bị lộ thành một bản đồ ví của toàn bộ lao động.
 * 3. **Tra cứu đúng một lần theo token**, không liệt kê. Endpoint không có cách nào để
 *    "dò" token — chỉ có một token đúng hoặc 404.
 *
 * Điều **không** làm: trả về dữ liệu của nền tảng (doanh thu, số lao động, danh sách
 * người khác). Người lao động chỉ thấy phần của mình.
 */

import { Hono } from 'hono';

import type { Database } from '../../../packages/db/src/client.ts';
import type { AppEnv } from './context.ts';
import { AppError, ErrorCode } from './errors.ts';
import type { RouteOptions } from './payouts.route.ts';

/** Trạng thái của một khoản trong mắt người lao động — không phải trạng thái nội bộ. */
const RECEIPT_STATE = {
  queued: 'pending',
  batched: 'pending',
  submitted: 'sending',
  confirmed: 'paid',
  failed: 'failed',
  unknown: 'checking',
} as const;

type ReceiptState = (typeof RECEIPT_STATE)[keyof typeof RECEIPT_STATE];

export function createReceiptRoutes(options: RouteOptions): Hono<AppEnv> {
  const { db } = options;
  const routes = new Hono<AppEnv>();

  routes.get('/:claimToken', async (c) => {
    const token = c.req.param('claimToken').trim();

    // Token sai định dạng bị từ chối **trước** khi chạm DB: một chuỗi 1 ký tự không thể
    // là token của chúng ta, và trả 404 cho nó không tiết lộ gì.
    if (!/^[a-f0-9]{32,64}$/i.test(token)) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy biên nhận.');
    }

    const worker = await db.query<{
      id: string;
      display_name: string | null;
      external_id: string;
      address: string | null;
      platform_name: string;
    }>(
      `SELECT w.id, w.display_name, w.external_id, w.address, p.name AS platform_name
         FROM workers w
         JOIN platforms p ON p.id = w.platform_id
        WHERE w.claim_token = $1`,
      [token],
    );

    const row = worker.rows[0];
    // Cùng message cho "token không tồn tại" và "token sai định dạng": xác nhận một
    // token có tồn tại hay không là thông tin cho kẻ dò.
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy biên nhận.');

    const payouts = await db.query<{
      id: string;
      amount_micro: string;
      state: string;
      reference: string | null;
      created_at: Date;
      confirmed_at: Date | null;
      tx_hash: string | null;
      batch_settlement_mode: string | null;
      batch_network: string | null;
    }>(
      `SELECT p.id, p.amount_micro::text AS amount_micro, p.state, p.reference,
              p.created_at, p.confirmed_at, p.tx_hash,
              b.settlement_mode AS batch_settlement_mode,
              b.arc_network     AS batch_network
         FROM payouts p
         LEFT JOIN batches b ON b.id = p.batch_id
        WHERE p.worker_id = $1
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT 100`,
      [row.id],
    );

    let paid = 0n;
    let pending = 0n;
    let failed = 0n;

    const items = payouts.rows.map((payout) => {
      const state: ReceiptState = RECEIPT_STATE[payout.state as keyof typeof RECEIPT_STATE] ?? 'checking';
      const amount = BigInt(payout.amount_micro);
      if (state === 'paid') paid += amount;
      else if (state === 'failed') failed += amount;
      else pending += amount;

      // `tx_hash` chỉ có nghĩa khi lô đã thật sự lên chain. Với lô demo, trả về null thay
      // vì một hash trông rất thuyết phục — người lao động không nên tin một giao dịch
      // không tồn tại.
      const onchain = payout.batch_settlement_mode === 'onchain' && payout.tx_hash !== null;

      return {
        id: payout.id,
        amount_micro: payout.amount_micro,
        state,
        reference: payout.reference,
        created_at: payout.created_at.toISOString(),
        paid_at: state === 'paid' ? (payout.confirmed_at?.toISOString() ?? null) : null,
        txHash: onchain ? payout.tx_hash : null,
        // Mạng của giao dịch, để link explorer trỏ đúng chỗ. Đoán ở client nghĩa là một
        // giao dịch thật trên mainnet mở ra trang 404 của testnet.
        network: onchain ? (payout.batch_network ?? 'testnet') : null,
        // Nói rõ khoản này là tiền thật hay dữ liệu demo. Không có nhãn này, một biên nhận
        // demo trông giống hệt một biên nhận thật.
        isDemo: payout.batch_settlement_mode !== 'onchain',
      };
    });

    return c.json({
      // Tên hiển thị + mã nội bộ, nhưng **không** địa chỉ ví.
      worker: {
        displayName: row.display_name,
        externalId: row.external_id,
        hasWallet: row.address !== null,
      },
      platformName: row.platform_name,
      totals: {
        paid_micro: paid.toString(),
        pending_micro: pending.toString(),
        failed_micro: failed.toString(),
        count: items.length,
      },
      receipts: items,
    });
  });

  return routes;
}
