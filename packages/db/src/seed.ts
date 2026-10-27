/**
 * Seed dữ liệu mẫu để mở `npm run dev` là có thứ để nhìn.
 *
 * **Điều quan trọng nhất ở file này: không có tx hash giả.**
 *
 * Bản trước ghi một tx_hash như thật (`0x9a8b…`) cho một lô `confirmed`. Với một sản phẩm
 * chuyển tiền, một hash giả nguy hiểm hơn không có hash nào: nó khiến người vận hành tin
 * là tiền đã đi, và nó khiến người lao động thấy một giao dịch không tồn tại.
 *
 * Nên dữ liệu mẫu được đánh dấu `settlement_mode = 'simulated'` ngay từ đầu, và bảng
 * `batches` từ chối bất kỳ lô simulated nào có `tx_hash` (constraint từ migration 004).
 */

import { hashApiKey } from '../../../apps/api/src/auth.ts';
import { ID_PREFIX, newId } from '../../../packages/core/src/ids.ts';
import { micro } from '../../../packages/core/src/money.ts';
import { upsertPayout } from '../../../apps/api/src/payouts.repo.ts';
import { upsertWorker } from '../../../apps/api/src/workers.repo.ts';
import type { Database } from './client.ts';

export const DEFAULT_PLATFORM_ID = 'plat_demo';
export const DEFAULT_SEED_KEY = 'nhip_sk_seed_00000000000000000000000000000001';

/**
 * Claim token cho từng người trong dữ liệu mẫu.
 *
 * Cố định (không random) để link biên nhận trong bản demo mở được mà không phải copy từ
 * DB. 48 ký tự hex khớp mẫu mà `/v1/receipts/:claimToken` chấp nhận.
 *
 * Vì sao vẫn an toàn: đây là dữ liệu demo trong database demo, không chứa tiền thật.
 */
const CLAIM_TOKEN_BY_EXTERNAL: Readonly<Record<string, string>> = {
  'driver-001': 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678deadbeef',
  'driver-002': 'b2c3d4e5f60718293a4b5c6d7e8f9012345678deadbeef01',
  'driver-003': 'c3d4e5f60718293a4b5c6d7e8f9012345678deadbeef0123',
  'driver-004': 'd4e5f60718293a4b5c6d7e8f9012345678deadbeef012345',
  'driver-005': 'e5f60718293a4b5c6d7e8f9012345678deadbeef01234567',
};

