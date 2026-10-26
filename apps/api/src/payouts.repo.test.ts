import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Database } from '../../../packages/db/src/client.ts';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import { micro } from '../../../packages/core/src/money.ts';
import { findPayoutById, listPayouts, upsertPayout } from './payouts.repo.ts';

const PLATFORM = 'plat_payouts_repo';
const OTHER_PLATFORM = 'plat_payouts_repo_other';

let db: Database;

before(async () => {
  db = await PgliteDatabase.create();
  await migrate(db);

  for (const id of [PLATFORM, OTHER_PLATFORM]) {
    await db.query(`INSERT INTO platforms (id, name, api_key_hash) VALUES ($1, $2, $3)`, [
      id,
      `Nền tảng ${id}`,
      `hash_${id}`,
    ]);
  }
});

after(async () => {
  await db.close();
});

let counter = 0;

async function seedWorker(platformId = PLATFORM): Promise<string> {
  counter += 1;
  const id = `wrk_repo_${counter}`;
  await db.query(`INSERT INTO workers (id, platform_id, external_id) VALUES ($1, $2, $3)`, [
    id,
    platformId,
    `ext_repo_${counter}`,
  ]);
  return id;
}

describe('upsertPayout — idempotency do DB thi hành', () => {
  it('lần đầu tạo mới, duplicate = false', async () => {
    const workerId = await seedWorker();
    const { payout, duplicate } = await upsertPayout(db, {
      id: 'pay_first',
      platformId: PLATFORM,
      workerId,
      amountMicro: micro(1_650_750n),
      idempotencyKey: 'idem-first-0001',
    });

    assert.equal(duplicate, false);
    assert.equal(payout.id, 'pay_first');
    assert.equal(payout.state, 'queued');
    assert.equal(payout.amount_micro, '1650750');
  });

  it('cùng key lần hai → trả lại ĐÚNG bản ghi cũ, không tạo dòng mới', async () => {
    const workerId = await seedWorker();
    const first = await upsertPayout(db, {
      id: 'pay_second',
      platformId: PLATFORM,
      workerId,
      amountMicro: micro(500_000n),
      idempotencyKey: 'idem-second-0001',
    });

    // Retry nhưng id và số tiền khác: đây chính là tình huống nguy hiểm —
    // client sinh id mới cho cùng một payout vì lần trước timeout.
    const retry = await upsertPayout(db, {
      id: 'pay_second_retry',
      platformId: PLATFORM,
      workerId,
      amountMicro: micro(999_999n),
      idempotencyKey: 'idem-second-0001',
    });

    assert.equal(retry.duplicate, true);
    assert.equal(retry.payout.id, first.payout.id, 'phải trả id của bản ghi gốc');
    assert.equal(retry.payout.amount_micro, '500000', 'không được ghi đè số tiền');

    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM payouts WHERE platform_id = $1 AND idempotency_key = $2`,
      [PLATFORM, 'idem-second-0001'],
    );
    assert.equal(count.rows[0]?.n, '1');
  });

  it('10 request SONG SONG cùng key → đúng 1 payout trong DB', async () => {
    const workerId = await seedWorker();
    const attempts = 10;

    const results = await Promise.all(
      Array.from({ length: attempts }, (_, index) =>
        upsertPayout(db, {
          id: `pay_race_${index}`,
          platformId: PLATFORM,
          workerId,
          amountMicro: micro(100_000n + BigInt(index)),
          idempotencyKey: 'idem-race-0001',
        }),
      ),
    );

    const ids = new Set(results.map((result) => result.payout.id));
    assert.equal(ids.size, 1, `10 request phải trả về cùng một id, nhận ${ids.size} id khác nhau`);

    const created = results.filter((result) => !result.duplicate);
    assert.equal(created.length, 1, 'chỉ đúng một request được coi là tạo mới');

    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM payouts WHERE platform_id = $1 AND idempotency_key = $2`,
      [PLATFORM, 'idem-race-0001'],
    );
    assert.equal(count.rows[0]?.n, '1');
  });

  it('hai platform khác nhau dùng cùng key → hai payout riêng biệt', async () => {
    // Idempotency-Key là không gian tên của từng nền tảng. Nếu key là unique toàn cục,
    // một nền tảng có thể "đoán" key của nền tảng khác và chặn payout của họ.
    const workerA = await seedWorker(PLATFORM);
    const workerB = await seedWorker(OTHER_PLATFORM);

    const a = await upsertPayout(db, {
      id: 'pay_iso_plat_a',
      platformId: PLATFORM,
      workerId: workerA,
      amountMicro: micro(1n),
      idempotencyKey: 'idem-shared-key',
    });
    const b = await upsertPayout(db, {
      id: 'pay_iso_plat_b',
      platformId: OTHER_PLATFORM,
      workerId: workerB,
      amountMicro: micro(2n),
      idempotencyKey: 'idem-shared-key',
    });

    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, false);
    assert.notEqual(a.payout.id, b.payout.id);
  });

  it('giữ reference, và cho phép reference rỗng', async () => {
    const workerId = await seedWorker();
    const withRef = await upsertPayout(db, {
      id: 'pay_ref_yes',
      platformId: PLATFORM,
      workerId,
      amountMicro: micro(1n),
      idempotencyKey: 'idem-ref-yes',
      reference: 'đơn 2026-10-27 #0042',
    });
    const withoutRef = await upsertPayout(db, {
      id: 'pay_ref_no',
      platformId: PLATFORM,
      workerId,
      amountMicro: micro(1n),
      idempotencyKey: 'idem-ref-no',
    });

    assert.equal(withRef.payout.reference, 'đơn 2026-10-27 #0042');
    assert.equal(withoutRef.payout.reference, null);
  });
});

