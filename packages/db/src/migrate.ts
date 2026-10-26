import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { Database } from './client.ts';

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const MIGRATION_PATTERN = /^(\d{3,})_([a-z0-9_]+)\.sql$/;

export interface MigrateResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

/**
 * Chạy mọi migration chưa chạy, theo thứ tự số.
 *
 * Idempotent theo hai lớp:
 * 1. Bảng `schema_migrations` ghi cái đã chạy → lần hai bỏ qua.
 * 2. Bản thân SQL dùng `IF NOT EXISTS` → kể cả khi bảng tracking bị xoá, chạy lại vẫn an toàn.
 *
 * Lớp 2 không thừa: nó là thứ cứu ta khi ai đó xoá nhầm `schema_migrations`.
 */
export async function migrate(db: Database, options: { dir?: string } = {}): Promise<MigrateResult> {
  const dir = options.dir ?? MIGRATIONS_DIR;
  if (!existsSync(dir)) throw new Error(`không tìm thấy thư mục migration: ${dir}`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(dir)).filter((name) => MIGRATION_PATTERN.test(name)).sort();
  if (files.length === 0) return { applied: [], skipped: [] };

  // Kiểm tra tên file trước khi chạy bất cứ gì — một file đặt sai tên sẽ bị bỏ qua
  // âm thầm, và đó là loại bug chỉ phát hiện khi production thiếu cột.
  const allSql = (await readdir(dir)).filter((name) => name.endsWith('.sql'));
  const malformed = allSql.filter((name) => !MIGRATION_PATTERN.test(name));
  if (malformed.length) {
    throw new Error(
      `tên migration không hợp lệ: ${malformed.join(', ')} — phải là NNN_ten_file.sql`,
    );
  }

  const done = await db.query<{ version: string }>('SELECT version FROM schema_migrations');
  const appliedSet = new Set(done.rows.map((row) => row.version));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    if (appliedSet.has(file)) {
      skipped.push(file);
      continue;
    }

    const sql = await readFile(path.join(dir, file), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    });
    applied.push(file);
  }

  return { applied, skipped };
}

/** Dùng khi cần biết schema đã đủ chưa mà không muốn chạy migration. */
export async function pendingMigrations(db: Database, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((name) => MIGRATION_PATTERN.test(name)).sort();
  const done = await db.query<{ version: string }>('SELECT version FROM schema_migrations').catch(() => ({
    rows: [] as { version: string }[],
    rowCount: 0,
  }));
  const appliedSet = new Set(done.rows.map((row) => row.version));
  return files.filter((file) => !appliedSet.has(file));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { PgliteDatabase } = await import('./pglite.ts');
  const db = await PgliteDatabase.create({ dataDir: process.env.DATABASE_DIR || 'memory://' });
  const result = await migrate(db);
  process.stdout.write(`migrate: ${result.applied.length} applied, ${result.skipped.length} skipped\n`);
  for (const file of result.applied) process.stdout.write(`  + ${file}\n`);
  await db.close();
}
