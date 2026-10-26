-- Nhịp — schema khởi tạo.
--
-- Quy ước:
--   * Mọi số tiền là BIGINT, đơn vị micro (1e-6 USDC). Không có NUMERIC, không có FLOAT.
--   * Địa chỉ ví lưu lowercase, có CHECK để không ai insert bản ghi chưa chuẩn hoá.
--   * Ràng buộc chống trả trùng nằm ở DB, không ở tầng application.

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
  -- Một người chỉ được map một lần trong một nền tảng.
  -- Đây là nguồn gốc của phần lớn lỗi "tiền về nhầm ví".
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

  -- Lớp chống trùng số 1. Không có ràng buộc này thì idempotency chỉ là lời hứa.
  CONSTRAINT payouts_idempotency_unique UNIQUE (platform_id, idempotency_key),

  -- Một payout chỉ được thuộc một lô và chỉ khi đã ở trạng thái batched trở đi.
  CONSTRAINT payout_batch_consistency CHECK (
    (state = 'queued' AND batch_id IS NULL) OR
    (state <> 'queued' AND batch_id IS NOT NULL)
  )
);

-- Partial index: hàng đợi luôn nhỏ trong khi bảng có thể có hàng triệu dòng đã trả.
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
