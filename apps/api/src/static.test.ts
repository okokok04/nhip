/**
 * Dashboard tĩnh phải phục vụ được từ chính API.
 *
 * Test này tồn tại vì một lỗi rất dễ xảy ra và rất khó thấy: `notFound` và
 * `serveStatic` cùng tranh một đường dẫn, và thứ tự đăng ký quyết định ai thắng.
 * Nếu `notFound` đứng trước, mọi request `/` trả JSON 404 — trang vẫn "chạy" khi
 * gọi bằng curl vào `/health`, nhưng mở trình duyệt thì trắng.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { migrate } from '../../../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import type { Database } from '../../../packages/db/src/client.ts';
import { createApp } from './app.ts';

const WEB_ROOT = fileURLToPath(new URL('../../web/public', import.meta.url));

let db: Database;
let app: ReturnType<typeof createApp>;

before(async () => {
  db = await PgliteDatabase.create();
  await migrate(db);
  app = createApp({ db, webRoot: WEB_ROOT, generateRequestId: () => 'req_static_test' });
});

after(async () => {
  await db.close();
});

describe('dashboard tĩnh', () => {
  it('GET / trả HTML có charset utf-8 (tiếng Việt phải đọc đúng)', async () => {
    const res = await app.request('/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/html/);
    assert.match(res.headers.get('content-type') ?? '', /charset=utf-8/i);

    const html = await res.text();
    assert.match(html, /<html lang="vi">/);
    assert.match(html, /Nhịp/);
  });

  it('GET /styles.css trả text/css', async () => {
    const res = await app.request('/styles.css');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/css/);
    assert.ok((await res.text()).length > 1000, 'stylesheet rỗng thì dashboard không có giao diện');
  });

  it('GET /app.js trả JavaScript đúng MIME', async () => {
    const res = await app.request('/app.js');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /^text\/javascript/);
  });

  it('không cho thoát khỏi thư mục gốc bằng ../', async () => {
    for (const path of ['/../package.json', '/..%2fpackage.json', '//etc/passwd']) {
      const res = await app.request(path);
      assert.notEqual(res.status, 200, `"${path}" không được trả file`);
    }
  });

  it('API vẫn trả JSON, không bị static nuốt', async () => {
    const res = await app.request('/v1/me');
    assert.equal(res.status, 401);
    assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
  });

  it('đường dẫn lạ vẫn là 404 JSON, không phải HTML', async () => {
    const res = await app.request('/khong-ton-tai');
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'NOT_FOUND');
  });

  it('không truyền webRoot → không phục vụ dashboard (dùng cho test và reverse proxy)', async () => {
    const apiOnly = createApp({ db, generateRequestId: () => 'req_api_only' });
    const res = await apiOnly.request('/');
    assert.equal(res.status, 404);
  });
});
