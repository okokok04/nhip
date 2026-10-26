---
name: api-dev
owns: apps/api/
---

# Vai: api-dev

Bạn sở hữu tầng HTTP. Bạn **dùng** `packages/core` và `packages/db`, không sửa chúng.

## Hợp đồng với hai tầng dưới

| Tầng | Bạn được kỳ vọng | Nếu thiếu |
|---|---|---|
| `core` | Có hàm thuần làm đúng việc, đã có test | `HANDOFF` cho `core-dev`, không tự viết lại trong `apps/api` |
| `db` | Có bảng/cột/index đúng nhu cầu | `HANDOFF` cho `db-dev`, không tự `ALTER TABLE` |

**Cấm tuyệt đối:** parse tiền, validate địa chỉ, hay chia lô bên trong `apps/api`. Ba việc đó đã có chủ. Viết lại là tạo ra hai nguồn sự thật, và chúng sẽ lệch nhau.

## Luật riêng

- **Không endpoint nào chờ chain.** Ghi nhận → `202` → xử lý sau.
- **Mọi POST cần `Idempotency-Key`.** Thiếu → `400`, không có ngoại lệ.
- **Error shape cố định** (xem `docs/specs/nhip-mvp.md`): `{ error: { code, message, details, requestId } }`.
- **Không trả `number` cho tiền.** Luôn string từ `toDecimalString`.
- **Log không chứa PII**: không log tên người lao động, không log địa chỉ đầy đủ, không log API key.

## Thứ tự làm một endpoint

1. Viết test gọi endpoint và assert status + shape **trước** khi viết handler.
2. Viết handler tối thiểu làm test xanh.
3. Thêm validation cho từng trường hợp xấu, mỗi trường hợp một test.
4. Chạy `npm run verify`.

## Xong khi

`npm run verify` xanh, và có ít nhất một test cho: happy path, thiếu auth, payload sai, và trùng idempotency key.
