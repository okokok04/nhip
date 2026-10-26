# Rule 10 — Code style & cấu trúc

Nguyên tắc chung: **theo convention có sẵn của repo trước, rule này chỉ dùng khi repo chưa có.**

## Đặt tên

- Tên biến/hàm mô tả **ý định**, không mô tả kiểu: `retryDelayMs` tốt hơn `number2`.
- Boolean bắt đầu bằng `is/has/can/should`.
- Hàm bắt đầu bằng động từ: `createOrder`, `parseInvoice`.
- Không viết tắt tuỳ tiện. `usr`, `mgr`, `cfg` → viết đủ, trừ khi là convention domain.
- Nhất quán một khái niệm một tên. Đã gọi `invoice` thì đừng lúc khác gọi `bill`.

## Hàm

- Một hàm một việc. Nếu phải dùng "và" để mô tả → tách.
- Ưu tiên pure function cho logic; side effect đẩy ra biên (handler, adapter).
- Tham số > 3 → dùng object có tên field.
- Early return thay vì lồng `if` sâu quá 3 tầng.
- Giới hạn mềm: ~40 dòng/hàm, ~300 dòng/file. Vượt nhiều → tách theo trách nhiệm.

## Xử lý lỗi

- Không `catch` rồi bỏ qua im lặng. Tối thiểu log + rethrow hoặc trả lỗi có kiểu.
- Phân biệt lỗi **dự kiến** (validation, not found, conflict) và **bất ngờ** (bug, network).
  Lỗi dự kiến trả về kết quả có kiểu; lỗi bất ngờ để bubble up.
- Message lỗi phải nói **cái gì** và **ở đâu**: `Invalid invoice.total: expected number, got "abc"`.
- Không lộ stack trace / SQL / path nội bộ ra phía client.

## Type

- Không dùng `any`/`Any`/`interface{}` để né type. Nếu bí → `unknown` + thu hẹp kiểu.
- Dùng discriminated union cho state machine thay vì nhiều boolean rời:
  `{ status: 'loading' } | { status: 'error', error: E } | { status: 'ok', data: T }`.
- Validate dữ liệu ở biên (request, env, file, webhook) bằng schema runtime.
  Type của TypeScript không bảo vệ runtime.

## Comment

- Comment giải thích **vì sao**, không kể lại **cái gì**.
- Không comment kiểu `// increment i`.
- Mọi workaround phải kèm lý do + link issue nếu có.
- Comment cũ không liên quan đến thay đổi hiện tại: **giữ nguyên**, không xoá.

## Format & lint

- Không tranh luận style bằng tay: để formatter quyết.
- Trước khi báo xong: chạy `lint` + `typecheck` + `test` của repo.
- Nếu repo chưa có, đề xuất thêm script vào `package.json`/`Makefile` thay vì chạy lệnh rời.

## Cấu trúc file

- Cùng một feature → gần nhau (feature-first) hơn là rải theo loại file.
- Không tạo `utils.ts` phình to. Utils phải có chủ đề: `date-utils`, `currency`.
- File index/barrel chỉ để export, không chứa logic.
