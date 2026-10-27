import { getRequestListener } from '@hono/node-server';

import { createApp } from '../apps/api/src/app.ts';
import { migrate } from '../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../packages/db/src/pglite.ts';
import { seedDemo } from '../packages/db/src/seed.ts';

let appPromise: Promise<ReturnType<typeof createApp>> | null = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const dataDir = process.env.DATABASE_DIR ?? (process.env.VERCEL ? '/tmp/nhip' : './.data/nhip');
      const db = await PgliteDatabase.create({ dataDir });
      await migrate(db);
      await seedDemo(db);
      return createApp({ db });
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
