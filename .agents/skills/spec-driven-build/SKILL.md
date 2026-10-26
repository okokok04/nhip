---
name: spec-driven-build
description: >-
  Dùng khi đã có spec hoặc yêu cầu rõ ràng và cần biến nó thành task nhỏ rồi code.
  Chia việc theo lát cắt dọc, build từng bước có verify, không code tràn lan.
---

# Spec-Driven Build

## Nguyên tắc

```
Spec → Task list → Lát cắt dọc nhỏ nhất → Code → Verify → Lặp
```

Ba luật cứng:

1. **Không code khi task chưa có tiêu chí nghiệm thu.** Task không verify được là task chưa rõ.
2. **Không code 2 tầng cùng lúc.** Xong tầng dưới (đã verify) rồi mới lên tầng trên.
3. **Không mở rộng phạm vi.** Phát hiện việc mới → ghi vào "Backlog", không làm luôn.

## Bước 1 — Đọc spec và code hiện có

Trước khi chia task:

- Đọc spec (`docs/specs/*.md`) hoặc tóm tắt yêu cầu từ người dùng.
- Xác định **entry point** sẽ chạm: route, component, service, job.
- Xác định **dữ liệu**: entity nào đọc/ghi, schema hiện tại ra sao.
- Xác định **pattern có sẵn** để bám theo (đừng phát minh kiến trúc mới).

Nếu repo có nhiều hơn ~50 file mà bạn chưa biết bố cục → chạy `context-budget` trước.

## Bước 2 — Chia task theo lát cắt dọc

**Sai (chia ngang):** "làm hết DB" → "làm hết API" → "làm hết UI".
Kết quả: 3 ngày chưa có gì chạy được, không verify được gì.

**Đúng (chia dọc):** mỗi task đi xuyên từ input tới output, tự chạy được, tự chứng minh được.

Ví dụ tính năng "tạo hoá đơn":

| # | Lát cắt | Verify bằng |
|---|---|---|
| 1 | POST /invoices nhận payload, trả 201 + id (in-memory) | `curl` thấy 201 |
| 2 | Lưu vào DB, đọc lại được bằng GET /invoices/:id | `curl` thấy đúng data |
| 3 | Validate input sai → 400 + lỗi field cụ thể | `curl` với payload hỏng |
| 4 | UI form tạo hoá đơn gọi API, hiện lỗi | bấm trên trình duyệt |
| 5 | Danh sách hoá đơn + phân trang | thấy 2 trang dữ liệu |

Mỗi dòng là một commit (hoặc một chuỗi commit) độc lập, revert được.

### Định dạng task

```markdown
- [ ] T3: Validate payload tạo hoá đơn
  - Làm gì: thêm schema validation ở handler POST /invoices
  - Chạm file: src/invoices/handler.ts, src/invoices/schema.ts
  - Xong khi: POST với total="abc" trả 400 + {field:"total"}
  - Không làm: chưa cần i18n cho message lỗi
```

## Bước 3 — Vòng lặp build

Với mỗi task:

1. **Đọc code liên quan** thật sự (không đoán nội dung file).
2. **Viết thay đổi nhỏ nhất** làm task đó xanh. Chưa tối ưu, chưa làm đẹp.
3. **Chạy verify** — đúng lệnh đã ghi trong "Xong khi".
4. **Chạy regression** — test/lint/typecheck của repo.
5. Nếu đỏ: dùng `systematic-debugging`, **không** thêm code mò.
6. Xanh: cập nhật checklist, sang task tiếp.

Không bao giờ: viết 500 dòng rồi mới chạy lần đầu.

## Bước 4 — Xử lý khi spec thiếu

Gặp tình huống spec không nói tới, chọn theo thứ tự:

1. **Cách đơn giản nhất đúng với spec** → làm, ghi `GIẢ ĐỊNH:` vào báo cáo.
2. Chi tiết nhỏ (tên field, thứ tự cột, timeout, page size) → **tự chọn**, không hỏi.
3. Chỉ **dừng và hỏi** khi lựa chọn khó revert hoặc đổi phạm vi — theo đúng danh sách
   trong [00-core-principles](../../rules/00-core-principles.md#7-tự-quyết-vs-hỏi-policy-mặc-định).

Không im lặng chọn rồi coi như spec đã nói vậy, nhưng cũng không hỏi vặt.

## Bước 5 — Bàn giao

Kết thúc phiên build:

```markdown
## Đã xong
- T1, T2, T3 — kèm output verify

## Chưa xong
- T4, T5 — lý do

## Giả định đã đưa ra
- ...

## Backlog phát sinh
- ...
```

Rồi chạy `code-review-gate` trước khi nói "hoàn thành".

## Mẫu task list

Lưu ở `docs/tasks/<slug>.md` để phiên sau đọc lại được:

```markdown
# Task list: <tính năng>
Spec: docs/specs/<slug>.md
Trạng thái: đang làm / xong / bỏ

## Lát cắt
- [x] T1 ...
- [ ] T2 ...
```

## Dấu hiệu đang làm sai

- Task list có dòng "refactor toàn bộ module X" → quá lớn, tách nhỏ.
- Đã 40 phút không chạy được lệnh verify nào → đang code mù.
- Commit message không nói được "thay đổi này làm gì xanh" → commit gộp quá nhiều.
