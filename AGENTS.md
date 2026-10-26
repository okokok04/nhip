# Vibe Kit — Quy tắc làm việc với agent

File này là **entrypoint**. Nó luôn được nạp vào context, nên giữ ngắn.
Chi tiết nằm ở `.agents/rules/` và `.agents/skills/`.

## 5 nguyên tắc bất biến

1. **Reality-first.** Không bịa API, không bịa tên field, không bịa kết quả test.
   Nếu chưa chắc → đọc source, chạy lệnh, đọc log. Chỉ hỏi khi đã thử và vẫn không xác định được.
   Không đoán.
2. **Verify, don't assert.** Mọi tuyên bố "đã xong" phải kèm bằng chứng: output lệnh,
   log, ảnh chụp, hoặc diff cụ thể. Không có bằng chứng = chưa xong.
3. **Small diffs.** Thay đổi nhỏ, một mục đích, dễ review, dễ revert. Không refactor
   lén trong PR tính năng.
4. **No placeholders.** Không `TODO`, không mock data giả, không `// implement later`
   trong code được coi là hoàn thành. Nếu cần placeholder thì nói rõ và đánh dấu.
5. **Tự quyết việc nhỏ, hỏi việc lớn.** Mặc định **tự làm, không hỏi**. Chỉ dừng lại khi
   việc đó khó revert, đụng dữ liệu/tiền/người ngoài, hoặc đổi phạm vi. Ngưỡng cụ thể ở
   `.agents/rules/00-core-principles.md`. Không hỏi lại điều đã có trong repo hoặc đã nói trước đó.

## Vòng lặp làm việc chuẩn

```
Hiểu → Chốt spec → Lập plan → Build từng bước nhỏ → Verify từng bước → Review → Ship
```

Không nhảy bước. Việc "nhỏ" thì rút gọn vòng lặp, nhưng không bỏ bước **Verify**.

## Skill map — dùng skill nào khi nào

| Tình huống | Skill |
|---|---|
| Ý tưởng còn mơ hồ, cần chốt phạm vi | `vibe-kickoff` |
| Đã có spec, cần biến thành task và code | `spec-driven-build` |
| Bug, test fail, hành vi lạ, perf tụt | `systematic-debugging` |
| Trước khi nói "xong" / trước khi commit | `code-review-gate` |
| Làm UI, design system, animation, responsive | `ui-craft` |
| Thiết kế endpoint, contract, error model | `api-contract` |
| Schema, migration, index, quan hệ dữ liệu | `data-model` |
| Quyết định test gì, test ở tầng nào | `test-strategy` |
| Chuẩn bị deploy / release | `ship-ready` |
| Repo lớn, context sắp tràn, agent đọc lung tung | `context-budget` |

## Definition of Done

Một task chỉ được coi là xong khi **tất cả** đúng:

- [ ] Code chạy được, không lỗi mới trong console/log
- [ ] Đã chạy linter + typecheck + test liên quan, và trích output thật
- [ ] Đã tự review diff theo `code-review-gate`
- [ ] Không có secret, không có `console.log` debug, không có file rác
- [ ] Docs/comment đi kèm đã cập nhật nếu hành vi công khai thay đổi
- [ ] Nêu rõ phần nào **chưa** làm hoặc **chưa** verify

## Cấm

- Cấm tự ý xoá dữ liệu, xoá migration, `DROP`, `rm -rf`, force push khi chưa được xác nhận.
- Cấm cài thêm dependency lớn mà không nêu lý do + phương án thay thế.
- Cấm commit khi test đỏ, rồi nói "sẽ sửa sau".
- Cấm sửa test để test pass, trừ khi test sai thật và có giải thích.
- Cấm báo cáo dài dòng kể lại việc đã làm; báo kết quả, bằng chứng, và rủi ro còn lại.
