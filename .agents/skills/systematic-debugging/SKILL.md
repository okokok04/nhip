---
name: systematic-debugging
description: >-
  Dùng khi gặp bug, test fail, build fail, hành vi lạ hoặc chậm bất thường.
  Bắt buộc tìm root cause trước khi sửa. Không đoán mò, không thêm fix chồng fix.
---

# Systematic Debugging

## Luật sắt

```
KHÔNG SỬA KHI CHƯA TÌM RA ROOT CAUSE
```

Áp dụng cho **mọi** sự cố kỹ thuật. Đặc biệt khi:

- Đang gấp / sếp giục / production sập
- "Chắc chỉ cần sửa một dòng"
- Đã thử 2–3 cách mà vẫn lỗi
- Lỗi không reproduce được
- Bạn không thật sự hiểu tại sao nó chạy

Lý do: sửa mò tạo bug mới, che mất bug cũ, và tốn thời gian hơn đi đúng đường.

## Pha 1 — Điều tra root cause

### 1.1 Đọc lỗi cho kỹ

- Đọc **toàn bộ** stack trace, không nhảy tới dòng đầu tiên.
- Ghi lại: file, dòng, mã lỗi, message đầy đủ.
- Warning thường là manh mối; đừng bỏ qua.
- Nếu lỗi bị wrap nhiều lớp → tìm `cause`.

### 1.2 Reproduce ổn định

- Có reproduce được không? Bao nhiêu %?
- Bước chính xác để trigger là gì?
- Khác biệt giữa lần lỗi và lần không lỗi?
- Không reproduce được → **thu thêm bằng chứng**, không đoán.

### 1.3 Xem thay đổi gần đây

```bash
git log --oneline -15
git diff HEAD~3 -- <đường dẫn liên quan>
```

Kiểm tra: dependency mới, env thay đổi, migration mới, config bị đổi, ai vừa merge.

### 1.4 Đo tại biên giữa các tầng

Với hệ nhiều tầng (UI → API → service → DB → third-party), **đừng đoán tầng nào lỗi** —
đặt log tại biên rồi chạy một lần:

```
Tại mỗi biên, log:
  - trạng thái input thực tế (redact secret)
  - status/exception
  - correlation id
  - thời gian tại biên đó
```

Chạy 1 lần → nhìn thấy **nơi dữ liệu trở nên sai** → chỉ điều tra tầng đó.

Ví dụ (không bao giờ dump secret):

```js
console.log('token present:', Boolean(process.env.API_TOKEN))
console.log('payload keys:', Object.keys(body))
```

### 1.5 Truy ngược dòng dữ liệu

Khi lỗi nằm sâu trong call stack:

1. Giá trị **sai** xuất hiện đầu tiên ở đâu?
2. Hàm nào truyền giá trị sai vào đó?
3. Truy ngược tiếp cho tới khi tìm ra **nơi giá trị được sinh ra**.
4. Sửa ở **gốc**, không sửa ở chỗ nó bị nổ.

Ví dụ: `Cannot read property 'id' of undefined` ở component A.
Đừng `if (user?.id)`. Truy ngược: component A nhận `user` từ hook B;
hook B đọc `res.data.user` nhưng API trả `res.data.data.user`. Sửa ở hook B.

## Pha 2 — Phân tích pattern

Trước khi sửa, tìm **cái đang chạy đúng**:

1. Có code tương tự hoạt động đúng trong repo không?
2. Khác nhau chính xác ở đâu? Liệt kê **từng** khác biệt, kể cả nhỏ.
3. Đọc reference implementation **đầy đủ**, không skim.
4. Dependency, config, env mà cái đúng cần — cái sai có thiếu gì?

Sai lầm phổ biến: cho rằng "khác biệt nhỏ đó không thể gây lỗi". Thường chính nó.

## Pha 3 — Giả thuyết và kiểm chứng

1. **Nêu một giả thuyết duy nhất, viết ra thành câu:**
   `Tôi cho rằng X là root cause vì Y. Nếu đúng thì Z sẽ xảy ra.`
2. **Thay đổi nhỏ nhất để kiểm chứng** — một biến, một lần.
3. **Chạy và quan sát.** Khớp dự đoán → sang Pha 4. Không khớp → **giả thuyết mới**,
   không chất thêm fix lên fix cũ.
4. Nếu 3 giả thuyết liên tiếp sai → bạn đang thiếu thông tin. Quay lại Pha 1,
   thêm instrumentation, hoặc hỏi người dùng.

Câu cần nói được: **"Tôi chưa hiểu X"** — nói ra tốt hơn giả vờ hiểu.

## Pha 4 — Sửa và chốt

1. **Viết test tái hiện lỗi** (nếu có thể). Test này phải **đỏ** trước khi sửa.
2. Sửa ở root cause.
3. Test tái hiện **xanh**.
4. Chạy **toàn bộ** test liên quan + typecheck + lint.
5. Thêm test cho các nhánh lân cận nếu root cause có thể xuất hiện ở nơi khác.
6. Ghi lại: root cause là gì, tại sao nó xảy ra, phòng ngừa thế nào (comment/README).

## Trường hợp khẩn cấp (production down)

Được phép **mitigate trước, root cause sau**, nhưng phải:

- Gọi rõ đây là **mitigation tạm**, không phải fix.
- Chọn hành động đảo ngược được: rollback > tắt feature flag > hotfix.
- **Lưu bằng chứng** (log, dump, snapshot) trước khi rollback, nếu không sẽ mất dấu.
- Ghi ticket riêng cho root cause. Mitigation không được coi là đã xong.

## Bảng nhanh theo triệu chứng

| Triệu chứng | Điều tra đầu tiên |
|---|---|
| TypeError undefined | Dòng dữ liệu từ API/state, xem shape thật |
| Test pass local, fail CI | Version, env, timezone, thứ tự test, file không commit |
| Chậm dần theo thời gian | Memory leak, listener không remove, cache không bound, N+1 query |
| Chập chờn | Race condition, async không await, timeout, retry storm |
| Build fail | Lockfile lệch, cache, version Node/Python, biến env thiếu lúc build |
| Chỉ lỗi trên prod | Env khác, HTTPS/CORS, dữ liệu thật khác dữ liệu seed |
| Lỗi sau deploy | Migration chưa chạy, cache cũ, asset hash cũ, CDN |

## Dấu hiệu đang làm sai

- Bạn đã sửa 3 chỗ và vẫn không chắc chỗ nào có tác dụng → đang đoán.
- Fix làm test cũ đỏ → bạn đang che bug, không sửa bug.
- Không viết được câu "root cause là ..." → chưa xong Pha 1.
