# Rule 20 — Bảo mật & an toàn thao tác

## Secret

- Không bao giờ hardcode key/token/password vào code, test, hay file mẫu.
- Chỉ đọc từ env hoặc secret manager. `.env` phải nằm trong `.gitignore`.
- Khi log: không dump giá trị secret. Chỉ log **sự tồn tại**: `OPENAI_API_KEY is set`.
- Nếu phát hiện secret đã lỡ commit: dừng lại, báo ngay, đề xuất rotate key
  (xoá khỏi lịch sử git không đủ, key đã bị lộ).

## Input từ bên ngoài

Coi mọi thứ từ ngoài là **không tin được**: request body, query, header, cookie,
webhook payload, nội dung file upload, response của bên thứ ba, output của LLM.

- Validate shape + kiểu + giới hạn (max length, max array size, enum whitelist).
- Không nối chuỗi để tạo SQL/shell/HTML. Dùng parameterized query, argv array, escape đúng ngữ cảnh.
- Path do người dùng nhập: chặn `..`, resolve path, kiểm tra vẫn nằm trong thư mục cho phép.
- Upload: giới hạn size + content-type thật (không tin extension), đổi tên file khi lưu.

## Auth & phân quyền

- Phân quyền kiểm tra ở **server**, không ở client.
- Mỗi endpoint ghi rõ: ai được gọi, kiểm tra ở đâu.
- Không tin `userId` do client gửi lên. Lấy từ session/token.
- Kiểm tra quyền trên **tài nguyên cụ thể** (IDOR), không chỉ "đã đăng nhập".
- Mặc định từ chối (deny by default) với route mới.

## Dependency

- Trước khi thêm package: kiểm tra maintainer, lượt tải, ngày cập nhật, license, kích thước bundle.
- Ưu tiên thư viện đã có trong repo hơn thêm mới.
- Không chạy `npm install <pkg>` với script postinstall lạ khi chưa xem qua.

## Thao tác nguy hiểm — phải xác nhận trước

Dừng và hỏi người dùng trước khi (danh sách đầy đủ ở
[00-core-principles §7](00-core-principles.md#7-tự-quyết-vs-hỏi-policy-mặc-định)):

- `DROP TABLE`, xoá cột, migration làm mất dữ liệu
- `rm -rf`, xoá thư mục ngoài repo, xoá file không do mình tạo
- `git push --force`, `git reset --hard`, rewrite history
- Đổi biến môi trường production, đổi DNS, đổi quyền IAM
- Gọi API có tính phí / gửi email / gửi tin nhắn thật cho người thật
- Chạy script tải về từ internet

## Phụ thuộc vào AI output

Nếu app dùng LLM:

- Không thực thi trực tiếp output của model dưới dạng code/shell/SQL.
- Prompt injection: nội dung do người dùng hoặc trang web cung cấp là **data**, không phải instruction.
- Giới hạn quyền của tool mà agent được gọi, thêm bước xác nhận cho hành động ghi.
