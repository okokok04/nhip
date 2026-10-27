import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';

import { migrate } from '../../../packages/db/src/migrate.ts';
import type { Database } from '../../../packages/db/src/client.ts';
import { PgDatabase } from '../../../packages/db/src/pg.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import { createApp } from './app.ts';
import { createChainGateway, readChainConfig } from './chain.ts';

const port = Number(process.env.PORT ?? 3000);

/**
 * Chọn database theo môi trường.
 *
 * `DATABASE_URL` có mặt → Postgres thật. Không có → PGlite trên đĩa.
 *
 * Đây là **một quyết định, một chỗ**. Trước đây Vercel lặng lẽ dùng PGlite trong `/tmp`,
 * nên mỗi cold start là một database rỗng và dashboard lại "quên" toàn bộ lịch sử — một
 * sản phẩm giữ sổ tiền không thể có hành vi đó. Nếu production thiếu `DATABASE_URL`, log
 * sẽ nói rõ đang chạy trên database tạm.
 */
async function openDatabase(): Promise<{ db: Database; kind: 'postgres' | 'pglite'; detail: string }> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) {
    const db = PgDatabase.create({ connectionString });
    return { db, kind: 'postgres', detail: redact(connectionString) };
  }

  const dataDir = process.env.DATABASE_DIR ?? './.data/nhip';
  const db = await PgliteDatabase.create({ dataDir });
  return { db, kind: 'pglite', detail: dataDir };
}

/** Không in mật khẩu ra log. Một chuỗi kết nối bị lộ là một database bị lộ. */
function redact(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '(không đọc được DATABASE_URL)';
  }
}

const { db, kind, detail } = await openDatabase();
const migrated = await migrate(db);

// Thiếu `RELAYER_PRIVATE_KEY` **không** làm API chết: báo giá vẫn dùng được, và endpoint
// gửi sẽ từ chối với lý do rõ ràng. Tự bịa khoá hay tự giả lập giao dịch mới là lỗi.
const chainConfig = readChainConfig(process.env);
const chain = chainConfig ? createChainGateway(chainConfig) : null;

// Tính từ vị trí file, không từ cwd: `node apps/api/src/server.ts` và
// `cd apps/api && node src/server.ts` phải cho cùng một dashboard.
const webRoot = fileURLToPath(new URL('../../web/public', import.meta.url));

const app = createApp({ db, webRoot, chain });

const server = serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      message: 'api listening',
      port: info.port,
      migrationsApplied: migrated.applied.length,
      database: kind,
      databaseTarget: detail,
      chain: chain ? `${chain.network}:${chain.relayerAddress}` : 'chưa cấu hình (chỉ báo giá)',
    })}\n`,
  );
});

const shutdown = async (signal: string) => {
  process.stdout.write(`${JSON.stringify({ level: 'info', message: 'shutting down', signal })}\n`);
  server.close();
  await db.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
