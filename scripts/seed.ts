/**
 * Seed dữ liệu mẫu để mở `npm run dev` là có thứ để nhìn.
 *
 * Chạy trên PGlite với `DATABASE_DIR` (mặc định `./.data/nhip`). Dùng cùng thư mục
 * với `npm run dev` để dữ liệu còn nguyên sau khi tắt server.
 *
 * Script này **in API key ra stdout đúng một lần**. Không có cách nào đọc lại:
 * DB chỉ lưu sha256. Đó là chủ ý — một key đọc lại được là một key nằm trong log
 * của ai đó.
 */

import { randomBytes } from 'node:crypto';

import { hashApiKey } from '../apps/api/src/auth.ts';
import { ID_PREFIX, newId } from '../packages/core/src/ids.ts';
import { migrate } from '../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../packages/db/src/pglite.ts';
import { micro } from '../packages/core/src/money.ts';
import { upsertPayout } from '../apps/api/src/payouts.repo.ts';
import { upsertWorker } from '../apps/api/src/workers.repo.ts';

const dataDir = process.env.DATABASE_DIR ?? './.data/nhip';
const API_KEY = `nhip_sk_${randomBytes(24).toString('hex')}`;
const PLATFORM_ID = 'plat_demo';

const db = await PgliteDatabase.create({ dataDir });
const migrated = await migrate(db);

process.stdout.write(
  `${JSON.stringify({ level: 'info', message: 'migrated', applied: migrated.applied.length, skipped: migrated.skipped.length })}\n`,
);

// Upsert platform để chạy lại script không tạo bản ghi thứ hai, nhưng vẫn xoay key.
await db.query(
  `INSERT INTO platforms (id, name, api_key_hash, address, batch_size, batch_interval_ms, gas_budget)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   ON CONFLICT (id) DO UPDATE
     SET name = EXCLUDED.name,
         api_key_hash = EXCLUDED.api_key_hash,
         address = EXCLUDED.address`,
  [
    PLATFORM_ID,
    'Giao Hàng Nhanh (demo)',
    hashApiKey(API_KEY),
    '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
    200,
    2000,
    '10000000',
  ],
);

