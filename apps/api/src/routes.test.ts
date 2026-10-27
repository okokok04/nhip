import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Database } from '../../../packages/db/src/client.ts';
import { migrate } from '../../../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import { createApp } from './app.ts';
import { hashApiKey } from './auth.ts';

const API_KEY = 'nhip_sk_routes_0123456789abcdef';
const OTHER_KEY = 'nhip_sk_routes_otherkey0123456';
const PLATFORM = 'plat_routes';
const OTHER_PLATFORM = 'plat_routes_other';

let db: Database;
let app: ReturnType<typeof createApp>;

before(async () => {
  db = await PgliteDatabase.create();
  await migrate(db);
  for (const [id, key] of [
    [PLATFORM, API_KEY],
    [OTHER_PLATFORM, OTHER_KEY],
  ] as const) {
    await db.query(`INSERT INTO platforms (id, name, api_key_hash) VALUES ($1, $2, $3)`, [
      id,
      `Nền tảng ${id}`,
      hashApiKey(key),
    ]);
  }
  app = createApp({ db, generateRequestId: () => 'req_routes_fixed' });
});

after(async () => {
  await db.close();
});

async function call(
  method: string,
  path: string,
  options: { key?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { authorization: `Bearer ${options.key ?? API_KEY}` };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  Object.assign(headers, options.headers ?? {});
  return await app.request(path, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

async function createWorker(externalId: string, key = API_KEY): Promise<string> {
  const res = await call('POST', '/v1/workers', { key, body: { externalId, displayName: externalId } });
  assert.equal(res.status, 201, `tạo worker ${externalId} phải trả 201`);
  const body = (await res.json()) as { id: string };
  return body.id;
}

describe('POST /v1/workers', () => {
  it('tạo mới → 201, upsert lần hai → 200 và cùng id', async () => {
    const first = await call('POST', '/v1/workers', { body: { externalId: 'upsert-me' } });
    assert.equal(first.status, 201);
    const created = (await first.json()) as { id: string; created: boolean };
    assert.equal(created.created, true);

    const second = await call('POST', '/v1/workers', { body: { externalId: 'upsert-me' } });
    assert.equal(second.status, 200);
    const updated = (await second.json()) as { id: string; created: boolean };
    assert.equal(updated.id, created.id);
    assert.equal(updated.created, false);
  });

  it('đổi ví là UPDATE, không tạo người mới', async () => {
    const first = await call('POST', '/v1/workers', {
      body: { externalId: 'doi-vi', address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' },
    });
    const created = (await first.json()) as { id: string; address: string };
    assert.equal(created.address, '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed', 'phải lowercase');

    const second = await call('POST', '/v1/workers', {
      body: { externalId: 'doi-vi', address: '0x1234567890abcdef1234567890abcdef12345678' },
    });
    const updated = (await second.json()) as { id: string; address: string };
    assert.equal(updated.id, created.id);
    assert.equal(updated.address, '0x1234567890abcdef1234567890abcdef12345678');
  });

  it('TỪ CHỐI zero address', async () => {
    const res = await call('POST', '/v1/workers', {
      body: { externalId: 'zero-addr', address: `0x${'0'.repeat(40)}` },
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string; details: { fields: { field: string }[] } } };
    assert.equal(body.error.code, 'VALIDATION_FAILED');
    assert.equal(body.error.details.fields[0]?.field, 'address');
  });

  it('thiếu externalId → 400 nói rõ trường nào', async () => {
    const res = await call('POST', '/v1/workers', { body: {} });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { details: { fields: { field: string }[] } } };
    assert.deepEqual(
      body.error.details.fields.map((f) => f.field),
      ['externalId'],
    );
  });
});

describe('POST /v1/payouts', () => {
  let workerId = '';

  before(async () => {
    workerId = await createWorker('payout-worker');
  });

  it('thiếu Idempotency-Key → 400, không tạo payout', async () => {
    const res = await call('POST', '/v1/payouts', { body: { workerId, amount_micro: '1000' } });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string; details: { fields: { field: string }[] } } };
    assert.equal(body.error.code, 'VALIDATION_FAILED');
    assert.equal(body.error.details.fields[0]?.field, 'Idempotency-Key');

    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM payouts WHERE platform_id = $1`,
      [PLATFORM],
    );
    assert.equal(count.rows[0]?.n, '0', 'request bị từ chối không được ghi gì');
  });

  it('amount_micro là number → 400 kèm gợi ý dùng chuỗi', async () => {
    const res = await call('POST', '/v1/payouts', {
      body: { workerId, amount_micro: 1650750 },
      headers: { 'idempotency-key': 'payout-number-0001' },
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { details: { fields: { message: string }[] } } };
    assert.match(body.error.details.fields[0]?.message ?? '', /chuỗi|number/);
  });

  it('amount_micro có dấu thập phân → 400, không cắt âm thầm', async () => {
    const res = await call('POST', '/v1/payouts', {
      body: { workerId, amount_micro: '1650.75' },
      headers: { 'idempotency-key': 'payout-float-0001' },
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { details: { fields: { message: string }[] } } };
    assert.match(body.error.details.fields[0]?.message ?? '', /micro/);
  });

  it('worker không thuộc nền tảng → 404 WORKER_NOT_FOUND', async () => {
    const res = await call('POST', '/v1/payouts', {
      body: { workerId: 'wrk_khong_ton_tai', amount_micro: '1000' },
      headers: { 'idempotency-key': 'payout-unknown-worker' },
    });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'WORKER_NOT_FOUND');
  });

  it('worker của nền tảng khác → 404 (không lộ sự tồn tại)', async () => {
    const foreignWorker = await createWorker('foreign-worker', OTHER_KEY);
    const res = await call('POST', '/v1/payouts', {
      body: { workerId: foreignWorker, amount_micro: '1000' },
      headers: { 'idempotency-key': 'payout-foreign-worker' },
    });
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { message: string } };
    assert.equal(body.error.message, 'Không tìm thấy người lao động này trong nền tảng.');
  });

  it('lần đầu → 202, retry cùng key → 200 duplicate:true và cùng id', async () => {
    const first = await call('POST', '/v1/payouts', {
      body: { workerId, amount_micro: '1650750', reference: 'đơn #1' },
      headers: { 'idempotency-key': 'payout-happy-0001' },
    });
    assert.equal(first.status, 202);
    const created = (await first.json()) as { id: string; duplicate: boolean; amount_micro: string };
    assert.equal(created.duplicate, false);
    assert.equal(created.amount_micro, '1650750');

    const retry = await call('POST', '/v1/payouts', {
      body: { workerId, amount_micro: '1650750', reference: 'đơn #1' },
      headers: { 'idempotency-key': 'payout-happy-0001' },
    });
    assert.equal(retry.status, 200, 'retry là 200, không phải 202');
    const repeated = (await retry.json()) as { id: string; duplicate: boolean };
    assert.equal(repeated.id, created.id);
    assert.equal(repeated.duplicate, true);
  });

  it('10 request SONG SONG cùng key → đúng 1 payout', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        call('POST', '/v1/payouts', {
          body: { workerId, amount_micro: '7000' },
          headers: { 'idempotency-key': 'payout-concurrent-0001' },
        }),
      ),
    );

    const statuses = responses.map((res) => res.status);
    assert.equal(statuses.filter((status) => status === 202).length, 1, 'chỉ một request tạo mới');
    assert.equal(statuses.filter((status) => status === 200).length, 9);

    const ids = new Set(
      await Promise.all(
        responses.map(async (res) => ((await res.json()) as { id: string }).id),
      ),
    );
    assert.equal(ids.size, 1, 'mọi request phải trả cùng một payout');

    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM payouts
        WHERE platform_id = $1 AND idempotency_key = 'payout-concurrent-0001'`,
      [PLATFORM],
    );
    assert.equal(count.rows[0]?.n, '1');
  });

  it('body không phải JSON → 400, không phải 500', async () => {
    const res = await app.request('/v1/payouts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${API_KEY}`,
        'idempotency-key': 'payout-bad-json',
        'content-type': 'application/json',
      },
      body: '{ khong-phai-json',
    });
    assert.equal(res.status, 400);
  });
});

