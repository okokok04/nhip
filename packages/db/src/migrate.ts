import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import type { Database } from './client.ts';

const DEFAULT_MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const MIGRATION_PATTERN = /^(\d{3,})_([a-z0-9_]+)\.sql$/;

export const EMBEDDED_MIGRATIONS: Readonly<Record<string, string>> = Object.freeze({
  '001_init.sql': `
CREATE TABLE IF NOT EXISTS platforms (
  id                TEXT        PRIMARY KEY,
  name              TEXT        NOT NULL,
  api_key_hash      TEXT        NOT NULL UNIQUE,
  signing_mode      TEXT        NOT NULL DEFAULT 'eoa'
                                CHECK (signing_mode IN ('eoa', 'vault', 'eip3009')),
  address           TEXT,
  webhook_url       TEXT,
  webhook_secret    TEXT,
  batch_size        INTEGER     NOT NULL DEFAULT 200 CHECK (batch_size BETWEEN 1 AND 500),
  batch_interval_ms INTEGER     NOT NULL DEFAULT 2000 CHECK (batch_interval_ms BETWEEN 100 AND 60000),
  gas_budget        BIGINT      NOT NULL DEFAULT 10000000,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workers (
  id           TEXT        PRIMARY KEY,
  platform_id  TEXT        NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  external_id  TEXT        NOT NULL,
  address      TEXT        CHECK (address IS NULL OR address = lower(address)),
  display_name TEXT,
  claim_token  TEXT        UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform_id, external_id)
);

CREATE TABLE IF NOT EXISTS batches (
  id            TEXT        PRIMARY KEY,
  platform_id   TEXT        NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  state         TEXT        NOT NULL DEFAULT 'planned'
                            CHECK (state IN ('planned', 'submitting', 'confirmed', 'partial', 'failed', 'unknown')),
  payout_count  INTEGER     NOT NULL CHECK (payout_count > 0),
  total_micro   BIGINT      NOT NULL CHECK (total_micro > 0),
  estimated_gas BIGINT      NOT NULL,
  tx_hash       TEXT        UNIQUE,
  block_number  BIGINT,
  gas_used      BIGINT,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS batches_by_platform ON batches (platform_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payouts (
  id              TEXT        PRIMARY KEY,
  platform_id     TEXT        NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  worker_id       TEXT        NOT NULL REFERENCES workers(id),
  batch_id        TEXT        REFERENCES batches(id) ON DELETE SET NULL,
  amount_micro    BIGINT      NOT NULL CHECK (amount_micro > 0),
  idempotency_key TEXT        NOT NULL,
  reference       TEXT,
  state           TEXT        NOT NULL DEFAULT 'queued'
                              CHECK (state IN ('queued', 'batched', 'submitted', 'confirmed', 'failed', 'unknown')),
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at    TIMESTAMPTZ,
  CONSTRAINT payouts_idempotency_unique UNIQUE (platform_id, idempotency_key),
  CONSTRAINT payout_batch_consistency CHECK (
    (state = 'queued' AND batch_id IS NULL) OR
    (state <> 'queued' AND batch_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS payouts_queued ON payouts (platform_id, created_at)
  WHERE state = 'queued';

CREATE INDEX IF NOT EXISTS payouts_by_worker ON payouts (worker_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payouts_by_batch ON payouts (batch_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL   PRIMARY KEY,
  actor      TEXT        NOT NULL,
  action     TEXT        NOT NULL,
  target     TEXT        NOT NULL,
  detail     JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_by_target ON audit_log (target, created_at DESC);
`,
  '002_batch_idempotency.sql': `
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE batches
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE batches
  DROP CONSTRAINT IF EXISTS batches_idempotency_unique;

ALTER TABLE batches
  ADD CONSTRAINT batches_idempotency_unique UNIQUE (platform_id, idempotency_key);
`,
  '003_batch_request_key.sql': `
ALTER TABLE batches ADD COLUMN IF NOT EXISTS request_key TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS request_hash TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS chunk_index INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS batches_request_chunk_unique
  ON batches (platform_id, request_key, chunk_index)
  WHERE request_key IS NOT NULL;
`,
  '004_settlement.sql': `
ALTER TABLE batches ADD COLUMN IF NOT EXISTS settlement_mode TEXT NOT NULL DEFAULT 'unsettled';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS arc_network TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS quoted_gas_price_wei TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS quoted_gas BIGINT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS quoted_fee_wei TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS block_number BIGINT;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS gas_used BIGINT;

ALTER TABLE platforms ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE platforms ADD COLUMN IF NOT EXISTS relayer_address TEXT;

CREATE INDEX IF NOT EXISTS payouts_by_tx ON payouts (tx_hash);
CREATE INDEX IF NOT EXISTS payouts_pending_broadcast ON payouts (batch_id) WHERE state = 'batched';
CREATE INDEX IF NOT EXISTS batches_by_state ON batches (platform_id, state, created_at);

UPDATE batches
   SET tx_hash = NULL
 WHERE tx_hash = '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b';

UPDATE batches b
   SET settlement_mode = 'simulated',
       tx_hash         = NULL,
       confirmed_at    = NULL
 WHERE b.settlement_mode = 'unsettled'
   AND EXISTS (
     SELECT 1 FROM payouts p WHERE p.batch_id = b.id AND p.state = 'confirmed'
   );

UPDATE batches SET settlement_mode = 'simulated' WHERE id = 'bat_seed_history';

UPDATE platforms SET is_demo = TRUE WHERE id = 'plat_demo';

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_settlement_mode_check;
ALTER TABLE batches ADD CONSTRAINT batches_settlement_mode_check
  CHECK (settlement_mode IN ('unsettled', 'onchain', 'simulated'));

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_simulated_has_no_tx;
ALTER TABLE batches ADD CONSTRAINT batches_simulated_has_no_tx
  CHECK (settlement_mode <> 'simulated' OR tx_hash IS NULL);

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_quote_complete;
ALTER TABLE batches ADD CONSTRAINT batches_quote_complete
  CHECK (
    (quoted_gas IS NULL AND quoted_gas_price_wei IS NULL AND quoted_fee_wei IS NULL AND quoted_at IS NULL)
    OR
    (quoted_gas IS NOT NULL AND quoted_gas_price_wei IS NOT NULL AND quoted_fee_wei IS NOT NULL AND quoted_at IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION payouts_confirmed_requires_tx() RETURNS TRIGGER AS $fn$
DECLARE
  mode TEXT;
BEGIN
  IF NEW.state <> 'confirmed' OR NEW.tx_hash IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.state = 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT b.settlement_mode INTO mode FROM batches b WHERE b.id = NEW.batch_id;
  IF mode = 'simulated' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'payout % ở trạng thái confirmed nhưng không có tx_hash (lô: %)', NEW.id, NEW.batch_id
    USING ERRCODE = '23514';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payouts_confirmed_requires_tx ON payouts;
CREATE TRIGGER payouts_confirmed_requires_tx
  BEFORE INSERT OR UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION payouts_confirmed_requires_tx();
`,
});