const WORKERS = [
  { externalId: 'driver-001', name: 'Nguyễn Văn An', address: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed' },
  { externalId: 'driver-002', name: 'Trần Thị Bình', address: '0x1234567890abcdef1234567890abcdef12345678' },
  { externalId: 'driver-003', name: 'Lê Minh Cường', address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
  { externalId: 'driver-004', name: 'Phạm Thu Dung', address: '0x9876543210fedcba9876543210fedcba98765432' },
  { externalId: 'driver-005', name: 'Hoàng Gia Hân', address: null },
] as const;

export async function seedDemo(db: Database, apiKey: string = DEFAULT_SEED_KEY): Promise<{ platformId: string; apiKey: string }> {
  // 1. Platform — `is_demo = TRUE` là nguồn sự thật cho nhãn "Demo" trên UI.
  await db.query(
    `INSERT INTO platforms (id, name, api_key_hash, address, batch_size, batch_interval_ms, gas_budget, is_demo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           api_key_hash = EXCLUDED.api_key_hash,
           address = EXCLUDED.address,
           is_demo = TRUE`,
    [
      DEFAULT_PLATFORM_ID,
      'Giao Hàng Nhanh (demo)',
      hashApiKey(apiKey),
      '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
      200,
      2000,
      '10000000',
    ],
  );

  // 2. Workers + claim token.
  const workerIds: string[] = [];
  for (const worker of WORKERS) {
    const { worker: row } = await upsertWorker(db, {
      id: newId(ID_PREFIX.WORKER),
      platformId: DEFAULT_PLATFORM_ID,
      externalId: worker.externalId,
      address: worker.address as `0x${string}` | null,
      displayName: worker.name,
    });
    const token = CLAIM_TOKEN_BY_EXTERNAL[worker.externalId];
    if (token) {
      // Ghi đè, không chỉ khi NULL: `upsertWorker` đã sinh token ngẫu nhiên lúc INSERT,
      // và một link demo ngẫu nhiên thì không ai dùng được. Chỉ nền tảng demo bị ghi đè
      // ở đây, và giá trị là hằng số nên chạy lại seed không đổi link.
      await db.query(`UPDATE workers SET claim_token = $1 WHERE id = $2`, [token, row.id]);
    }
    workerIds.push(row.id);
  }

  // 3. Payouts
  const PAID_KEYS = Array.from({ length: 40 }, (_, index) => `seed-paid-${String(index).padStart(3, '0')}`);
  const QUEUED_KEYS = Array.from({ length: 12 }, (_, index) => `seed-queued-${String(index).padStart(3, '0')}`);

  for (let index = 0; index < PAID_KEYS.length; index++) {
    const workerId = workerIds[index % workerIds.length];
    if (!workerId) continue;
    const amount = micro(BigInt(45_000 + ((index * 7_500) % 180_000)) * 1_000n);
    await upsertPayout(db, {
      id: newId(ID_PREFIX.PAYOUT),
      platformId: DEFAULT_PLATFORM_ID,
      workerId,
      amountMicro: amount,
      idempotencyKey: PAID_KEYS[index] ?? `seed-paid-${index}`,
      reference: `Đơn #${20260 + index}`,
    });
  }

  for (let index = 0; index < QUEUED_KEYS.length; index++) {
    const workerId = workerIds[(index + 2) % workerIds.length];
    if (!workerId) continue;
    const amount = micro(BigInt(35_000 + ((index * 12_000) % 120_000)) * 1_000n);
    await upsertPayout(db, {
      id: newId(ID_PREFIX.PAYOUT),
      platformId: DEFAULT_PLATFORM_ID,
      workerId,
      amountMicro: amount,
      idempotencyKey: QUEUED_KEYS[index] ?? `seed-queued-${index}`,
      reference: `Đơn chờ #${20400 + index}`,
    });
  }

  // 4. Lô lịch sử: `simulated`, không có tx hash, không có block_number/gas_used giả.
  const paidPayouts = await db.query<{ id: string }>(
    `SELECT id FROM payouts
      WHERE platform_id = $1 AND idempotency_key = ANY($2::text[])
      ORDER BY id`,
    [DEFAULT_PLATFORM_ID, PAID_KEYS],
  );

  if (paidPayouts.rows.length > 0) {
    const existingHistory = await db.query<{ id: string }>(
      `SELECT id FROM batches
        WHERE platform_id = $1 AND idempotency_key = 'batch:seed-history'
        LIMIT 1`,
      [DEFAULT_PLATFORM_ID],
    );
    const batchId = existingHistory.rows[0]?.id ?? 'bat_seed_history';
    const ids = paidPayouts.rows.map((row) => row.id);
    const totals = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_micro), 0)::text AS total FROM payouts WHERE id = ANY($1::text[])`,
      [ids],
    );
    const total = totals.rows[0]?.total ?? '0';

    // Gas ước tính dùng cận trên đo được trên Arc (75.000/payout, ví lạnh) — cùng con số
    // mà planner dùng, để không có hai chuẩn gas trong cùng một hệ thống.
    await db.query(
      `INSERT INTO batches
         (id, platform_id, state, payout_count, total_micro, estimated_gas,
          idempotency_key, settlement_mode)
       VALUES ($1, $2, 'confirmed', $3, $4, $5, 'batch:seed-history', 'simulated')
       ON CONFLICT (id) DO UPDATE
         SET payout_count   = EXCLUDED.payout_count,
             total_micro    = EXCLUDED.total_micro,
             estimated_gas  = EXCLUDED.estimated_gas,
             settlement_mode = 'simulated',
             tx_hash        = NULL`,
      [batchId, DEFAULT_PLATFORM_ID, paidPayouts.rows.length, total, (BigInt(paidPayouts.rows.length) * 75_000n).toString()],
    );

    const placeholders = ids.map((_, i) => `$${i + 3}`).join(', ');
    await db.query(
      `UPDATE payouts
          SET batch_id = $1,
              state = 'confirmed',
              confirmed_at = COALESCE(confirmed_at, created_at)
        WHERE platform_id = $2 AND id IN (${placeholders})`,
      [batchId, DEFAULT_PLATFORM_ID, ...ids],
    );
  }

  return { platformId: DEFAULT_PLATFORM_ID, apiKey };
}
