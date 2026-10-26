import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';

import { migrate } from '../../../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
// Cùng thư mục mặc định với `scripts/seed.ts`. Mặc định `memory://` sẽ khiến
// `npm run seed` rồi `npm run dev` cho ra database rỗng — người dùng tưởng seed hỏng.
const dataDir = process.env.DATABASE_DIR ?? './.data/nhip';

const db = await PgliteDatabase.create({ dataDir });
const migrated = await migrate(db);

// Tính từ vị trí file, không từ cwd: `node apps/api/src/server.ts` và
// `cd apps/api && node src/server.ts` phải cho cùng một dashboard.
const webRoot = fileURLToPath(new URL('../../web/public', import.meta.url));

const app = createApp({ db, webRoot });

const server = serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(
    `${JSON.stringify({
      level: 'info',
      message: 'api listening',
      port: info.port,
      migrationsApplied: migrated.applied.length,
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