function resolveMigrationsDir(explicitDir?: string): string | null {
  if (explicitDir) {
    if (!existsSync(explicitDir)) throw new Error(`không tìm thấy thư mục migration: ${explicitDir}`);
    return explicitDir;
  }
  if (existsSync(DEFAULT_MIGRATIONS_DIR)) return DEFAULT_MIGRATIONS_DIR;
  const cwdDir = path.resolve(process.cwd(), 'packages', 'db', 'migrations');
  if (existsSync(cwdDir)) return cwdDir;
  return null;
}

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
  const resolvedDir = resolveMigrationsDir(options.dir);

  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  let migrationEntries: Array<{ name: string; getSql: () => Promise<string> }>;

  if (resolvedDir) {
    const files = (await readdir(resolvedDir)).filter((name) => MIGRATION_PATTERN.test(name)).sort();
    if (files.length === 0) return { applied: [], skipped: [] };

    const allSql = (await readdir(resolvedDir)).filter((name) => name.endsWith('.sql'));
    const malformed = allSql.filter((name) => !MIGRATION_PATTERN.test(name));
    if (malformed.length) {
      throw new Error(
        `tên migration không hợp lệ: ${malformed.join(', ')} — phải là NNN_ten_file.sql`,
      );
    }

    migrationEntries = files.map((file) => ({
      name: file,
      getSql: () => readFile(path.join(resolvedDir, file), 'utf8'),
    }));
  } else {
    migrationEntries = Object.keys(EMBEDDED_MIGRATIONS)
      .sort()
      .map((name) => ({
        name,
        getSql: async () => EMBEDDED_MIGRATIONS[name]!,
      }));
  }

  const done = await db.query<{ version: string }>('SELECT version FROM schema_migrations');
  const appliedSet = new Set(done.rows.map((row) => row.version));

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const entry of migrationEntries) {
    if (appliedSet.has(entry.name)) {
      skipped.push(entry.name);
      continue;
    }

    const sql = await entry.getSql();
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [entry.name]);
    });
    applied.push(entry.name);
  }

  return { applied, skipped };
}

/** Dùng khi cần biết schema đã đủ chưa mà không muốn chạy migration. */
export async function pendingMigrations(db: Database, dir?: string): Promise<string[]> {
  const resolvedDir = resolveMigrationsDir(dir);
  const done = await db.query<{ version: string }>('SELECT version FROM schema_migrations').catch(() => ({
    rows: [] as { version: string }[],
    rowCount: 0,
  }));
  const appliedSet = new Set(done.rows.map((row) => row.version));

  if (resolvedDir) {
    const files = (await readdir(resolvedDir)).filter((name) => MIGRATION_PATTERN.test(name)).sort();
    return files.filter((file) => !appliedSet.has(file));
  }
  return Object.keys(EMBEDDED_MIGRATIONS).sort().filter((name) => !appliedSet.has(name));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { PgliteDatabase } = await import('./pglite.ts');
  const db = await PgliteDatabase.create({ dataDir: process.env.DATABASE_DIR || 'memory://' });
  const result = await migrate(db);
  process.stdout.write(`migrate: ${result.applied.length} applied, ${result.skipped.length} skipped\n`);
  for (const file of result.applied) process.stdout.write(`  + ${file}\n`);
  await db.close();
}
