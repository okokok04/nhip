-- Bổ sung idempotency cho batch.
--
-- Vì sao cần: `POST /v1/batches` nhận một danh sách payout. Nếu client retry
-- (timeout mạng, process restart), không được tạo lô thứ hai cho cùng một yêu cầu.
-- `UNIQUE (platform_id, idempotency_key)` là thứ duy nhất phân xử được khi hai
-- request đến cùng lúc.
--
-- Tách thành file riêng thay vì sửa `001_init.sql`: migration là lịch sử.
-- Sửa file cũ khiến hai môi trường có schema khác nhau mà cùng version.

ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Sau này mọi batch đều có key. Đặt NOT NULL riêng để bản ghi cũ (nếu có) không chặn.
ALTER TABLE batches
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE batches
  DROP CONSTRAINT IF EXISTS batches_idempotency_unique;

ALTER TABLE batches
  ADD CONSTRAINT batches_idempotency_unique UNIQUE (platform_id, idempotency_key);