describe('GET /v1/payouts', () => {
  it('trả danh sách có phân trang', async () => {
    const workerId = await createWorker('pagination-worker');
    for (let index = 0; index < 3; index++) {
      const res = await call('POST', '/v1/payouts', {
        body: { workerId, amount_micro: String(1000 + index) },
        headers: { 'idempotency-key': `payout-pagination-${index}` },
      });
      assert.equal(res.status, 202);
    }

    const res = await call('GET', `/v1/payouts?workerId=${workerId}&limit=2`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { payouts: unknown[]; nextCursor: string | null };
    assert.equal(body.payouts.length, 2);
    assert.ok(body.nextCursor, 'còn dòng thì phải có cursor');

    const next = await call('GET', `/v1/payouts?workerId=${workerId}&limit=2&cursor=${body.nextCursor}`);
    const lastPage = (await next.json()) as { payouts: unknown[]; nextCursor: string | null };
    assert.equal(lastPage.payouts.length, 1);
    assert.equal(lastPage.nextCursor, null, 'hết dòng thì cursor phải null');
  });

  it('cursor rác → 400, không phải 500', async () => {
    const res = await call('GET', '/v1/payouts?cursor=rac-khong-hop-le');
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'VALIDATION_FAILED');
  });

  it('GET theo id trả đúng payout', async () => {
    const created = await call('POST', '/v1/payouts', {
      body: { workerId: await createWorker('get-by-id'), amount_micro: '4242' },
      headers: { 'idempotency-key': 'payout-get-by-id' },
    });
    const { id } = (await created.json()) as { id: string };

    const res = await call('GET', `/v1/payouts/${id}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { id: string; amount_micro: string };
    assert.equal(body.id, id);
    assert.equal(body.amount_micro, '4242');
  });

  it('payout của nền tảng khác → 404', async () => {
    const created = await call('POST', '/v1/payouts', {
      body: { workerId: await createWorker('cross-tenant', OTHER_KEY), amount_micro: '99' },
      key: OTHER_KEY,
      headers: { 'idempotency-key': 'payout-cross-tenant' },
    });
    const { id } = (await created.json()) as { id: string };

    const res = await call('GET', `/v1/payouts/${id}`);
    assert.equal(res.status, 404);
  });
});

describe('POST /v1/batches', () => {
  let w1 = '';
  let w2 = '';

  before(async () => {
    w1 = await createWorker('batch-w1');
    w2 = await createWorker('batch-w2');
  });

  it('2 dòng đúng + 1 dòng lỗi → 2 accepted, 1 rejected, 207', async () => {
    const res = await call('POST', '/v1/batches', {
      headers: { 'idempotency-key': 'batch-partial-0001' },
      body: {
        payouts: [
          { workerId: w1, amount_micro: '1000000' },
          { workerId: w2, amount_micro: 'abc' },
          { workerId: w2, amount_micro: '2000000' },
        ],
      },
    });

    assert.equal(res.status, 207, 'một phần thành công là 207');
    const body = (await res.json()) as {
      batches: { id: string; payoutCount: number; total_micro: string }[];
      accepted: number;
      rejected: { index: number; code: string }[];
      duplicate: boolean;
    };

    assert.equal(body.accepted, 2);
    assert.equal(body.rejected.length, 1);
    assert.equal(body.rejected[0]?.index, 1, 'phải chỉ đúng dòng sai');
    assert.equal(body.rejected[0]?.code, 'VALIDATION_FAILED');

    const totalPayouts = body.batches.reduce((acc, batch) => acc + batch.payoutCount, 0);
    assert.equal(totalPayouts, 2);

    const sumMicro = body.batches.reduce((acc, batch) => acc + BigInt(batch.total_micro), 0n);
    assert.equal(sumMicro, 3_000_000n, 'tổng của các lô phải bằng tổng payout hợp lệ');
  });

  it('payout được tạo và gắn vào lô, trạng thái batched', async () => {
    const body = await (
      await call('POST', '/v1/batches', {
        headers: { 'idempotency-key': 'batch-state-0001' },
        body: { payouts: [{ workerId: w1, amount_micro: '500' }] },
      })
    ).json() as { batches: { id: string }[] };

    const batchId = body.batches[0]?.id;
    assert.ok(batchId);

    const payouts = await db.query<{ state: string; batch_id: string }>(
      `SELECT state, batch_id FROM payouts WHERE batch_id = $1`,
      [batchId],
    );
    assert.equal(payouts.rows.length, 1);
    assert.equal(payouts.rows[0]?.state, 'batched');
    assert.equal(payouts.rows[0]?.batch_id, batchId);
  });

  it('retry cùng key → 200, duplicate:true, không tạo thêm payout', async () => {
    const payload = { payouts: [{ workerId: w1, amount_micro: '777' }] };

    const first = await call('POST', '/v1/batches', {
      headers: { 'idempotency-key': 'batch-retry-0001' },
      body: payload,
    });
    assert.equal(first.status, 202);
    const created = (await first.json()) as { batches: { id: string }[] };

    const retry = await call('POST', '/v1/batches', {
      headers: { 'idempotency-key': 'batch-retry-0001' },
      body: payload,
    });
    assert.equal(retry.status, 200);
    const repeated = (await retry.json()) as {
      batches: { id: string }[];
      duplicate: boolean;
      accepted: number;
    };
    assert.equal(repeated.duplicate, true);
    assert.equal(repeated.batches[0]?.id, created.batches[0]?.id);
    assert.equal(repeated.accepted, 1);

    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM payouts p
         JOIN batches b ON b.id = p.batch_id
        WHERE b.request_key = 'batch-retry-0001'`,
    );
    assert.equal(count.rows[0]?.n, '1');
  });

  it('dùng lại key với payload khác → 409, không trả kết quả cũ', async () => {
    await call('POST', '/v1/batches', {
      headers: { 'idempotency-key': 'batch-conflict-0001' },
      body: { payouts: [{ workerId: w1, amount_micro: '100' }] },
    });

    const conflict = await call('POST', '/v1/batches', {
      headers: { 'idempotency-key': 'batch-conflict-0001' },
      body: { payouts: [{ workerId: w1, amount_micro: '999' }] },
    });
    assert.equal(conflict.status, 409);
    const body = (await conflict.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'DUPLICATE_IDEMPOTENCY');
  });

  it('tất cả dòng đều lỗi → 400, không tạo lô rỗng', async () => {
    const res = await call('POST', '/v1/batches', {
      headers: { 'idempotency-key': 'batch-all-bad-0001' },
      body: { payouts: [{ workerId: w1, amount_micro: '0' }] },
    });
    assert.equal(res.status, 400);

    const count = await db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM batches WHERE request_key = 'batch-all-bad-0001'`,
    );
    assert.equal(count.rows[0]?.n, '0');
  });

  it('mảng rỗng → 400', async () => {
    const res = await call('POST', '/v1/batches', {
      headers: { 'idempotency-key': 'batch-empty-0001' },
      body: { payouts: [] },
    });
    assert.equal(res.status, 400);
  });

  it('nhiều payout vượt trần lô → chia nhiều lô, tổng tiền bảo toàn', async () => {
    // gas_budget mặc định 10.000.000, gas 75.000/payout (cận trên đo trên Arc) → 133 payout/lô.
    const count = 300;
    const payouts = Array.from({ length: count }, (_, index) => ({
      workerId: w1,
      amount_micro: String(1_000_000 + index),
    }));
    const expected = payouts.reduce((acc, payout) => acc + BigInt(payout.amount_micro), 0n);

    const res = await call('POST', '/v1/batches', {
      headers: { 'idempotency-key': 'batch-many-0001' },
      body: { payouts },
    });
    assert.equal(res.status, 202);
    const body = (await res.json()) as { batches: { id: string; payoutCount: number; total_micro: string }[] };

    assert.ok(body.batches.length >= 3, `300 payout phải chia ít nhất 3 lô, nhận ${body.batches.length}`);

    const totalPayouts = body.batches.reduce((acc, batch) => acc + batch.payoutCount, 0);
    assert.equal(totalPayouts, count, 'không payout nào bị mất hoặc nhân đôi');

    const sumMicro = body.batches.reduce((acc, batch) => acc + BigInt(batch.total_micro), 0n);
    assert.equal(sumMicro, expected, 'tổng tiền phải bảo toàn');

    for (const batch of body.batches) {
      assert.ok(batch.payoutCount <= 133, `lô ${batch.id} vượt trần gas: ${batch.payoutCount} payout`);
    }
  });
});

describe('GET /v1/batches/:id', () => {
  it('trả lô kèm danh sách payout', async () => {
    const workerId = await createWorker('batch-get');
    const created = await call('POST', '/v1/batches', {
      headers: { 'idempotency-key': 'batch-get-0001' },
      body: { payouts: [{ workerId, amount_micro: '1234' }] },
    });
    const { batches } = (await created.json()) as { batches: { id: string }[] };
    const batchId = batches[0]?.id;
    assert.ok(batchId);

    const res = await call('GET', `/v1/batches/${batchId}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { id: string; payouts: { id: string; amount_micro: string }[] };
    assert.equal(body.id, batchId);
    assert.equal(body.payouts.length, 1);
    assert.equal(body.payouts[0]?.amount_micro, '1234');
  });

  it('lô không tồn tại → 404', async () => {
    const res = await call('GET', '/v1/batches/bat_khong_ton_tai');
    assert.equal(res.status, 404);
  });

  it('lô của nền tảng khác → 404', async () => {
    const workerId = await createWorker('batch-cross', OTHER_KEY);
    const created = await call('POST', '/v1/batches', {
      key: OTHER_KEY,
      headers: { 'idempotency-key': 'batch-cross-0001' },
      body: { payouts: [{ workerId, amount_micro: '5' }] },
    });
    const { batches } = (await created.json()) as { batches: { id: string }[] };
    const res = await call('GET', `/v1/batches/${batches[0]?.id}`);
    assert.equal(res.status, 404);
  });
});
