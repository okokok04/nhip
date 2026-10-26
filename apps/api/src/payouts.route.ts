/**
 * `/v1/payouts` — nhận một payout và trả về ngay.
 *
 * Nguyên tắc chi phối cả file: **endpoint không chờ chain.** Nó ghi vào hàng đợi
 * rồi trả `202`. Nền tảng gọi API này trong vòng lặp trả lương; nếu mỗi lời gọi
 * phải chờ một block, họ sẽ bị chặn bởi tốc độ chain — đúng thứ sản phẩm này
 * sinh ra để xoá bỏ.
 */

import { Hono } from 'hono';

import type { Database } from '../../../packages/db/src/client.ts';
import { ID_PREFIX, newId } from '../../../packages/core/src/ids.ts';
import type { AppEnv } from './context.ts';
import { AppError, ErrorCode } from './errors.ts';
import { findPayoutById, listPayouts, upsertPayout, type PayoutRow } from './payouts.repo.ts';
import { findWorkerById } from './workers.repo.ts';
import {
  newCollector,
  readJsonBody,
  requireIdempotencyKey,
  requireObject,
  takeAmountMicro,
  takeLimit,
  takeString,
} from './validate.ts';

export interface RouteOptions {
  readonly db: Database;
}

/** Hình dạng payout trên đường dây. `snake_case` vì khớp DB và spec đã chốt. */
export interface PayoutBody {
  readonly id: string;
  readonly workerId: string;
  readonly amount_micro: string;
  readonly state: string;
  readonly reference: string | null;
  readonly created_at: string;
}

export function toPayoutBody(row: PayoutRow): PayoutBody {
  return {
    id: row.id,
    workerId: row.worker_id,
    amount_micro: row.amount_micro,
    state: row.state,
    reference: row.reference,
    created_at: row.created_at.toISOString(),
  };
}

export function createPayoutRoutes(options: RouteOptions): Hono<AppEnv> {
  const { db } = options;
  const routes = new Hono<AppEnv>();

  routes.post('/', async (c) => {
    const platform = c.get('platform');

    // Validate key TRƯỚC khi đọc body: thiếu key là lỗi hợp đồng, không cần parse
    // payload để biết. Parse trước chỉ tốn công cho một request chắc chắn bị từ chối.
    const idempotencyKey = requireIdempotencyKey(c.req.header('idempotency-key'));

    const body = await readJsonBody(c.req);
    const collector = newCollector();
    const source = requireObject(body, collector);
    if (!source) {
      collector.throwIfAny();
      throw new AppError(ErrorCode.INTERNAL, 'Body không phải object nhưng không có lỗi — lỗi logic.');
    }

    const workerId = takeString(source, 'workerId', collector, { min: 3, max: 100 });
    const amountMicro = takeAmountMicro(source, 'amount_micro', collector);
    const reference = takeString(source, 'reference', collector, { required: false, max: 500 });
    collector.throwIfAny();

    if (workerId === null || amountMicro === null) {
      throw new AppError(ErrorCode.INTERNAL, 'Validate xong mà thiếu trường bắt buộc — lỗi logic.');
    }

    const worker = await findWorkerById(db, platform.id, workerId);
    if (!worker) {
      // 404 chứ không 400: `workerId` đúng định dạng nhưng không thuộc nền tảng này.
      // Message không nói người này có tồn tại ở nền tảng khác hay không — đó sẽ là
      // kênh dò dữ liệu của đối thủ.
      throw new AppError(ErrorCode.WORKER_NOT_FOUND, 'Không tìm thấy người lao động này trong nền tảng.');
    }

    const { payout, duplicate } = await upsertPayout(db, {
      id: newId(ID_PREFIX.PAYOUT),
      platformId: platform.id,
      workerId,
      amountMicro,
      idempotencyKey,
      reference: reference ?? undefined,
    });

    // 200 cho retry, 202 cho lần đầu. Khác biệt này cho client biết request trước
    // đã tới đích hay chưa mà không phải gọi thêm endpoint tra cứu.
    return c.json({ ...toPayoutBody(payout), duplicate }, duplicate ? 200 : 202);
  });

  routes.get('/', async (c) => {
    const platform = c.get('platform');
    const collector = newCollector();

    const limit = takeLimit(c.req.query('limit'), collector, { fallback: 50, max: 200 });
    const workerId = takeString(
      { workerId: c.req.query('workerId') },
      'workerId',
      collector,
      { required: false, max: 100 },
    );
    collector.throwIfAny();

    const page = await listPayouts(db, platform.id, {
      workerId: workerId ?? undefined,
      limit: limit ?? 50,
      cursor: c.req.query('cursor'),
    });

    return c.json({
      payouts: page.rows.map(toPayoutBody),
      nextCursor: page.nextCursor,
    });
  });

  routes.get('/:id', async (c) => {
    const platform = c.get('platform');
    const payout = await findPayoutById(db, platform.id, c.req.param('id'));
    if (!payout) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy payout.');
    return c.json(toPayoutBody(payout));
  });

  return routes;
}
