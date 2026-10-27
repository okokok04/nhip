import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { type Database, PgErrorCode, isPgError } from './client.ts';
import { migrate } from './migrate.ts';
import { PgliteDatabase } from './pglite.ts';

let db: Database;

before(async () => {
  db = await PgliteDatabase.create();
  await migrate(db);
});

after(async () => {
  await db.close();
});

async function seedPlatform(id = 'plat_test'): Promise<string> {
  await db.query(
    `INSERT INTO platforms (id, name, api_key_hash) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [id, 'Test Platform', `hash_${id}`],
  );
  return id;
}

async function seedWorker(platformId: string, id = 'wrk_test', address: string | null = null): Promise<string> {
  await db.query(
    `INSERT INTO workers (id, platform_id, external_id, address) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [id, platformId, `ext_${id}`, address],
  );
  return id;
}

describe('migrate', () => {
  it('chạy lần hai không lỗi và không áp dụng lại', async () => {
    const second = await migrate(db);
    assert.equal(second.applied.length, 0);
    assert.ok(second.skipped.length >= 1);
  });

  it('tạo đủ bảng', async () => {
    const result = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
    );
    const names = result.rows.map((row) => row.table_name);
    for (const expected of ['platforms', 'workers', 'batches', 'payouts', 'audit_log', 'schema_migrations']) {
      assert.ok(names.includes(expected), `thiếu bảng ${expected}`);
    }
  });
});

