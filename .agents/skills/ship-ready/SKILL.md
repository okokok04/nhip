---
name: ship-ready
description: >-
  Dùng trước khi deploy, mở PR, phát hành bản mới hoặc bàn giao cho người khác.
  Kiểm tra cấu hình, env, migration, rollback, quan sát và thông báo — theo thứ tự.
---

# Ship Ready

Mục tiêu: không bao giờ deploy mà không biết cách phát hiện lỗi và cách quay lại.

## 1. Cổng chất lượng (bắt buộc)

Chạy đúng lệnh của repo, trích output thật:

```bash
<pm> run lint
<pm> run typecheck
<pm> test
<pm> run build      # build phải xanh, không chỉ dev chạy được
```

- Build phải chạy với `NODE_ENV=production` / cấu hình prod, không phải dev.
- Kiểm tra bundle size nếu là web: tăng > 20% cần giải thích.

## 2. Cấu hình & bí mật

```markdown
- [ ] Liệt kê biến env mới đã thêm vào `.env.example` (không kèm giá trị thật)
- [ ] Đã set trên môi trường đích chưa? (kiểm tra bằng tên, không in giá trị)
- [ ] Không có secret trong repo, trong log, trong ảnh build
- [ ] URL/domain trỏ đúng môi trường (dev không gọi prod DB)
- [ ] CORS/allowlist đúng domain
```

Kiểm tra nhanh không lộ giá trị:

```bash
node -e "console.log('DB_URL set:', Boolean(process.env.DATABASE_URL))"
```

## 3. Migration

```markdown
- [ ] Đã chạy thử trên bản copy dữ liệu thật (hoặc staging có dữ liệu giống)
- [ ] Có rollback, đã thử rollback
- [ ] Ước tính thời gian lock; nếu > vài giây → chạy ngoài giờ cao điểm
- [ ] Migration chạy **trước** code mới (hoặc code chịu được cả 2 schema)
```

## 4. Thứ tự deploy

```
1. Migration (tương thích ngược)
2. Deploy code mới
3. Kiểm tra sức khoẻ
4. Bật feature flag / migrate traffic
```

Không bao giờ deploy code đọc cột chưa tồn tại.

## 5. Kiểm tra sau deploy (smoke)

Chạy ngay sau khi deploy, không đợi người dùng báo:

```markdown
- [ ] Trang chủ / endpoint health trả 200
- [ ] Đăng nhập được
- [ ] Luồng chính vừa sửa chạy đúng trên môi trường thật
- [ ] Log không có lỗi mới trong 5 phút đầu
- [ ] Không có 5xx tăng bất thường
```

Ghi lại **output hoặc ảnh chụp** làm bằng chứng.

## 6. Rollback — phải có trước khi deploy

Chọn một và ghi rõ trong PR:

- Redeploy bản trước (tag/commit cụ thể: `<sha>`).
- Tắt feature flag.
- Rollback migration (chỉ khi migration đã thiết kế rollback an toàn).

Thời gian rollback ước tính: ______ phút.

Không có rollback → không deploy.

## 7. Quan sát

Tối thiểu:

- Log có cấu trúc (JSON) và có `requestId` xuyên suốt.
- Đếm lỗi theo route; alert khi 5xx vượt ngưỡng.
- Đo độ trễ p50/p95 cho endpoint chính.
- Với job nền: log số item xử lý, số lỗi, thời gian.

Nếu chưa có gì: thêm ít nhất một healthcheck + log lỗi có `requestId` trước khi ship.

## 8. PR / bàn giao

```markdown
## Thay đổi
- <mô tả ngắn, mệnh lệnh>

## Vì sao
- <vấn đề gốc / link issue>

## Cách kiểm chứng
- <lệnh + kết quả>
- <các bước thủ công nếu có>

## Rủi ro & rollback
- Rủi ro: ...
- Rollback: <cách, thời gian>

## Chưa làm
- <điều chưa làm, lý do>
```

## 9. Feature flag (khi thay đổi rủi ro)

- Flag mặc định **off**, bật theo tỉ lệ hoặc theo user.
- Flag có ngày hết hạn và người chịu trách nhiệm xoá.
- Không dùng flag thay cho branching vĩnh viễn — nợ kỹ thuật.

## Dấu hiệu ship ẩu

- "Chắc không sao đâu" thay cho smoke test.
- Không biết bản trước là commit nào.
- Migration chạy cùng lúc với deploy trên prod đang có traffic.
- Deploy chiều thứ Sáu không ai trực.
