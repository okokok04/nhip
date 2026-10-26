---
name: vibe-kickoff
description: >-
  Dùng khi ý tưởng còn mơ hồ, chưa rõ phạm vi, hoặc bắt đầu dự án/tính năng mới.
  Biến ý tưởng thô thành spec đã chốt — có mục tiêu, non-goal, ràng buộc và tiêu chí
  nghiệm thu — trước khi viết bất kỳ dòng code nào.
---

# Vibe Kickoff — từ ý tưởng đến spec đã chốt

## Mục đích

Chặn đứng 4 kiểu thất bại hay gặp nhất khi "vibe coding":

1. **Code trước, nghĩ sau** → xây sai thứ, phải làm lại.
2. **Giả định ngầm** → model tự đoán yêu cầu rồi đoán sai.
3. **Phạm vi phình** → thêm feature không ai yêu cầu.
4. **Không có định nghĩa "xong"** → không biết khi nào dừng.

Skill này **không cho phép viết code**. Vai trò của agent khi skill đang bật:
**facilitator + senior reviewer**, không phải builder.

## Khi nào dùng

- Người dùng nói "làm cho tôi cái app...", "thêm tính năng...", "tôi muốn..."
- Yêu cầu có từ mơ hồ: "đẹp", "nhanh", "hiện đại", "như Notion"
- Dự án mới, chưa có code hoặc mới có skeleton
- Tính năng lớn hơn ~1 ngày công

**Không dùng khi:** sửa typo, đổi màu, thêm 1 field đã rõ nghĩa, hoặc người dùng
đã đưa spec chi tiết.

## Quy trình

### Bước 0 — Đọc bối cảnh trước khi hỏi

Nếu repo đã có code, đọc trước rồi hãy hỏi:

- `README`, `package.json`/`pyproject.toml`, cấu trúc thư mục
- Entry point, routing, schema DB nếu có
- File `AGENTS.md` / `.agents/rules/*` để biết convention

Mục tiêu: **không hỏi những gì repo đã trả lời được.**

### Bước 1 — Hỏi từng câu một

Quy tắc:

- **Mỗi message một câu hỏi.** Không bắn 8 câu cùng lúc.
- Ưu tiên **multiple choice** (2–4 lựa chọn) hơn câu hỏi mở.
- Chỉ hỏi open-ended khi thật cần ngữ cảnh.
- Không hỏi lại điều người dùng vừa nói.

Thứ tự hỏi (bỏ qua câu đã rõ):

1. **Vấn đề** — người dùng cuối đang đau ở đâu? (không phải "feature gì")
2. **Người dùng** — ai dùng, dùng bao nhiêu người, trình độ kỹ thuật?
3. **Kết quả thành công** — đo bằng gì? Con số hay hành vi cụ thể.
4. **Non-goal** — chắc chắn **không** làm gì trong phiên bản này?
5. **Ràng buộc** — deadline, stack bắt buộc, hạ tầng có sẵn, ngân sách, ai maintain.
6. **Dữ liệu** — có sẵn chưa, ở đâu, ai sở hữu, có PII không?

### Bước 2 — Chốt non-functional (bắt buộc)

Phải có câu trả lời hoặc **giả định được đánh dấu rõ** cho:

| Hạng mục | Câu hỏi | Mặc định nếu không rõ |
|---|---|---|
| Hiệu năng | Thời gian phản hồi chấp nhận được? | API p95 < 300ms, trang LCP < 2.5s |
| Quy mô | Bao nhiêu user, bao nhiêu record? | < 1k user, < 100k row |
| Bảo mật | Có dữ liệu cá nhân / thanh toán? | Có auth, không lưu PII thừa |
| Độ sẵn sàng | Được phép downtime? | Best-effort, chưa cần HA |
| Vận hành | Ai deploy, ai trực lỗi? | Dev tự deploy, log ra stdout |
| Ngân sách | Chi phí hạ tầng / API? | Ưu tiên free tier |

Ghi rõ: `GIẢ ĐỊNH:` trước mỗi dòng tự đề xuất.

### Bước 3 — Understanding Lock (cổng cứng)

**Chưa được thiết kế kiến trúc trước khi người dùng xác nhận phần này.**

Xuất ra đúng 3 khối:

