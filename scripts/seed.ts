/**
 * Seed dữ liệu mẫu để mở `npm run dev` là có thứ để nhìn.
 *
 * Chạy trên PGlite với `DATABASE_DIR` (mặc định `./.data/nhip`). Dùng cùng thư mục
 * với `npm run dev` để dữ liệu còn nguyên sau khi tắt server.
 *
 * Script này chỉ là **vỏ CLI** quanh `seedDemo` trong `packages/db/src/seed.ts`. Trước
 * đây nó chép lại toàn bộ logic, và hai bản đã lệch nhau: bản CLI không đánh dấu
 * `is_demo`, không gán `claim_token`, và sinh API key ngẫu nhiên — nên giao diện demo
 * (dùng đúng khoá seed cố định) không đăng nhập được vào dữ liệu vừa seed.
 *
 * In API key ra stdout: DB chỉ lưu sha256, nên đây là lần duy nhất đọc được.
 */

import {
  DEFAULT_PLATFORM_ID,
  DEFAULT_SEED_KEY,
  seedDemo,
} from '../packages/db/src/seed.ts';
import { migrate } from '../packages/db/src/migrate.ts';
import { PgliteDatabase } from '../packages/db/src/pglite.ts';

const dataDir = process.env.DATABASE_DIR ?? './.data/nhip';

const db = await PgliteDatabase.create({ dataDir });
const migrated = await migrate(db);

process.stdout.write(
  `${JSON.stringify({ level: 'info', message: 'migrated', applied: migrated.applied.length, skipped: migrated.skipped.length })}\n`,
);

// Nền tảng demo dùng khoá cố định để bản chạy local và bản deploy có cùng điểm vào.
// Đây không phải bí mật: mọi bản ghi của nó mang `is_demo = TRUE`, và khoá không mở
// được dữ liệu của nền tảng nào khác.
const { platformId, apiKey } = await seedDemo(db, DEFAULT_SEED_KEY);

const counts = await db.query<{ workers: string; payouts: string; batches: string }>(
  `SELECT (SELECT COUNT(*)::text FROM workers  WHERE platform_id = $1) AS workers,
          (SELECT COUNT(*)::text FROM payouts  WHERE platform_id = $1) AS payouts,
          (SELECT COUNT(*)::text FROM batches  WHERE platform_id = $1) AS batches`,
  [platformId],
);

await db.close();

process.stdout.write(
  [
    '',
    '  Seed xong.',
    '',
    `  platform: ${DEFAULT_PLATFORM_ID} (is_demo = TRUE)`,
    `  workers : ${counts.rows[0]?.workers ?? '0'}`,
    `  payouts : ${counts.rows[0]?.payouts ?? '0'}`,
    `  batches : ${counts.rows[0]?.batches ?? '0'}`,
    '',
    '  API key (dùng chung cho bản demo, không phải khoá của khách thật):',
    '',
    `    ${apiKey}`,
    '',
    '  Dùng:',
    '',
    `    curl -H "Authorization: Bearer ${apiKey}" http://localhost:3000/v1/me`,
    '',
    `  Dữ liệu nằm ở: ${dataDir}`,
    '  Chạy lại script này không nhân đôi dữ liệu, chỉ cập nhật bản ghi demo.',
    '',
  ].join('\n'),
);
