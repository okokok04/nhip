-- Nhịp — một request HTTP có thể sinh NHIỀU lô.
--
-- Vì sao cần `request_key` thay vì dùng `idempotency_key` có sẵn:
--
-- `idempotency_key` (migration 002) là unique **trên từng dòng lô** — nó trả lời
--   "dòng lô này đã tồn tại chưa?".
-- `request_key` là key của **request HTTP đã sinh ra các lô đó** — nó trả lời
--   "request này đã được xử lý chưa, và nó sinh ra những lô nào?".
--
-- Không gộp được: một request 5.000 payout bị chia thành 25 lô. Nếu chỉ có một key,
-- retry sẽ tạo thêm 25 lô nữa, hoặc phải dò bằng prefix — mà dò prefix trên chuỗi
-- do client gửi là chỗ để một ký tự `%` biến thành lỗi.

ALTER TABLE batches ADD COLUMN IF NOT EXISTS request_key TEXT;

-- Băm nội dung request. Dùng để phát hiện client dùng lại cùng key cho payload khác:
-- cùng key mà nội dung khác là lỗi lập trình của client, và trả lại kết quả cũ một
-- cách im lặng sẽ làm họ tưởng nhầm là đã tạo đúng payout mới.
ALTER TABLE batches ADD COLUMN IF NOT EXISTS request_hash TEXT;

-- Thứ tự lô trong request. Cần để trả lại đúng thứ tự khi retry,
-- vì id lô là ngẫu nhiên nên không sắp xếp theo id được.
ALTER TABLE batches ADD COLUMN IF NOT EXISTS chunk_index INTEGER NOT NULL DEFAULT 0;

-- Partial unique: chỉ áp cho lô do API sinh (có request_key).
-- Lô do seeder hoặc job nội bộ tạo không có request_key và không bị ràng buộc này.
CREATE UNIQUE INDEX IF NOT EXISTS batches_request_chunk_unique
  ON batches (platform_id, request_key, chunk_index)
  WHERE request_key IS NOT NULL;
