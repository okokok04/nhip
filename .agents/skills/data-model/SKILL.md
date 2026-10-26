---
name: data-model
description: >-
  Dùng khi thiết kế schema, viết migration, thêm index, hoặc khi truy vấn chậm.
  Tập trung vào tính đúng đắn của dữ liệu, migration an toàn và hiệu năng truy vấn.
---

# Data Model

## 1. Chốt entity trước khi chốt bảng

Viết ra bằng lời trước:

```markdown
- Customer: một người mua. Có nhiều Invoice.
- Invoice: một lần giao dịch. Thuộc đúng 1 Customer. Có nhiều InvoiceItem.
- InvoiceItem: một dòng hàng trong hoá đơn. Trỏ tới Product (snapshot giá tại thời điểm mua).
```

Phát hiện sớm: quan hệ 1-n, n-n, hay "tuỳ trường hợp" (thường là thiếu entity).

## 2. Quy ước bảng

```sql
CREATE TABLE invoices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  total_cents   bigint NOT NULL CHECK (total_cents >= 0),   -- lưu tiền bằng số nguyên
  currency      char(3) NOT NULL,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','sent','paid','void')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz                                 -- soft delete nếu cần
);
```

Luật:

- `snake_case`, tên bảng số nhiều.
- `id` là khoá chính, kiểu thống nhất toàn hệ (uuid hoặc bigint — chọn một).
- Luôn có `created_at`, `updated_at` (`timestamptz`, không dùng `timestamp` trần).
- **Tiền**: lưu số nguyên (cents), không `float`. Kèm `currency`.
- Enum: dùng `CHECK` hoặc bảng lookup, không dùng `varchar` tự do.
- Nullable phải có lý do. Mặc định `NOT NULL`.
- Không lưu dữ liệu suy ra được (tổng tiền có thể tính) trừ khi có lý do hiệu năng rõ ràng —
  và khi đó phải có cơ chế giữ nhất quán.

## 3. Quan hệ

- `ON DELETE` phải chọn có chủ ý: `RESTRICT` (an toàn, mặc định), `CASCADE` (chỉ khi con
  thực sự vô nghĩa nếu thiếu cha), `SET NULL` (khi quan hệ tuỳ chọn).
- Bảng n-n: bảng nối có khoá chính ghép `(a_id, b_id)` + index ngược lại.
- Tránh đa hình kiểu `entity_type + entity_id` nếu truy vấn phức tạp; cân nhắc bảng riêng.

## 4. Index

Thêm index khi có truy vấn thật, không "cho chắc":

```sql
-- Truy vấn: WHERE customer_id = ? AND status = ? ORDER BY created_at DESC
CREATE INDEX idx_invoices_customer_status_created
  ON invoices (customer_id, status, created_at DESC);
```

- Thứ tự cột trong composite index: cột lọc **bằng** trước, cột sắp xếp sau.
- Index cho FK nếu thường join/lọc theo nó.
- Index một phần khi chỉ truy vấn tập con:
  `CREATE INDEX ... ON invoices (created_at) WHERE status = 'draft';`
- Unique index thay cho "kiểm tra rồi insert" (chống race):
  `CREATE UNIQUE INDEX ON users (lower(email));`
- Mỗi index làm chậm ghi. Đừng thêm index cho cột ít truy vấn.

## 5. Xác định truy vấn chậm

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;
```

Đọc: `Seq Scan` trên bảng lớn = thiếu index; `Nested Loop` với row ước lượng lớn = cần index
hoặc viết lại; `rows` ước lượng lệch xa thực tế = cần `ANALYZE`.

Dấu hiệu N+1 ở tầng ứng dụng: 1 query list + N query chi tiết trong vòng lặp.
Sửa bằng join / `IN (...)` / `include` của ORM.

## 6. Migration an toàn

Nguyên tắc: **migration phải chạy được trên dữ liệu thật, và rollback được**.

Thứ tự an toàn cho thay đổi phá vỡ:

1. Thêm cột mới **nullable** (hoặc có default rẻ).
2. Deploy code ghi cả hai nơi (dual write).
3. Backfill dữ liệu theo lô nhỏ (không 1 câu UPDATE cả bảng trong giờ cao điểm).
4. Chuyển code đọc sang cột mới.
5. Sau khi ổn định: thêm `NOT NULL`, xoá cột cũ ở release sau.

Cấm trong migration:

- Xoá cột/bảng khi code cũ còn đọc.
- `UPDATE` toàn bảng lớn trong 1 transaction giữ lock lâu.
- `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT <biểu thức>` trên bảng lớn (tuỳ version).
- Sửa migration đã chạy ở môi trường khác.

Mọi migration phải có: mục đích, ảnh hưởng dữ liệu, cách rollback, thời gian ước tính lock.

## 7. Seed & dữ liệu test

- Seed script idempotent: chạy lại nhiều lần không nhân đôi dữ liệu (dùng `upsert`).
- Không seed dữ liệu thật/PII vào môi trường dev.
- Test dùng transaction rollback hoặc DB tạm, không dùng chung DB dev.

## 8. Checklist

```markdown
- [ ] Entity + quan hệ đã viết thành lời
- [ ] Kiểu dữ liệu đúng (tiền = integer, thời gian = timestamptz)
- [ ] NOT NULL / CHECK / FK / ON DELETE có chủ ý
- [ ] Truy vấn chính đã có index tương ứng
- [ ] Migration có đường rollback + ước tính lock
- [ ] Không có cột thừa "để sau dùng"
```

## Dấu hiệu schema kém

- Cột `data jsonb` chứa gần như toàn bộ entity.
- `varchar(255)` cho email, `float` cho tiền.
- Không có FK, quan hệ kiểm bằng tay trong code.
- 12 index trên một bảng ghi liên tục.
- `status` là số `1,2,3` không có bảng/tài liệu mapping.
