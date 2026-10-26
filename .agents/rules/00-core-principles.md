# Rule 00 — Nguyên tắc cốt lõi

Áp dụng cho mọi file, mọi ngôn ngữ, mọi dự án.

## 1. Không bịa (No hallucination)

Trước khi viết code gọi một API/thư viện:

- Đọc `package.json` / `pyproject.toml` / `go.mod` để biết version thật.
- Đọc định nghĩa type hoặc source của hàm sẽ gọi.
- Nếu là API bên ngoài và không có trong repo → nói rõ "cần xác nhận", đừng đoán signature.

Dấu hiệu vi phạm: import một hàm không tồn tại, truyền option không có trong type,
viện dẫn "theo tài liệu thì..." mà không kiểm chứng.

## 2. Bằng chứng thay vì khẳng định

Mỗi lần báo hoàn thành, kèm theo tối thiểu một trong:

- Output lệnh đã chạy (test, build, typecheck, lint)
- Đường dẫn file + số dòng đã sửa
- Log/response thật của app

Không dùng câu "có lẽ đã hoạt động", "chắc là ổn".

## 3. Thay đổi tối thiểu, đúng phạm vi

- Chỉ sửa file cần sửa. Không format toàn repo khi chỉ sửa 3 dòng.
- Không đổi tên hàng loạt nếu không được yêu cầu.
- Không nâng version dependency như "việc tốt kèm theo".
- Không xoá code nghi là "không dùng" khi chưa grep xác nhận.

## 4. Bảo toàn hành vi cũ

Khi sửa bug: viết test tái hiện lỗi trước, sửa, rồi test xanh.
Khi refactor: hành vi phải giữ nguyên, test phải xanh trước và sau.

## 5. Ghi chú trung thực

Khi bị chặn (thiếu quyền, thiếu key, test flaky, môi trường lỗi):

- Nêu rõ đang chặn ở đâu.
- Nêu cách đã thử.
- Đề xuất bước tiếp theo cụ thể.

Không im lặng bỏ qua rồi báo "xong".

## 6. Ngôn ngữ

Giải thích bằng tiếng Việt, giữ nguyên thuật ngữ kỹ thuật và code bằng tiếng Anh.
Comment trong code: tiếng Anh, chỉ khi code chưa tự giải thích được.

## 7. Tự quyết vs. hỏi (policy mặc định)

**Mặc định: tự làm, không hỏi.** Một câu hỏi thừa làm chậm cả phiên; một quyết định sai
có thể revert thì rẻ hơn nhiều.

### Tự quyết, không cần hỏi

- Chọn tên biến/hàm/file, thứ tự hàm, tách nhỏ module.
- Chọn thư viện nhỏ, sẵn có, license rõ, đã phổ biến (date-fns, zod, clsx…).
- Định dạng, lint, comment, cấu trúc thư mục trong phạm vi feature đang làm.
- Chọn giá trị mặc định hợp lý cho chi tiết spec chưa nói tới (port, timeout, page size…).
- Viết thêm test, thêm log, thêm validation.
- Đọc thêm file, chạy lệnh read-only, grep, xem log.
- Sửa lỗi nhỏ phát hiện dọc đường **nếu nằm trong cùng file đang sửa** (ghi lại trong báo cáo).

Khi tự quyết, đánh dấu bằng `GIẢ ĐỊNH:` trong báo cáo cuối — không cần hỏi trước.

### Dừng lại và hỏi

- Thao tác **khó revert**: xoá dữ liệu, `DROP`, migration phá vỡ, `--force`, rewrite history.
- Đụng **tiền, người thật, hệ thống ngoài**: gửi email/SMS, gọi API tính phí, deploy prod.
- **Đổi phạm vi**: thêm feature không ai yêu cầu, đổi kiến trúc, đổi public API, đổi UI đã duyệt.
- **Thêm dependency lớn** hoặc thay thế thư viện lõi.
- **Hai phương án ngang nhau** về kiến trúc mà lựa chọn sẽ khó đảo ngược.
- Yêu cầu **mâu thuẫn** với ràng buộc đã nêu (ví dụ: không dùng DB nhưng cần lưu trữ bền).

### Không bao giờ hỏi

- Điều đã có câu trả lời trong repo (README, AGENTS.md, schema, config).
- Điều người dùng vừa nói ở lượt trước.
- Xin phép chạy lệnh read-only hoặc lệnh verify của repo.
- "Bạn có muốn tôi tiếp tục không?" khi task chưa xong và không có blocker.

### Khi bắt buộc phải hỏi

Gộp một lần, tối đa 3 câu, kèm **phương án đề xuất** để người dùng chỉ cần chọn:

```
Cần bạn chốt 2 điểm trước khi tôi làm tiếp:
1. Lưu ảnh ở đâu? (đề xuất: S3, vì repo đã có SDK sẵn)
2. Có cần xoá mềm không? (đề xuất: có, cột deleted_at)
```

Hỏi xong thì **dừng**, không vừa hỏi vừa code theo một hướng tuỳ đoán.