```markdown
## Tóm tắt hiểu biết
- Bài toán: ...
- Người dùng: ...
- Kết quả mong đợi: ...
- Ràng buộc chính: ...
- Non-goal: ...

## Giả định
- GIẢ ĐỊNH: ...
- GIẢ ĐỊNH: ...

## Câu hỏi còn mở
- ... (nếu không có, ghi "Không còn")
```

Rồi hỏi: **"Phần tóm tắt trên có đúng ý bạn chưa? Có chỗ nào cần sửa?"**

Chỉ tiếp tục khi người dùng xác nhận (hoặc sửa lại).

### Bước 4 — Viết spec ngắn

Spec không phải tài liệu 40 trang. Viết vào `docs/specs/<slug>.md`, tối đa ~1 trang:

```markdown
# <Tên tính năng>

## Vấn đề
<2–3 câu>

## Phạm vi
### Trong phạm vi
- ...
### Ngoài phạm vi
- ...

## Luồng chính
1. Người dùng ...
2. Hệ thống ...
3. Kết quả ...

## Tiêu chí nghiệm thu
- [ ] Khi <điều kiện>, thì <hành vi quan sát được>
- [ ] Khi <lỗi>, thì <thông báo/ mã lỗi cụ thể>

## Ràng buộc & giả định
- ...

## Rủi ro
| Rủi ro | Khả năng | Ảnh hưởng | Cách giảm |
|---|---|---|---|
```

Tiêu chí nghiệm thu phải **kiểm chứng được**. "UI đẹp" không kiểm chứng được;
"trang chủ render < 1s trên 3G, không layout shift" thì được.

### Bước 5 — Bàn giao

Kết thúc bằng:

1. Đường dẫn spec vừa viết.
2. Đề xuất bước tiếp theo: **`spec-driven-build`** để chia task và bắt đầu code.
3. Danh sách quyết định cần người dùng chốt (nếu còn).

## Ví dụ

**Người dùng:** "Làm cái app quản lý chi tiêu"

Hỏi lần lượt (mỗi lần 1 câu):

- "Ai sẽ dùng app này — chỉ bạn, hay cả gia đình/team?" → *chỉ tôi*
- "Bạn muốn nhập tay từng khoản, hay import sao kê ngân hàng?" → *nhập tay, import sau*
- "Điều gì khiến bạn thấy app này hữu ích? (a) biết tiền đi đâu (b) lập ngân sách (c) tiết kiệm mục tiêu" → *(a)*
- "Cái gì chắc chắn KHÔNG cần trong bản đầu?" → *không cần sync nhiều thiết bị, không cần báo cáo PDF*

Rồi xuất Understanding Lock và chờ xác nhận.

## Chế độ tự quyết (khi người dùng đã cho phép)

Nếu người dùng nói "tự quyết đi", "đừng hỏi", hoặc đang ở chế độ autonomy:

- **Bỏ Bước 1–3**, tự điền mọi câu trả lời từ bối cảnh repo + lựa chọn hợp lý nhất.
- Vẫn **xuất Understanding Lock** (Bước 3) nhưng ở dạng "đây là thứ tôi sẽ làm",
  kèm danh sách `GIẢ ĐỊNH:` — không chờ xác nhận, đi tiếp sang spec + build.
- **Vẫn dừng** nếu rơi vào danh sách "Dừng lại và hỏi" của
  [00-core-principles](../../rules/00-core-principles.md#7-tự-quyết-vs-hỏi-policy-mặc-định):
  đổi phạm vi lớn, thêm dependency lõi, hai kiến trúc ngang nhau, hay đụng tiền/dữ liệu thật.
- Trong báo cáo cuối, gộp phần "Giả định đã đưa ra" để người dùng soát một lần.

Mục tiêu: không biến việc chốt spec thành buổi phỏng vấn khi người dùng đã tin tưởng giao việc.

## Dấu hiệu đang làm sai

- Đã hỏi 5 câu mà vẫn chưa chốt được "xong là gì" → thiếu câu hỏi về tiêu chí nghiệm thu.
- Người dùng nói "cứ làm đại đi" → vẫn phải chốt non-goal, nếu không phạm vi sẽ nổ.
- Bạn bắt đầu nghĩ tới schema DB khi chưa có Understanding Lock → dừng lại.