describe('ràng buộc do DB thi hành, không do code', () => {
  it('từ chối hai payout cùng idempotency key (UNIQUE)', async () => {
    const platformId = await seedPlatform();
    const workerId = await seedWorker(platformId);

    const insert = (id: string) =>
      db.query(
        `INSERT INTO payouts (id, platform_id, worker_id, amount_micro, idempotency_key)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, platformId, workerId, 1_000_000n.toString(), 'dup-key-1'],
      );

    await insert('pay_1');

    await assert.rejects(insert('pay_2'), (error: unknown) => {
      assert.ok(isPgError(error, PgErrorCode.UNIQUE_VIOLATION), `mong đợi 23505, nhận ${String(error)}`);
      return true;
    });
  });

  it('từ chối địa chỉ ví có chữ hoa (CHECK)', async () => {
    const platformId = await seedPlatform('plat_case');
    await assert.rejects(
      db.query(
        `INSERT INTO workers (id, platform_id, external_id, address) VALUES ($1, $2, $3, $4)`,
        ['wrk_case', platformId, 'ext_case', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'],
      ),
      (error: unknown) => {
        assert.ok(isPgError(error, PgErrorCode.CHECK_VIOLATION));
        return true;
      },
    );
  });

  it('từ chối amount_micro <= 0 (CHECK)', async () => {
    const platformId = await seedPlatform('plat_amount');
    const workerId = await seedWorker(platformId, 'wrk_amount');
    await assert.rejects(
      db.query(
        `INSERT INTO payouts (id, platform_id, worker_id, amount_micro, idempotency_key)
         VALUES ($1, $2, $3, $4, $5)`,
        ['pay_zero', platformId, workerId, '0', 'zero-key'],
      ),
      (error: unknown) => {
        assert.ok(isPgError(error, PgErrorCode.CHECK_VIOLATION));
        return true;
      },
    );
  });

  it('từ chối payout ở trạng thái queued mà đã có batch_id (CHECK)', async () => {
    const platformId = await seedPlatform('plat_consistency');
    const workerId = await seedWorker(platformId, 'wrk_consistency');
    await db.query(
      `INSERT INTO batches (id, platform_id, payout_count, total_micro, estimated_gas, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ['bat_1', platformId, 1, '1000000', '28000', 'batch-key-1'],
    );

    await assert.rejects(
      db.query(
        `INSERT INTO payouts (id, platform_id, worker_id, batch_id, amount_micro, idempotency_key, state)
         VALUES ($1, $2, $3, $4, $5, $6, 'queued')`,
        ['pay_bad', platformId, workerId, 'bat_1', '1000000', 'consistency-key'],
      ),
      (error: unknown) => {
        assert.ok(isPgError(error, PgErrorCode.CHECK_VIOLATION));
        return true;
      },
    );
  });

  it('từ chối hai worker cùng external_id trong một platform (UNIQUE)', async () => {
    const platformId = await seedPlatform('plat_worker_dup');
    await db.query(
      `INSERT INTO workers (id, platform_id, external_id) VALUES ($1, $2, $3)`,
      ['wrk_a', platformId, 'same-external-id'],
    );
    await assert.rejects(
      db.query(`INSERT INTO workers (id, platform_id, external_id) VALUES ($1, $2, $3)`, [
        'wrk_b',
        platformId,
        'same-external-id',
      ]),
      (error: unknown) => {
        assert.ok(isPgError(error, PgErrorCode.UNIQUE_VIOLATION));
        return true;
      },
    );
  });

  it('cho phép cùng external_id ở hai platform khác nhau', async () => {
    const first = await seedPlatform('plat_iso_a');
    const second = await seedPlatform('plat_iso_b');
    await db.query(`INSERT INTO workers (id, platform_id, external_id) VALUES ($1, $2, $3)`, [
      'wrk_iso_a',
      first,
      'shared-ext',
    ]);
    await db.query(`INSERT INTO workers (id, platform_id, external_id) VALUES ($1, $2, $3)`, [
      'wrk_iso_b',
      second,
      'shared-ext',
    ]);

    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM workers WHERE external_id = 'shared-ext'`,
    );
    assert.equal(count.rows[0]?.n, '2');
  });

  it('từ chối hai batch cùng idempotency key (migration 002)', async () => {
    const platformId = await seedPlatform('plat_batch_dup');
    const insert = (id: string) =>
      db.query(
        `INSERT INTO batches (id, platform_id, payout_count, total_micro, estimated_gas, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, platformId, 1, '1000000', '28000', 'same-batch-key'],
      );

    await insert('bat_dup_1');
    await assert.rejects(insert('bat_dup_2'), (error: unknown) => {
      assert.ok(isPgError(error, PgErrorCode.UNIQUE_VIOLATION));
      return true;
    });
  });

  it('bắt buộc batch phải có idempotency key (migration 002)', async () => {
    const platformId = await seedPlatform('plat_batch_notnull');
    await assert.rejects(
      db.query(
        `INSERT INTO batches (id, platform_id, payout_count, total_micro, estimated_gas)
         VALUES ($1, $2, $3, $4, $5)`,
        ['bat_no_key', platformId, 1, '1000000', '28000'],
      ),
      (error: unknown) => {
        assert.ok(isPgError(error, PgErrorCode.NOT_NULL_VIOLATION));
        return true;
      },
    );
  });

  it('cả bốn migration đã được áp dụng, đúng thứ tự', async () => {
    const result = await db.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version');
    const versions = result.rows.map((row) => row.version);
    assert.deepEqual(versions, [
      '001_init.sql',
      '002_batch_idempotency.sql',
      '003_batch_request_key.sql',
      '004_settlement.sql',
    ]);
  });

  it('migration 004: lô simulated KHÔNG được mang tx_hash', async () => {
    // Đây là toàn bộ ý nghĩa của nhãn: dữ liệu demo không bao giờ trông như đã lên chain.
    const platformId = await seedPlatform('plat_sim_hash');

    await assert.rejects(
      db.query(
        `INSERT INTO batches
           (id, platform_id, state, payout_count, total_micro, estimated_gas,
            idempotency_key, settlement_mode, tx_hash)
         VALUES ($1, $2, 'confirmed', 1, '1000000', '75000', $3, 'simulated', $4)`,
        ['bat_sim_hash', platformId, 'idem_sim_hash', `0x${'ab'.repeat(32)}`],
      ),
      (error: unknown) => {
        assert.ok(isPgError(error, PgErrorCode.CHECK_VIOLATION), `mong đợi 23514, nhận ${String(error)}`);
        return true;
      },
    );
  });

  it('migration 004: báo giá phải đủ bộ — nửa báo giá bị từ chối', async () => {
    const platformId = await seedPlatform('plat_partial_quote');
    await db.query(
      `INSERT INTO batches (id, platform_id, payout_count, total_micro, estimated_gas, idempotency_key)
       VALUES ($1, $2, 1, '1000000', '75000', $3)`,
      ['bat_partial_quote', platformId, 'idem_partial_quote'],
    );

    await assert.rejects(
      db.query(`UPDATE batches SET quoted_gas = 75000 WHERE id = $1`, ['bat_partial_quote']),
      (error: unknown) => {
        assert.ok(isPgError(error, PgErrorCode.CHECK_VIOLATION), 'chỉ có gas mà thiếu giá/phí/thời điểm');
        return true;
      },
    );

    // Đủ bộ thì hợp lệ.
    await db.query(
      `UPDATE batches
          SET quoted_gas = 75000, quoted_gas_price_wei = '25000000000',
              quoted_fee_wei = '1875000000000000', quoted_at = now()
        WHERE id = $1`,
      ['bat_partial_quote'],
    );
  });

  it('migration 004: payout confirmed phải có tx_hash, trừ khi lô của nó là simulated', async () => {
    const platformId = await seedPlatform('plat_tx_evidence');
    const workerId = await seedWorker(platformId, 'wrk_tx_evidence');

    await db.query(
      `INSERT INTO batches
         (id, platform_id, payout_count, total_micro, estimated_gas, idempotency_key, settlement_mode)
       VALUES ($1, $2, 1, '1000000', '75000', $3, 'unsettled')`,
      ['bat_tx_evidence', platformId, 'idem_bat_tx_evidence'],
    );
    await db.query(
      `INSERT INTO payouts (id, platform_id, worker_id, batch_id, amount_micro, idempotency_key, state)
       VALUES ($1, $2, $3, $4, '1000000', $5, 'batched')`,
      ['pay_tx_evidence', platformId, workerId, 'bat_tx_evidence', 'idem_pay_tx_evidence'],
    );

    // Không có bằng chứng thì không được gọi là đã trả.
    await assert.rejects(
      db.query(`UPDATE payouts SET state = 'confirmed' WHERE id = $1`, ['pay_tx_evidence']),
      (error: unknown) => {
        assert.ok(isPgError(error, PgErrorCode.CHECK_VIOLATION), `mong đợi 23514, nhận ${String(error)}`);
        return true;
      },
    );

    // Có hash thì hợp lệ.
    await db.query(`UPDATE payouts SET state = 'confirmed', tx_hash = $2 WHERE id = $1`, [
      'pay_tx_evidence',
      `0x${'cd'.repeat(32)}`,
    ]);

    // Dữ liệu demo được miễn: nó không tuyên bố đã lên chain.
    await db.query(`UPDATE batches SET settlement_mode = 'simulated' WHERE id = $1`, [
      'bat_tx_evidence',
    ]);
    await db.query(`UPDATE payouts SET state = 'confirmed', tx_hash = NULL WHERE id = $1`, [
      'pay_tx_evidence',
    ]);

    const row = await db.query<{ state: string; tx_hash: string | null }>(
      `SELECT state, tx_hash FROM payouts WHERE id = $1`,
      ['pay_tx_evidence'],
    );
    assert.equal(row.rows[0]?.state, 'confirmed');
    assert.equal(row.rows[0]?.tx_hash, null);
  });

  it('migration 003: từ chối hai lô cùng (request_key, chunk_index)', async () => {
    const platformId = await seedPlatform('plat_reqkey_dup');
    const insert = (id: string, chunkIndex: number) =>
      db.query(
        `INSERT INTO batches
           (id, platform_id, payout_count, total_micro, estimated_gas, idempotency_key, request_key, chunk_index)
         VALUES ($1, $2, 1, '1000000', '28000', $3, 'req-key-1', $4)`,
        [id, platformId, `idem_${id}`, chunkIndex],
      );

    await insert('bat_req_0', 0);
    // Cùng request, khác chunk → hợp lệ. Một request được phép sinh nhiều lô.
    await insert('bat_req_1', 1);

    await assert.rejects(insert('bat_req_dup', 0), (error: unknown) => {
      assert.ok(isPgError(error, PgErrorCode.UNIQUE_VIOLATION), `mong đợi 23505, nhận ${String(error)}`);
      return true;
    });
  });

  it('migration 003: lô không có request_key vẫn insert được (partial index)', async () => {
    // Lô do seeder hoặc job nội bộ tạo không có request_key. Nếu index là UNIQUE
    // toàn phần, hai lô như vậy với chunk_index mặc định 0 sẽ đụng nhau.
    const platformId = await seedPlatform('plat_reqkey_null');
    for (const id of ['bat_null_1', 'bat_null_2']) {
      await db.query(
        `INSERT INTO batches (id, platform_id, payout_count, total_micro, estimated_gas, idempotency_key)
         VALUES ($1, $2, 1, '1000000', '28000', $3)`,
        [id, platformId, `idem_${id}`],
      );
    }
    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM batches WHERE platform_id = $1 AND request_key IS NULL`,
      [platformId],
    );
    assert.equal(count.rows[0]?.n, '2');
  });
});

describe('transaction', () => {
  it('rollback khi callback throw', async () => {
    const platformId = await seedPlatform('plat_tx');

    await assert.rejects(
      db.transaction(async (tx) => {
        await tx.query(`INSERT INTO audit_log (actor, action, target) VALUES ('test', 'x', 'y')`);
        throw new Error('cố tình hỏng');
      }),
    );

    const result = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM audit_log WHERE actor = 'test' AND target = 'y'`,
    );
    assert.equal(result.rows[0]?.n, '0', 'rollback phải xoá bản ghi');
    assert.ok(platformId);
  });

  it('commit khi callback thành công', async () => {
    await db.transaction(async (tx) => {
      await tx.query(`INSERT INTO audit_log (actor, action, target) VALUES ('test', 'ok', 'commit-target')`);
    });
    const result = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM audit_log WHERE target = 'commit-target'`,
    );
    assert.equal(result.rows[0]?.n, '1');
  });
});
