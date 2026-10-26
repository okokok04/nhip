---
name: api-contract
description: >-
  Dùng khi thiết kế hoặc sửa HTTP/RPC endpoint, viết OpenAPI, định nghĩa error model,
  versioning, pagination hoặc webhook. Chốt contract trước khi code cả hai phía.
---

# API Contract

## Nguyên tắc

API là **hợp đồng**. Chốt trước, code sau. Client và server không được đoán ý nhau.

## 1. Đặt tên và hình dạng

```
GET    /invoices?status=paid&limit=20&cursor=abc
GET    /invoices/:id
POST   /invoices
PATCH  /invoices/:id
DELETE /invoices/:id
POST   /invoices/:id/actions/send     # hành động không map vào CRUD
```

- Danh từ số nhiều, `kebab-case` cho path segment, `camelCase` cho JSON field.
- Động từ chỉ dùng cho hành động không phải CRUD (`/actions/send`, `/actions/retry`).
- Không lồng quá 2 cấp: `/users/:id/invoices` được, `/users/:id/invoices/:iid/items` thì tách.
- Nhất quán một khái niệm một tên: đã `invoice` thì đừng có `bill` ở endpoint khác.

## 2. Status code

| Code | Dùng khi |
|---|---|
| 200 | GET/PATCH thành công có body |
| 201 | Tạo mới thành công, kèm `Location` header |
| 204 | Thành công, không có body (DELETE) |
| 400 | Payload sai định dạng / thiếu field |
| 401 | Chưa xác thực |
| 403 | Đã xác thực nhưng không có quyền |
| 404 | Không tồn tại **hoặc** không có quyền xem (tránh lộ sự tồn tại) |
| 409 | Xung đột trạng thái (trùng unique, version cũ) |
| 422 | Hợp lệ về cú pháp nhưng vi phạm nghiệp vụ |
| 429 | Vượt rate limit, kèm `Retry-After` |
| 500 | Lỗi server không lường trước |
| 503 | Phụ thuộc đang down / bảo trì |

Không trả 200 kèm `{ success: false }`. HTTP status phải nói đúng sự thật.

## 3. Error model thống nhất

Một shape duy nhất cho **mọi** lỗi:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Dữ liệu không hợp lệ",
    "details": [
      { "field": "total", "issue": "expected number, got string" }
    ],
    "requestId": "req_8f2c1a"
  }
}
```

- `code`: hằng số máy đọc được, không đổi theo thời gian (client switch trên nó).
- `message`: cho người đọc, có thể đổi. Không đưa stack trace / SQL / path nội bộ.
- `details`: tuỳ chọn, cho lỗi validation nhiều field.
- `requestId`: để trace log, luôn trả về cả ở lỗi 500.

## 4. Pagination

Chọn **một** kiểu và giữ nguyên toàn hệ thống.

**Cursor (khuyến nghị khi dữ liệu lớn/đổi liên tục):**

```json
{ "data": [...], "nextCursor": "eyJpZCI6MTIzfQ", "hasMore": true }
```

**Offset (chỉ khi cần nhảy trang):**

```json
{ "data": [...], "page": 2, "pageSize": 20, "total": 143 }
```

- `limit` mặc định 20, tối đa 100. Vượt → clamp, không 400.
- Sort mặc định phải **ổn định** (thêm `id` làm tie-breaker), nếu không cursor sẽ nhảy.

## 5. Validate input

Validate ở biên, bằng schema runtime (zod / pydantic / valibot), không chỉ type:

```ts
const CreateInvoice = z.object({
  customerId: z.string().uuid(),
  total: z.number().int().positive().max(1_000_000_000),
  currency: z.enum(['VND', 'USD']),
  note: z.string().max(2000).optional(),
  items: z.array(z.object({ sku: z.string().min(1), qty: z.number().int().min(1) })).min(1).max(200),
})
```

- Giới hạn **mọi** array và string (chống payload khổng lồ).
- Không nhận field lạ: strip hoặc reject, ghi rõ policy.
- Field không cho client đặt (`id`, `createdAt`, `role`, `ownerId`) → strip khỏi schema input.

## 6. Idempotency

Với POST tạo mới hoặc thao tác có tiền:

- Nhận header `Idempotency-Key` (UUID do client sinh).
- Lưu key + response trong ~24h; gọi lại cùng key trả **cùng** response, không tạo bản ghi thứ hai.
- Đây là yêu cầu bắt buộc cho payment/webhook, không phải "nice to have".

## 7. Versioning

- Breaking change = đổi shape, xoá field, đổi ý nghĩa field, đổi status code.
- Cách làm: thêm `/v2/...` hoặc header version. Không sửa lặng lẽ response cũ.
- Field mới: luôn optional và có default — không phá client cũ.
- Deprecate: giữ ≥ 1 chu kỳ release, trả header `Deprecation` + `Sunset`, ghi changelog.

## 8. Auth & phân quyền

- Mỗi endpoint ghi rõ: ai được gọi, kiểm tra ở tầng nào.
- Không tin `userId`/`role` từ body/query. Lấy từ session/token đã verify.
- Kiểm tra quyền trên tài nguyên cụ thể (chống IDOR), không chỉ "đã đăng nhập".
- Rate limit theo user + theo IP; trả `429` + `Retry-After`.

## 9. Webhook (nếu có)

- Ký payload (HMAC) + timestamp; verify trước khi xử lý; chống replay bằng timestamp window.
- Xử lý **idempotent** theo event id.
- Trả `2xx` nhanh, đưa xử lý nặng vào queue.
- Có endpoint replay thủ công cho vận hành.

## 10. Checklist trước khi code

```markdown
- [ ] Path + method + status code đã chốt
- [ ] Request schema (field, type, ràng buộc) đã chốt
- [ ] Response schema thành công đã chốt
- [ ] Error code list đã chốt
- [ ] Pagination/filter/sort đã chốt
- [ ] Ai được gọi + kiểm tra quyền ở đâu
- [ ] Có cần idempotency không
- [ ] Đã cập nhật OpenAPI/`docs/api.md` chưa
```

Chưa tick hết → chưa code. Contract sai rẻ hơn code sai rất nhiều.

## Dấu hiệu API kém

- Cùng một lỗi trả 3 shape khác nhau ở 3 endpoint.
- `POST /getUser` (động từ trong path, GET viết thành POST).
- `200 OK` kèm `{error: "..."}` .
- Không giới hạn `limit` → client gọi `limit=999999`.
- Response trả nguyên entity DB, gồm cả `passwordHash`.
