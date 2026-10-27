import { getRequestListener } from '@hono/node-server';

import { migrate } from '../../../packages/db/src/migrate.ts';
import type { Database } from '../../../packages/db/src/client.ts';
import { PgDatabase } from '../../../packages/db/src/pg.ts';
import { PgliteDatabase } from '../../../packages/db/src/pglite.ts';
import { seedDemo } from '../../../packages/db/src/seed.ts';
import { createApp } from './app.ts';
import { createChainGateway, readChainConfig } from './chain.ts';

let appPromise: Promise<ReturnType<typeof createApp>> | null = null;

async function openDatabase(): Promise<Database> {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (connectionString) return PgDatabase.create({ connectionString });

  // Không có `DATABASE_URL`: chạy PGlite trong `/tmp`. Trên serverless, thư mục này không
  // tồn tại giữa các lần gọi, nên dữ liệu sẽ reset. Đây là chế độ **demo**, và nó được
  // ghi log rõ ràng — không được im lặng.
  const dataDir = process.env.DATABASE_DIR ?? (process.env.VERCEL ? '/tmp/nhip' : './.data/nhip');
  return await PgliteDatabase.create({ dataDir });
}

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const db = await openDatabase();
      await migrate(db);

      const persistent = Boolean(process.env.DATABASE_URL?.trim());
      if (!persistent) {
        process.stdout.write(
          `${JSON.stringify({
            level: 'warn',
            message:
              'Không có DATABASE_URL — đang chạy PGlite trên đĩa tạm. Dữ liệu sẽ mất khi function khởi động lại. ' +
              'Đặt DATABASE_URL (Neon/Supabase) để giữ sổ payout.',
          })}\n`,
        );
        await seedDemo(db);
      }

      const chainConfig = readChainConfig(process.env);
      const chain = chainConfig ? createChainGateway(chainConfig) : null;

      return createApp({ db, chain });
    })();
  }
  return appPromise;
}

export default async function handler(req: any, res?: any) {
  const app = await getApp();
  if (res && typeof res.status === 'function') {
    const listener = getRequestListener(app.fetch);
    return listener(req, res);
  }
  return app.fetch(req);
}
