import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Address } from '../../../packages/core/src/address.ts';
import type { Database } from '../../../packages/db/src/client.ts';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import { findWorkerById, findWorkerByExternalId, upsertWorker } from './workers.repo.ts';

const PLATFORM = 'plat_workers_repo';
const OTHER = 'plat_workers_repo_other';

let db: Database;

before(async () => {
  db = await PgliteDatabase.create();
  await migrate(db);
  for (const id of [PLATFORM, OTHER]) {
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

const ADDRESS_A = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed' as Address;
const ADDRESS_B = '0x1234567890abcdef1234567890abcdef12345678' as Address;

describe('upsertWorker', () => {
  it('lần đầu tạo mới', async () => {
    const { worker, created } = await upsertWorker(db, {
      id: 'wrk_new',
      platformId: PLATFORM,
      externalId: 'driver-001',
      address: ADDRESS_A,
      displayName: 'Nguyễn Văn A',
    });

    assert.equal(created, true);
    assert.equal(worker.address, ADDRESS_A);
    assert.equal(worker.display_name, 'Nguyễn Văn A');
  });

  it('cùng externalId lần hai → cập nhật, KHÔNG tạo người thứ hai', async () => {
    const second = await upsertWorker(db, {
      id: 'wrk_should_be_ignored',
      platformId: PLATFORM,
      externalId: 'driver-001',
      address: ADDRESS_B,
      displayName: 'Nguyễn Văn A (đã đổi ví)',
    });

    assert.equal(second.created, false);
    assert.equal(second.worker.id, 'wrk_new', 'id phải giữ nguyên — lịch sử trả lương không được chẻ đôi');
    assert.equal(second.worker.address, ADDRESS_B, 'đổi ví phải là UPDATE, không phải người mới');

    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM workers WHERE platform_id = $1 AND external_id = $2`,
      [PLATFORM, 'driver-001'],
    );
    assert.equal(count.rows[0]?.n, '1');
  });

  it('không gửi địa chỉ → giữ địa chỉ cũ, không xoá trắng', async () => {
    const result = await upsertWorker(db, {
      id: 'wrk_ignore',
      platformId: PLATFORM,
      externalId: 'driver-001',
      displayName: 'Chỉ đổi tên',
    });

    assert.equal(result.created, false);
    assert.equal(result.worker.address, ADDRESS_B, 'thiếu field không có nghĩa là xoá');
    assert.equal(result.worker.display_name, 'Chỉ đổi tên');
  });

  it('cùng externalId ở hai platform → hai người khác nhau', async () => {
    const other = await upsertWorker(db, {
      id: 'wrk_other_platform',
      platformId: OTHER,
      externalId: 'driver-001',
    });
    assert.equal(other.created, true);
    assert.notEqual(other.worker.id, 'wrk_new');
  });

  it('externalId trùng trong DB nhưng khác chữ hoa/thường vẫn là hai người', async () => {
    // Ghi lại hành vi thay vì hứa hẹn điều không có: `external_id` là TEXT,
    // nên "ABC" và "abc" là hai bản ghi. Nếu nền tảng muốn chống việc này,
    // họ phải chuẩn hoá trước khi gọi — DB không tự làm.
    const upper = await upsertWorker(db, {
      id: 'wrk_upper',
      platformId: PLATFORM,
      externalId: 'DRIVER-002',
    });
    const lower = await upsertWorker(db, {
      id: 'wrk_lower',
      platformId: PLATFORM,
      externalId: 'driver-002',
    });

    assert.equal(upper.created, true);
    assert.equal(lower.created, true);
  });
});

describe('truy vấn', () => {
  it('findWorkerById scoped theo platform', async () => {
    assert.ok(await findWorkerById(db, PLATFORM, 'wrk_new'));
    assert.equal(await findWorkerById(db, OTHER, 'wrk_new'), null);
  });

  it('findWorkerByExternalId trả đúng người trong platform', async () => {
    const found = await findWorkerByExternalId(db, OTHER, 'driver-001');
    assert.equal(found?.id, 'wrk_other_platform');
  });

  it('không tồn tại → null', async () => {
    assert.equal(await findWorkerById(db, PLATFORM, 'wrk_khong_ton_tai'), null);
    assert.equal(await findWorkerByExternalId(db, PLATFORM, 'khong-ton-tai'), null);
  });
});
