---
name: code-review-gate
description: >-
  Dùng trước khi commit, trước khi mở PR, hoặc khi được yêu cầu review code.
  Tự review diff theo checklist cứng, phân loại blocker/nên sửa/nit, và chỉ cho qua
  khi không còn blocker.
---

# Code Review Gate

## Vai trò

Bạn vừa là **tác giả** vừa là **reviewer khó tính**. Mục tiêu: bắt lỗi trước khi
người khác bắt. Không khen, không kể lại diff — chỉ nêu vấn đề và cách sửa.

## Bước 1 — Thu thập diff thật

```bash
git status --short
git diff                 # chưa stage
git diff --staged        # đã stage
git diff main...HEAD     # toàn bộ nhánh
```

Không review từ trí nhớ. Review từ diff thật.

## Bước 2 — Chạy cổng tự động

Chạy đúng các lệnh repo có (đọc `package.json` scripts / `Makefile` / `pyproject`):

```bash
<npm|pnpm|yarn> run lint
<npm|pnpm|yarn> run typecheck   # tsc --noEmit, mypy, pyright...
<npm|pnpm|yarn> test
```

Trích **output thật** vào báo cáo. Không nói "chắc pass".

Nếu repo chưa có các script này → đề xuất thêm (một dòng trong `package.json`),
không tự thêm framework nặng.

## Bước 3 — Checklist review

### A. Đúng yêu cầu

- [ ] Diff giải quyết đúng vấn đề trong spec/task, không làm việc khác.
- [ ] Không có thay đổi "tiện tay" (format, rename, nâng version) lẫn vào.
- [ ] Có đủ tiêu chí nghiệm thu của task chưa? Verify bằng gì?
- [ ] Không có code chết, `TODO`, mock data, đoạn comment-out.

### B. Đúng kỹ thuật

- [ ] Dùng đúng API/type hiện có (không bịa hàm, không bịa field).
- [ ] Xử lý lỗi: lỗi dự kiến trả kết quả có kiểu; lỗi bất ngờ bubble up + log.
- [ ] Không `any`/`as` để né type (hoặc có lý do ghi rõ).
- [ ] Async: có `await`/xử lý promise, không floating promise, không race.
- [ ] Nullable: `undefined`/`null` được xử lý thật, không `?.` che hết.
- [ ] Boundary: input ngoài được validate, không tin dữ liệu client.

### C. An toàn

- [ ] Không có secret, key, token trong diff.
- [ ] Query có tham số hoá; không nối chuỗi SQL/shell.
- [ ] Kiểm tra quyền ở server; không tin `userId` từ client.
- [ ] Không log dữ liệu nhạy cảm (password, token, PII).
- [ ] Không `console.log`/`print` debug còn sót.

### D. Hiệu năng (khi có chạm)

- [ ] Không N+1 query trong vòng lặp.
- [ ] Không render lại toàn bộ list khi chỉ 1 item đổi.
- [ ] Không load cả bảng rồi filter ở client khi dữ liệu có thể lớn.
- [ ] Ảnh/asset có kích thước và format hợp lý.
- [ ] Có index cho cột dùng để filter/sort thường xuyên.

### E. Dễ bảo trì

- [ ] Tên biến/hàm nói được ý định.
- [ ] Logic phức tạp có comment giải thích **vì sao**.
- [ ] Không copy-paste khối > 10 dòng ở 2 nơi (hoặc có lý do).
- [ ] Comment/docstring cũ không liên quan: **giữ nguyên**.
- [ ] Nếu đổi hành vi công khai (API, CLI, env): đã cập nhật docs.

### F. Test

- [ ] Bug fix có test tái hiện (đỏ trước, xanh sau).
- [ ] Test mới kiểm hành vi, không kiểm implementation detail.
- [ ] Không test nào bị sửa/xoá để "cho pass" mà không giải thích.

## Bước 4 — Phân loại phát hiện

Xuất báo cáo theo 3 mức, **mức cao nhất trước**:

```markdown
## BLOCKER (phải sửa trước khi merge)
1. `src/api/invoices.ts:42` — `userId` lấy từ query param, không kiểm tra quyền → IDOR.
   Sửa: lấy từ `ctx.session.userId`, thêm check owner.

## NÊN SỬA (nên sửa, có thể tách PR sau)
1. `src/invoices/list.tsx:88` — filter trong `map` gây O(n²) khi list > 1k.
   Sửa: `useMemo` + filter trước khi map.

## NIT (không chặn)
1. `src/invoices/form.tsx:12` — `data` nên đổi thành `invoice` cho rõ nghĩa.
```

Luôn kèm **đường dẫn: dòng**. Không nhận xét chung chung kiểu "code hơi khó đọc".

## Bước 5 — Quyết định

- Còn **BLOCKER** → không được nói "xong". Sửa hoặc báo chặn.
- Chỉ còn NIT → được ship, ghi lại để dọn sau.
- Review xong phải trả lời được: "Nếu merge bây giờ, rủi ro lớn nhất là gì?"

## Commit message gợi ý

```
<type>(<scope>): <việc đã làm, mệnh lệnh, <= 72 ký tự>

Vì sao: <lý do / bug gốc>
Verify: <lệnh đã chạy + kết quả>
```

`type`: feat | fix | refactor | perf | test | docs | chore | build

Ví dụ:

```
fix(invoices): lấy userId từ session thay vì query param

Vì sao: query param cho phép đọc hoá đơn của người khác (IDOR).
Verify: pnpm test src/invoices (12 passed); pnpm typecheck (clean)
```

## Dấu hiệu review kém chất lượng

- Không có BLOCKER nào trong 500 dòng diff → có thể bạn chưa đọc kỹ.
- Nhận xét chỉ về style trong khi logic có lỗi.
- Không chạy được lệnh verify nào mà vẫn kết luận "ổn".
