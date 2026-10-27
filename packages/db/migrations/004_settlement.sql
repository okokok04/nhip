-- Nhịp — migration 004: dấu vết settlement thật trên Arc.
--
-- Vì sao cần: trước migration này, một lô `confirmed` chỉ có thể được *tuyên bố* là
-- đã lên chain. Không có cột nào phân biệt "đã gửi thật" với "demo cho đẹp", và
-- seed từng ghi một tx_hash giả. Với sản phẩm chuyển tiền, một tx_hash giả nguy
-- hiểm hơn không có tx_hash nào: nó khiến người vận hành tin là tiền đã đi.
--
-- Nguyên tắc mới (được thi hành bằng ràng buộc, không bằng lời hứa):
--   * Batch mang `settlement_mode`, ba giá trị, mỗi giá trị nói đúng một sự thật:
--       - 'unsettled' — chưa gửi gì lên chain.
--       - 'onchain'   — đã phát giao dịch thật.
--       - 'simulated' — dữ liệu demo, không bao giờ lên chain. Không được có tx_hash.
--   * Bằng chứng thanh toán nằm ở `payouts.tx_hash`, không ở batch.
--
-- Vì sao bằng chứng ở payout: MVP gửi mỗi payout bằng một `transfer` ERC-20 riêng.
-- Gộp nhiều transfer vào một tx cần contract PayoutVault, và contract đó làm tăng
-- gas mỗi payout — tức là làm mất chính luận điểm kinh tế của sản phẩm. Nên batch
-- KHÔNG có một tx đại diện: một tx cho 200 người là một câu chuyện, không phải sổ.

-- ---------------------------------------------------------------------------
-- 1. Cột mới.
-- ---------------------------------------------------------------------------

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
CREATE INDEX IF NOT EXISTS payouts_pending_broadcast ON payouts (batch_id)
  WHERE state = 'batched';
CREATE INDEX IF NOT EXISTS batches_by_state ON batches (platform_id, state, created_at);

-- ---------------------------------------------------------------------------
-- 2. Dọn dữ liệu cũ TRƯỚC khi thêm ràng buộc, nếu không constraint sẽ từ chối
--    chính những bản ghi đang có.
-- ---------------------------------------------------------------------------

-- tx_hash giả do seeder cũ ghi vào lô lịch sử.
UPDATE batches
   SET tx_hash = NULL
 WHERE tx_hash = '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b';

-- Lô `unsettled` mà đã có payout `confirmed` là lô chưa từng lên chain: trong mô hình
-- này bằng chứng thanh toán nằm ở `payouts.tx_hash`, nên một hash cấp lô không chứng
-- minh được gì. Luật phải dựa trên dữ liệu, không dựa trên một chuỗi hash cụ thể —
-- nếu không, mọi bản ghi lịch sử do lần chạy thử trước để lại sẽ làm trigger bên dưới
-- từ chối chính chúng, và `npm run seed` chết giữa chừng.
UPDATE batches b
   SET settlement_mode = 'simulated',
       tx_hash         = NULL,
       confirmed_at    = NULL
 WHERE b.settlement_mode = 'unsettled'
   AND EXISTS (
     SELECT 1 FROM payouts p WHERE p.batch_id = b.id AND p.state = 'confirmed'
   );

UPDATE batches SET settlement_mode = 'simulated' WHERE id = 'bat_seed_history';

-- Môi trường demo được đánh dấu ở DB, không suy ra từ tên API key.
UPDATE platforms SET is_demo = TRUE WHERE id = 'plat_demo';

-- ---------------------------------------------------------------------------
-- 3. Ràng buộc trên batches. `DROP ... IF EXISTS` trước để migration chạy lại được.
-- ---------------------------------------------------------------------------

ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_settlement_mode_check;
ALTER TABLE batches ADD CONSTRAINT batches_settlement_mode_check
  CHECK (settlement_mode IN ('unsettled', 'onchain', 'simulated'));

-- Dữ liệu demo không bao giờ được mang hash: đó là toàn bộ ý nghĩa của nhãn này.
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_simulated_has_no_tx;
ALTER TABLE batches ADD CONSTRAINT batches_simulated_has_no_tx
  CHECK (settlement_mode <> 'simulated' OR tx_hash IS NULL);

-- Báo giá phải đủ bộ hoặc không có gì: một nửa báo giá không dùng được để đối soát.
ALTER TABLE batches DROP CONSTRAINT IF EXISTS batches_quote_complete;
ALTER TABLE batches ADD CONSTRAINT batches_quote_complete
  CHECK (
    (quoted_gas IS NULL AND quoted_gas_price_wei IS NULL AND quoted_fee_wei IS NULL AND quoted_at IS NULL)
    OR
    (quoted_gas IS NOT NULL AND quoted_gas_price_wei IS NOT NULL AND quoted_fee_wei IS NOT NULL AND quoted_at IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 4. Payout `confirmed` phải có tx_hash — trừ khi lô của nó là dữ liệu demo.
--
-- Vì sao cần trigger chứ không phải CHECK: điều kiện phụ thuộc vào bảng `batches`,
-- và CHECK của Postgres chỉ nhìn thấy dòng đang ghi. Một CHECK giả vờ kiểm được
-- điều này sẽ là lời nói dối nằm trong schema.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION payouts_confirmed_requires_tx() RETURNS TRIGGER AS $fn$
DECLARE
  mode TEXT;
BEGIN
  IF NEW.state <> 'confirmed' OR NEW.tx_hash IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Chỉ thi hành khi dòng **bước vào** trạng thái confirmed. Một UPDATE không đổi gì
  -- (ví dụ `ON CONFLICT DO UPDATE` dùng để nhận diện retry idempotent) không phải là
  -- hành vi "đánh dấu đã trả", và chặn nó chỉ làm hỏng những lần gọi lại hợp lệ.
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
