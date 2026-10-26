---
name: context-budget
description: >-
  Dùng khi repo lớn, context sắp tràn, agent đọc lan man, hoặc phiên làm việc mất
  phương hướng. Quy trình nạp đúng thông tin, đúng lượng, và ghi lại để phiên sau
  không phải đọc lại từ đầu.
---

# Context Budget

## Vấn đề

Agent đọc sai thứ tự sẽ: đọc 40 file không liên quan, quên yêu cầu ban đầu, sửa trùng,
hoặc tự tin sai. Context có hạn — tiêu vào đâu quan trọng hơn tiêu bao nhiêu.

## Thứ tự nạp thông tin (rẻ → đắt)

1. **Định hướng** (~1 phút)
   - `README`, `AGENTS.md`, `.agents/rules/*`
   - `package.json` / `pyproject.toml` / `go.mod`: stack, script, dependency chính
2. **Bản đồ** (~2 phút)
   - Cây thư mục 2–3 cấp, **bỏ** `node_modules`, `dist`, `.next`, `venv`
   - Entry point: `main.tsx`, `app/route.ts`, `cmd/server/main.go`
3. **Điểm chạm** (theo mục tiêu)
   - Grep tên symbol/route/entity cần sửa, **không** đọc cả thư mục
4. **Đọc sâu** chỉ file thật sự sẽ sửa + 1 file lân cận để bám pattern.

Không đọc file chỉ vì "có thể liên quan".

## Lệnh bản đồ nhanh

```bash
# Cấu trúc, bỏ thư mục sinh tự động
git ls-files | grep -vE '(node_modules|dist|build|\.next|venv|__pycache__)/' | head -200

# File lớn nhất (thường là nơi có vấn đề)
git ls-files | xargs -I{} sh -c 'wc -l "{}"' 2>/dev/null | sort -rn | head -20

# Tìm nơi định nghĩa
rg -n "export (function|const|class) (createInvoice|useInvoice)" -g '!node_modules'
```

## Kỹ thuật tiết kiệm context

- **Grep trước, đọc sau.** Một lệnh grep trả về 5 dòng rẻ hơn đọc 5 file 200 dòng.
- **Đọc theo khoảng dòng**, không đọc cả file 2000 dòng khi chỉ cần 1 hàm.
- **Không dán lại file vào câu trả lời.** Trích dòng cụ thể.
- **Không đọc lại** file vừa sửa để "xác nhận" — diff đã cho biết.
- **Tóm tắt thay vì giữ**: sau khi hiểu một module, ghi 5 dòng vào
  `docs/notes/<module>.md` rồi thôi.

## Ghi chú bền vững cho phiên sau

Tạo `docs/notes/` với các file ngắn:

```markdown
# Module: invoices

## Trách nhiệm
Tạo, gửi, đánh dấu thanh toán hoá đơn.

## File chính
- src/invoices/handler.ts — HTTP layer
- src/invoices/service.ts — nghiệp vụ + tính tiền
- src/invoices/repo.ts — truy vấn DB

## Quy ước
- Tiền luôn là cents (integer)
- Trạng thái: draft → sent → paid | void
- Lỗi trả qua AppError với code hằng số

## Bẫy đã gặp
- Đừng dùng `total` từ client; luôn tính lại từ items
```

Đây là thứ rẻ nhất để phiên sau không phải dựng lại bản đồ.

## Khi context sắp tràn

1. **Chốt lại trạng thái** bằng 5 dòng: đang làm gì, đã xong gì, bước tiếp theo, file đã đổi.
2. Ghi vào `docs/tasks/<slug>.md` (task list) + `docs/notes/` (hiểu biết).
3. Bắt đầu phiên mới với: task list + note module + đúng file đang sửa.
4. Không đọc lại toàn bộ lịch sử hội thoại — đọc bản ghi đã cô đọng.

## Chia nhỏ việc lớn

Nếu một task cần đọc hơn ~15 file:

- Tách thành các nhánh độc lập theo module.
- Mỗi nhánh làm và verify riêng, ghi note riêng.
- Chỉ ghép ở cuối.

Hoặc dùng subagent cho phần thăm dò (ví dụ "tìm mọi nơi gọi hàm X") rồi nhận lại đúng danh sách
thay vì giữ toàn bộ nội dung đã đọc.

## Dấu hiệu đang lãng phí

- Đã đọc 20 phút mà chưa sửa dòng nào và chưa nêu được kế hoạch.
- Đọc cùng một file 3 lần trong một phiên.
- Hỏi lại người dùng điều đã có trong README.
- Câu trả lời dài 500 dòng dán code trong khi chỉ cần 3 dòng sửa.