describe('findPayoutById', () => {
  it('không trả payout của nền tảng khác', async () => {
    const workerId = await seedWorker();
    await upsertPayout(db, {
      id: 'pay_scoped',
      platformId: PLATFORM,
      workerId,
      amountMicro: micro(1n),
      idempotencyKey: 'idem-scoped',
    });

    assert.ok(await findPayoutById(db, PLATFORM, 'pay_scoped'));
    assert.equal(
      await findPayoutById(db, OTHER_PLATFORM, 'pay_scoped'),
      null,
      'query phải scoped theo platform — nếu không, biết id là đọc được payout người khác',
    );
  });
});

describe('listPayouts — cursor, không OFFSET', () => {
  const PAGINATION_PLATFORM = 'plat_pagination';

  before(async () => {
    await db.query(`INSERT INTO platforms (id, name, api_key_hash) VALUES ($1, $2, $3)`, [
      PAGINATION_PLATFORM,
      'Phân trang',
      'hash_pagination',
    ]);
    await db.query(`INSERT INTO workers (id, platform_id, external_id) VALUES ($1, $2, $3)`, [
      'wrk_pagination',
      PAGINATION_PLATFORM,
      'ext_pagination',
    ]);
  });

  async function insertPayout(id: string, createdAt: string, workerId = 'wrk_pagination'): Promise<void> {
    await db.query(
      `INSERT INTO payouts (id, platform_id, worker_id, amount_micro, idempotency_key, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, PAGINATION_PLATFORM, workerId, '1000', `key_${id}`, createdAt],
    );
  }

  it('đi hết các trang không lặp và không mất dòng', async () => {
    // created_at cố định để test không phụ thuộc tốc độ máy.
    for (let index = 0; index < 7; index++) {
      await insertPayout(`pay_page_${index}`, `2026-10-01T00:00:0${index}.000Z`);
    }

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;

    do {
      const page = await listPayouts(db, PAGINATION_PLATFORM, { limit: 3, cursor });
      pages += 1;
      assert.ok(page.rows.length <= 3, 'không được vượt limit');
      seen.push(...page.rows.map((row) => row.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    assert.equal(pages, 3, '7 dòng với limit 3 phải là 3 trang');
    assert.equal(seen.length, 7, `mất dòng: chỉ thấy ${seen.length}/7`);
    assert.equal(new Set(seen).size, 7, 'có dòng bị lặp giữa hai trang');
    // Mới nhất trước.
    assert.equal(seen[0], 'pay_page_6');
  });

  it('lọc theo workerId', async () => {
    await db.query(`INSERT INTO workers (id, platform_id, external_id) VALUES ($1, $2, $3)`, [
      'wrk_pagination_other',
      PAGINATION_PLATFORM,
      'ext_pagination_other',
    ]);
    await insertPayout('pay_other_worker', '2026-10-02T00:00:00.000Z', 'wrk_pagination_other');

    const page = await listPayouts(db, PAGINATION_PLATFORM, {
      workerId: 'wrk_pagination_other',
      limit: 10,
    });
    assert.equal(page.rows.length, 1);
    assert.equal(page.rows[0]?.id, 'pay_other_worker');
  });

  it('không trả payout của nền tảng khác', async () => {
    await db.query(`INSERT INTO platforms (id, name, api_key_hash) VALUES ($1, $2, $3)`, [
      'plat_totally_empty',
      'Nền tảng rỗng',
      'hash_totally_empty',
    ]);
    const page = await listPayouts(db, 'plat_totally_empty', { limit: 10 });
    assert.equal(page.rows.length, 0);
  });

  it('không có dòng nào → nextCursor null', async () => {
    const page = await listPayouts(db, 'plat_khong_ton_tai', { limit: 10 });
    assert.deepEqual(page.rows, []);
    assert.equal(page.nextCursor, null);
  });
});
