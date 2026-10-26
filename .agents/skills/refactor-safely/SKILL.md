---
name: refactor-safely
description: >-
  Dùng khi cần dọn code cũ, tách module, đổi kiến trúc hoặc xử lý nợ kỹ thuật.
  Refactor theo bước nhỏ, có test chắn, không đổi hành vi, không trộn với tính năng mới.
---

# Refactor Safely

## Luật đầu tiên

**Refactor = đổi cấu trúc, không đổi hành vi.**

Nếu trong diff có cả "đổi hành vi" và "đổi cấu trúc" → tách thành 2 PR.
Trộn lại thì khi có bug, không ai biết do đâu, và không revert được một nửa.

## Bước 0 — Có lưới an toàn chưa

Trước khi sửa một dòng:

```markdown
- [ ] Có test bao phủ phần sắp đổi chưa?
- [ ] Test đó đang xanh chưa?
- [ ] Chạy được trong bao lâu? (< 30s thì tốt)
```

Chưa có test → **viết test đặc tả hành vi hiện tại trước** (characterization test).
Test này không cần đẹp, chỉ cần khoá hành vi: input → output hiện tại.

Không có lưới mà refactor = đánh bạc.

## Bước 1 — Đo trước khi sửa

Ghi lại số liệu hiện tại để chứng minh cải thiện (hoặc để biết mình không làm tệ hơn):

```bash
# Độ phức tạp / kích thước
git ls-files '*.ts' | xargs wc -l | sort -rn | head -10

# Số nơi phụ thuộc vào module sắp đổi
rg -l "from ['\"].*old-module" -g '!node_modules'

# Thời gian test suite
time <pm> test
```

## Bước 2 — Chọn đúng kỹ thuật

| Tình huống | Kỹ thuật | Ghi chú |
|---|---|---|
| Hàm quá dài | Extract function theo từng khối có tên | Đặt tên khối trước, tách sau |
| `if` lồng sâu | Guard clause + early return | Làm từng nhánh một |
| Class/module làm quá nhiều | Tách theo trục thay đổi | Tách 1 trách nhiệm mỗi lần |
| Logic trùng ở nhiều nơi | Extract + thay thế từng chỗ | **Không** gộp khi chỉ giống bề mặt |
| Đổi tên khái niệm | Rename tự động của IDE, từng bước | Đừng rename tay |
| Đổi thư viện | Adapter mỏng → thay ruột → xoá adapter | Giữ interface ổn định |
| Code cũ không ai hiểu | Characterization test → viết lại có test | Không sửa dần vô định |

## Bước 3 — Làm từng bước nhỏ, commit liên tục

Mỗi bước phải **xanh** (test + typecheck + lint) trước khi sang bước sau.

Ví dụ tách 1 module lớn thành 3:

```
commit 1: thêm test đặc tả cho hành vi hiện tại
commit 2: extract hàm A ra file riêng, re-export (public API không đổi)
commit 3: extract hàm B, re-export
commit 4: chuyển call site sang import trực tiếp, xoá re-export cho A
commit 5: xoá re-export cho B
```

Không có commit nào làm đỏ test. Có thể dừng ở bất kỳ commit nào và vẫn chạy được.

## Bước 4 — Cấm trong refactor

- Thêm feature, đổi UI, đổi API response.
- Nâng version dependency (làm PR riêng).
- Đổi format toàn repo (làm PR riêng, và chỉ khi được yêu cầu).
- Xoá code "chắc không ai dùng" mà chưa grep xác nhận.
- Sửa test cho pass — nếu test đỏ, code refactor sai.
- Đổi tên hàng loạt cùng lúc với đổi cấu trúc.

## Bước 5 — Verify sau refactor

```markdown
- [ ] Test cũ xanh, không sửa test (trừ khi test bám implementation — ghi rõ lý do)
- [ ] Public API không đổi (kiểm export, response shape, CLI flag, env var)
- [ ] Bundle size không tăng bất thường
- [ ] Thời gian test không tăng đáng kể
- [ ] Diff đọc được: chủ yếu là di chuyển, ít dòng logic mới
```

Mẹo đọc diff: dùng `git diff -w` (bỏ qua whitespace) và `git diff --stat` để thấy tỉ lệ
di chuyển so với sửa thật.

## Bước 6 — Ghi lại quyết định

Với refactor lớn, thêm `docs/adr/<số>-<slug>.md` (Architecture Decision Record) ngắn:

```markdown
# ADR-003: Tách module invoices

## Bối cảnh
handler.ts 1.400 dòng, 3 trách nhiệm trộn lẫn, sửa 1 chỗ dễ vỡ 2 chỗ khác.

## Quyết định
Tách thành handler (HTTP) / service (nghiệp vụ) / repo (truy vấn).
Public API giữ nguyên.

## Hệ quả
+ Test service chạy được không cần HTTP
+ Diff sau này nhỏ hơn
− Thêm 2 lớp gián tiếp, phải đi qua 3 file khi trace
```

## Dấu hiệu refactor sai

- PR "refactor" có thêm feature.
- test bị sửa nhiều hơn code.
- Không nêu được hành vi nào được giữ nguyên và kiểm bằng gì.
- Refactor 2 tuần, không merge được gì.
