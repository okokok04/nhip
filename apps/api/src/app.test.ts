import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { migrate } from '../../../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import type { Database } from '../../../packages/db/src/client.ts';
import { createApp } from './app.ts';
import { hashApiKey } from './auth.ts';

const API_KEY = 'nhip_sk_test_0123456789abcdef';
const PLATFORM_ID = 'plat_api_test';

let db: Database;
let app: ReturnType<typeof createApp>;

before(async () => {
  db = await PgliteDatabase.create();
  await migrate(db);
  await db.query(
    `INSERT INTO platforms (id, name, api_key_hash, batch_size, batch_interval_ms, gas_budget)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [PLATFORM_ID, 'Nền tảng thử', hashApiKey(API_KEY), 200, 2000, '10000000'],
  );
  app = createApp({ db, generateRequestId: () => 'req_fixed_for_test' });
});

after(async () => {
  await db.close();
});

const authed = (path: string) =>
  app.request(path, { headers: { authorization: `Bearer ${API_KEY}` } });

describe('GET /health', () => {
  it('200 và db ok khi DB sống', async () => {
    const res = await app.request('/health');
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; db: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.db, 'ok');
  });

  it('không lộ thông tin nội bộ', async () => {
    const res = await app.request('/health');
    const text = await res.text();
    assert.ok(!text.includes(PLATFORM_ID), 'không được lộ platform id');
    assert.ok(!text.includes('pglite'), 'không được lộ tên driver');
    assert.ok(!/postgres|password|DATABASE_URL/i.test(text));
  });

  it('503 khi DB chết', async () => {
    const brokenApp = createApp({
      db: { ...db, query: async () => { throw new Error('connection refused'); } } as unknown as Database,
      generateRequestId: () => 'req_broken',
    });
    const res = await brokenApp.request('/health');
    assert.equal(res.status, 503);
    const body = (await res.json()) as { status: string };
    assert.equal(body.status, 'degraded');
  });
});

describe('xác thực', () => {
  it('thiếu header → 401 UNAUTHENTICATED, có requestId', async () => {
    const res = await app.request('/v1/me');
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { code: string; requestId: string } };
    assert.equal(body.error.code, 'UNAUTHENTICATED');
    assert.equal(body.error.requestId, 'req_fixed_for_test');
  });

  it('header sai định dạng → 401', async () => {
    for (const header of ['Basic abc', 'Bearer', 'Bearer   ', 'abc']) {
      const res = await app.request('/v1/me', { headers: { authorization: header } });
      assert.equal(res.status, 401, `header "${header}" phải bị từ chối`);
    }
  });

  it('key sai và key không tồn tại cho cùng một message (không dò được key)', async () => {
    // Phân biệt "thiếu header" (lỗi lập trình của client) với "key sai" là hợp lý và hữu ích.
    // Điều KHÔNG được phép: phân biệt "key sai" với "key đúng nhưng không tồn tại trong DB" —
    // đó là kênh dò xem một key có tồn tại hay không.
    const wellFormedButUnknown = 'nhip_sk_0000000000000000deadbeef';
    const res = await app.request('/v1/me', { headers: { authorization: `Bearer ${wellFormedButUnknown}` } });
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { message: string; code: string } };
    assert.equal(body.error.code, 'UNAUTHENTICATED');
    assert.equal(body.error.message, 'API key không hợp lệ.');
  });

  it('key đúng → 200 và trả thông tin platform', async () => {
    const res = await authed('/v1/me');
    assert.equal(res.status, 200);
    const body = (await res.json()) as { id: string; name: string; gasBudget: string };
    assert.equal(body.id, PLATFORM_ID);
    assert.equal(body.name, 'Nền tảng thử');
    // gasBudget là string, không phải number — bigint không serialize được bằng JSON.
    assert.equal(typeof body.gasBudget, 'string');
    assert.equal(body.gasBudget, '10000000');
  });
});

describe('request id', () => {
  it('mọi response đều có x-request-id', async () => {
    for (const res of [await app.request('/health'), await app.request('/v1/me'), await authed('/v1/me')]) {
      assert.ok(res.headers.get('x-request-id'), 'thiếu header x-request-id');
    }
  });
});

describe('404', () => {
  it('endpoint không tồn tại → 404 có cấu trúc lỗi', async () => {
    const res = await app.request('/khong-ton-tai');
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'NOT_FOUND');
  });
});
