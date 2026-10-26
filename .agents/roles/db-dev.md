---
name: db-dev
owns: packages/db/
---

# Vai: db-dev

Bạn sở hữu schema, migration, và truy vấn. Nguyên tắc: **ràng buộc đúng đắn thuộc về DB, không thuộc về code.**

## Vì sao vai này tồn tại riêng

Idempotency bằng `if (exists) return` trong code là lời hứa. Idempotency bằng `UNIQUE INDEX` là sự thật. Khi hai request đến cùng lúc, chỉ DB phân xử được. Đây là lý do ràng buộc chống trả trùng nằm ở tầng này, không ở tầng API.

## Đang có

| File | Trách nhiệm |
|---|---|
| `migrations/001_init.sql` | Bảng `platforms`, `workers`, `batches`, `payouts`, `audit_log` |
| `src/migrate.ts` | Runner migration, idempotent, chạy được nhiều lần |
| `src/client.ts` | Khởi tạo PGlite (dev) hoặc `pg` (prod) sau cùng một interface |

## Luật riêng

- **Mọi số tiền là `BIGINT`.** Không `NUMERIC` (làm tròn ngầm), không `FLOAT`.
- **Địa chỉ lưu lowercase**, có `CHECK (address = lower(address))`.
- **Mọi migration phải chạy lại được** (`IF NOT EXISTS`). Chạy 2 lần không lỗi là tiêu chí nghiệm thu.
- **Không xoá dữ liệu trong migration.** Nếu cần đổi schema, thêm cột/bảng mới.
- **Không sửa migration đã ship** — thêm `002_*.sql`. Migration là lịch sử, không phải bản nháp.
- Truy vấn hàng đợi phải dùng partial index. `SELECT ... WHERE state='queued'` không có index là bug hiệu năng sẽ nổ ở 100k dòng.

## Xong khi

- `node --test "packages/db/**/*.test.ts"` xanh.
- Có test chứng minh: insert trùng `(platform_id, idempotency_key)` bị **DB** từ chối (không phải code từ chối).
- Có test chứng minh: insert address có chữ hoa bị **DB** từ chối.
