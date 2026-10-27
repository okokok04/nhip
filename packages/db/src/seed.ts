import { hashApiKey } from '../../../apps/api/src/auth.ts';
import { ID_PREFIX, newId } from '../../../packages/core/src/ids.ts';
import { micro } from '../../../packages/core/src/money.ts';
import { upsertPayout } from '../../../apps/api/src/payouts.repo.ts';
import { upsertWorker } from '../../../apps/api/src/workers.repo.ts';
import type { Database } from './client.ts';

export const DEFAULT_PLATFORM_ID = 'plat_demo';
export const DEFAULT_SEED_KEY = 'nhip_sk_seed_00000000000000000000000000000001';

const WORKERS = [
  { externalId: 'driver-001', name: 'Nguyễn Văn An', address: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed' },
  { externalId: 'driver-002', name: 'Trần Thị Bình', address: '0x1234567890abcdef1234567890abcdef12345678' },
  { externalId: 'driver-003', name: 'Lê Minh Cường', address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
  { externalId: 'driver-004', name: 'Phạm Thu Dung', address: '0x9876543210fedcba9876543210fedcba98765432' },
  { externalId: 'driver-005', name: 'Hoàng Gia Hân', address: null },
] as const;

export async function seedDemo(db: Database, apiKey: string = DEFAULT_SEED_KEY): Promise<{ platformId: string; apiKey: string }> {
  // 1. Platform
  await db.query(
    `INSERT INTO platforms (id, name, api_key_hash, address, batch_size, batch_interval_ms, gas_budget)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           api_key_hash = EXCLUDED.api_key_hash,
           address = EXCLUDED.address`,
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

  // 2. Workers
  const workerIds: string[] = [];
  for (const worker of WORKERS) {
    const { worker: row } = await upsertWorker(db, {
      id: newId(ID_PREFIX.WORKER),
      platformId: DEFAULT_PLATFORM_ID,
      externalId: worker.externalId,
      address: worker.address as `0x${string}` | null,
      displayName: worker.name,
    });
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

  // Đánh dấu 40 payout đầu là đã trả trong một lô
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

    await db.query(
      `INSERT INTO batches (id, platform_id, state, payout_count, total_micro, estimated_gas, idempotency_key, tx_hash)
       VALUES ($1, $2, 'confirmed', $3, $4, $5, 'batch:seed-history', $6)
       ON CONFLICT (id) DO UPDATE
         SET payout_count = EXCLUDED.payout_count,
             total_micro = EXCLUDED.total_micro`,
      [
        batchId,
        DEFAULT_PLATFORM_ID,
        paidPayouts.rows.length,
        total,
        28_000 * paidPayouts.rows.length,
        '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
      ],
    );

    const placeholders = ids.map((_, i) => `$${i + 3}`).join(', ');
    await db.query(
      `UPDATE payouts
          SET batch_id = $1, state = 'confirmed'
        WHERE platform_id = $2 AND id IN (${placeholders})`,
      [batchId, DEFAULT_PLATFORM_ID, ...ids],
    );
  }

  return { platformId: DEFAULT_PLATFORM_ID, apiKey };
}