const WORKERS = [
  { externalId: 'driver-001', name: 'Nguyễn Văn An', address: '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed' },
  { externalId: 'driver-002', name: 'Trần Thị Bình', address: '0x1234567890abcdef1234567890abcdef12345678' },
  { externalId: 'driver-003', name: 'Lê Minh Cường', address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
  { externalId: 'driver-004', name: 'Phạm Thu Dung', address: '0x9876543210fedcba9876543210fedcba98765432' },
  { externalId: 'driver-005', name: 'Hoàng Gia Hân', address: null },
] as const;

const workerIds: string[] = [];
for (const worker of WORKERS) {
  const { worker: row } = await upsertWorker(db, {
    id: newId(ID_PREFIX.WORKER),
    platformId: PLATFORM_ID,
    externalId: worker.externalId,
    address: worker.address as `0x${string}` | null,
    displayName: worker.name,
  });
  workerIds.push(row.id);
}

/**
 * 40 payout đã trả (có lô + tx hash giả định) và 12 payout đang chờ.
 *
 * Payout chờ là phần quan trọng nhất để nhìn: đó là hàng đợi thật mà worker nền
 * sẽ gửi đi. Nếu seed chỉ có dữ liệu đã xong, dashboard luôn trông "sạch" và
 * không ai thấy được trạng thái đang chạy.
 */
const PAID_KEYS = Array.from({ length: 40 }, (_, index) => `seed-paid-${String(index).padStart(3, '0')}`);
const QUEUED_KEYS = Array.from({ length: 12 }, (_, index) => `seed-queued-${String(index).padStart(3, '0')}`);

for (let index = 0; index < PAID_KEYS.length; index++) {
  const workerId = workerIds[index % workerIds.length];
  if (!workerId) continue;
  const amount = micro(BigInt(45_000 + ((index * 7_500) % 180_000)) * 1_000n);
  await upsertPayout(db, {
    id: newId(ID_PREFIX.PAYOUT),
    platformId: PLATFORM_ID,
    workerId,
    amountMicro: amount,
    idempotencyKey: PAID_KEYS[index] ?? `seed-paid-${index}`,
    reference: `Đơn #${20260 + index}`,
  });
}

// Đánh dấu 40 payout đầu là đã trả trong một lô, để dashboard có dữ liệu lịch sử.
const paidPayouts = await db.query<{ id: string }>(
  `SELECT id FROM payouts
    WHERE platform_id = $1 AND idempotency_key = ANY($2::text[])
    ORDER BY id`,
  [PLATFORM_ID, PAID_KEYS],
);

if (paidPayouts.rows.length > 0) {
  // Tìm lô lịch sử theo `idempotency_key` chứ không theo id: lần chạy đầu đã tạo lô
  // với id ngẫu nhiên, và `tx_hash` là UNIQUE nên insert thêm sẽ đỏ. Cách này chạy
  // đúng trên cả database mới và database đã seed.
  const existingHistory = await db.query<{ id: string }>(
    `SELECT id FROM batches
      WHERE platform_id = $1 AND idempotency_key = 'batch:seed-history'
      LIMIT 1`,
    [PLATFORM_ID],
  );
  const batchId = existingHistory.rows[0]?.id ?? 'bat_seed_history';
  const ids = paidPayouts.rows.map((row) => row.id);
  const totals = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_micro), 0)::text AS total FROM payouts WHERE id = ANY($1::text[])`,
    [ids],
  );
  const total = totals.rows[0]?.total ?? '0';

  await db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO batches
         (id, platform_id, state, payout_count, total_micro, estimated_gas,
          tx_hash, block_number, gas_used, confirmed_at, idempotency_key)
       VALUES ($1, $2, 'confirmed', $3, $4, $5, $6, $7, $8, now(), $9)
       ON CONFLICT (id) DO UPDATE
         SET payout_count = EXCLUDED.payout_count,
             total_micro  = EXCLUDED.total_micro,
             estimated_gas = EXCLUDED.estimated_gas`,
      [
        batchId,
        PLATFORM_ID,
        ids.length,
        total,
        (BigInt(ids.length) * 28_000n).toString(),
        `0x${'ab'.repeat(32)}`,
        1_234_567,
        (BigInt(ids.length) * 24_850n).toString(),
        'batch:seed-history',
      ],
    );
    await tx.query(
      `UPDATE payouts SET batch_id = $1, state = 'confirmed', confirmed_at = now()
        WHERE platform_id = $2 AND id = ANY($3::text[])`,
      [batchId, PLATFORM_ID, ids],
    );
  });
}

// Hàng đợi: 12 payout chưa vào lô.
for (let index = 0; index < QUEUED_KEYS.length; index++) {
  const workerId = workerIds[index % workerIds.length];
  if (!workerId) continue;
  await upsertPayout(db, {
    id: newId(ID_PREFIX.PAYOUT),
    platformId: PLATFORM_ID,
    workerId,
    amountMicro: micro(BigInt(60_000 + index * 4_000) * 1_000n),
    idempotencyKey: QUEUED_KEYS[index] ?? `seed-queued-${index}`,
    reference: `Đơn #${20300 + index}`,
  });
}

const counts = await db.query<{ workers: string; payouts: string; batches: string }>(
  `SELECT (SELECT COUNT(*)::text FROM workers WHERE platform_id = $1) AS workers,
          (SELECT COUNT(*)::text FROM payouts WHERE platform_id = $1) AS payouts,
          (SELECT COUNT(*)::text FROM batches WHERE platform_id = $1) AS batches`,
  [PLATFORM_ID],
);

await db.close();

process.stdout.write(
  [
    '',
    '  Seed xong.',
    '',
    `  workers : ${counts.rows[0]?.workers ?? '0'}`,
    `  payouts : ${counts.rows[0]?.payouts ?? '0'}`,
    `  batches : ${counts.rows[0]?.batches ?? '0'}`,
    '',
    '  API key (chỉ in một lần, không đọc lại được):',
    '',
    `    ${API_KEY}`,
    '',
    '  Dùng:',
    '',
    `    curl -H "Authorization: Bearer ${API_KEY}" http://localhost:3000/v1/me`,
    '',
    `  Dữ liệu nằm ở: ${dataDir}`,
    '  Chạy lại script này không nhân đôi dữ liệu, chỉ xoay API key.',
    '',
  ].join('\n'),
);
