# Spec: Nhịp MVP — API payout + batch

> Trạng thái: đã chốt
> Ngày: 2026-10-27
> Plan gốc: `nhip-master-plan.md` (mục 2.6, 3.2, 3.7)

## Vấn đề

Nền tảng gig trả tiền cho người lao động theo tuần bằng batch file ngân hàng. Người lao động chờ 7 ngày, nền tảng mất người-giờ đối soát, và không ai kiểm toán được dòng tiền cho đến khi có khiếu nại.

## Phạm vi

### Trong phạm vi (lát cắt này)

- `POST /v1/payouts` — tạo một payout, idempotent theo header `Idempotency-Key`.
- `POST /v1/batches` — nhận danh sách payout, validate toàn bộ, trả `accepted[]` + `rejected[]`.
- `GET /v1/batches/:id` — trạng thái lô + từng payout.
- `GET /v1/payouts/:id`, `GET /v1/payouts?workerId=`
- `POST /v1/workers` — upsert người lao động theo `externalId`.
- `GET /health` — db + config.
- Batch builder: chia lô theo ngân sách gas, bảo toàn tổng tiền.
- Money math: micro-unit 6 decimals, không float, không mất chính xác.

### Ngoài phạm vi (non-goal) — có chủ ý

- Gửi giao dịch lên chain (T7–T9).
- Webhook (T10).
- Dashboard UI (T11).
- `PayoutVault.sol` — chế độ B, Phase 3.
- EIP-3009 relayer — chế độ C, Phase 2.
- Xác thực người lao động bằng passkey — Phase 2.
- Postgres adapter dùng `pg` cho production (PGlite dùng được cho pilot).

## Luồng chính

1. Nền tảng gọi `POST /v1/payouts` với `Idempotency-Key` + `{ workerId, amount_micro, reference }`.
2. Hệ thống ghi payout ở trạng thái `queued`, trả `202` trong < 100ms.
3. Hệ thống (hoặc `POST /v1/batches`) gom các payout `queued` thành lô theo ngân sách gas.
4. Lô chuyển `planned`; mỗi payout chuyển `batched` và gắn `batch_id`.
5. (Lát cắt sau) Lô được gửi lên Arc trong một tx.

## Tiêu chí nghiệm thu

- [ ] `POST /v1/payouts` không có `Idempotency-Key` → `400 VALIDATION_FAILED`, chi tiết chỉ rõ header thiếu.
- [ ] Hai request cùng `Idempotency-Key` → **một** payout trong DB. Request thứ hai trả `200` với `duplicate: true` và cùng `id`.
- [ ] 10 request **song song** cùng key → đúng 1 payout (test concurrency thật, không mock).
- [ ] `amount_micro` là float hoặc có dấu `.` → `400`, không bao giờ cắt âm thầm.
- [ ] `workerId` không thuộc nền tảng → `404 WORKER_NOT_FOUND`.
- [ ] `POST /v1/batches` với 1 dòng lỗi trong 3 dòng → 2 accepted, 1 rejected kèm index và mã lỗi; 2 dòng đúng vẫn tạo payout.
- [ ] Tổng `amount_micro` của mọi payout trong lô == tổng đầu vào sau khi chia lô (property test).
- [ ] Không lô nào vượt `gasBudget`; số payout mỗi lô không vượt `maxBatchSize`.
- [ ] `Authorization` sai hoặc thiếu → `401 UNAUTHENTICATED`.
- [ ] `GET /health` trả `200` với `db: "ok"` khi DB sống.
- [ ] `npm run verify` xanh từ máy sạch: typecheck + toàn bộ test.

## Ràng buộc & giả định

- **Ràng buộc:** mọi số tiền là `BIGINT` micro (6 decimals), hậu tố `_micro`, trong JSON là **string**. Không có ngoại lệ.
- **Ràng buộc:** USDC trên Arc có hai interface (native 18 dec, ERC-20 6 dec). Lát cắt này chỉ dùng 6 decimals. Không có chỗ nào gọi `parseUnits(x, 18)`.
- **Ràng buộc:** `address(0)` revert trên Arc → phải chặn ở tầng validate, không chờ chain.
- **Ràng buộc:** không endpoint nào chờ chain.
- `GIẢ ĐỊNH:` gas mỗi payout = 28.000. Đây là **ước lượng**, thay bằng số đo thật ở T9.
- `GIẢ ĐỊNH:` `gasBudget` = 10.000.000 (1/3 của 30M gas/block). Chưa có số đo thực tế về việc Arc có bị ảnh hưởng khi dùng 1/3 block.

## Rủi ro

| Rủi ro | Khả năng | Ảnh hưởng | Cách giảm |
|---|---|---|---|
| Lưu tiền sai đơn vị (18 vs 6) | Trung bình | Rất cao | Branded type `Micro`, một module convert duy nhất, test vector cố định |
| Idempotency bị vô hiệu do race condition | Trung bình | Rất cao | `UNIQUE (platform_id, idempotency_key)` ở DB, không dựa vào code; có test 10 request song song |
| PGlite khác Postgres ở SQL phức tạp | Thấp | Trung bình | Chỉ dùng SQL chuẩn; adapter `pg` là task riêng, cùng file migration |
| Gas estimate sai → lô vượt limit | Trung bình | Cao | `gasBudget` cấu hình được; đo thật ở T9; chưa gửi chain nên chưa có rủi ro thật |

## Câu hỏi còn mở

- PGlite có hỗ trợ đủ `TIMESTAMPTZ` + `BIGINT` như Postgres thật? (kiểm bằng test, không đoán)
- Tốc độ `INSERT ... ON CONFLICT` của PGlite dưới 10 request song song? (kiểm bằng test)
