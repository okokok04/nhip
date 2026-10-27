# Task list: Nhịp MVP

Spec: `docs/specs/nhip-mvp.md`
Trạng thái: đang làm

## Lát cắt dọc

- [x] T1 — Repo skeleton + `npm run verify` chạy xanh
  - Làm gì: root workspaces, tsconfig strict, script `verify`, runner test tự tìm `*.test.ts`
  - Chạm file: `package.json`, `tsconfig.json`, `scripts/test-all.mjs`
  - Xong khi: `npm run verify` chạy và báo 0 test (chưa có test) mà không lỗi cấu hình
  - Không làm: chưa có CI, chưa có web app
  - **Bằng chứng:** `npm run verify` → 33 test pass, `tsc --noEmit` sạch, `team:check` 15 xanh

- [x] T2 — `packages/core`: money math
  - Làm gì: `Micro` branded type, `parseAmount`, `toDecimalString`, `add/sub/sum/cmp`
  - Chạm file: `packages/core/src/money.ts`, `money.test.ts`
  - Xong khi: 6 test vector của spec pass; `parseAmount("1.2345678")` throw
  - Không làm: chưa có format theo locale VN
  - **Bằng chứng:** 15 test xanh. Bug thật đã bắt: `parseAmount` nhận `number` ở runtime gây `TypeError` thay vì `MoneyFormatError` → đã thêm runtime guard

- [x] T3 — `packages/core`: address guard
  - Làm gì: `normalizeAddress`, checksum EIP-55, chặn `0x000...0`
  - Xong khi: zero address → throw; địa chỉ thường → lowercase; checksum sai → throw
  - **Bằng chứng:** 9 test xanh. Quyết định: **không** dùng `isAddress(strict)` của viem vì nó từ chối all-uppercase; chuẩn Ethereum coi all-upper là "không kèm checksum". Dữ liệu từ hệ thống cũ hay upper toàn bộ — từ chối là bug tương thích

- [x] T4 — `packages/core`: batch builder
  - Làm gì: `planBatches` chia theo `gasBudget`, `maxBatchSize`; bảo toàn tổng tiền
  - Xong khi: 1.000 payout → tổng tiền bảo toàn, không payout nào mất/nhân đôi
  - **Bằng chứng:** 9 test xanh, gồm test "KHÔNG mất và KHÔNG nhân đôi" trên 1.234 payout

- [x] T5 — DB schema + migrate
  - Làm gì: `001_init.sql` với `UNIQUE (platform_id, idempotency_key)`; runner migration
  - Xong khi: migrate chạy 2 lần liên tiếp không lỗi (idempotent)
  - **Bằng chứng:** 10 test xanh. Mọi ràng buộc được chứng minh bằng **mã lỗi Postgres** (`23505`, `23514`), không phải bằng code kiểm tra trước

- [x] T6 — Auth + `GET /health`
  - Làm gì: bearer key → sha256 → tra `platforms`; health trả trạng thái db
  - Chạm file: `apps/api/src/auth.ts`, `apps/api/src/server.ts`, `apps/api/src/app.ts`
  - Xong khi: thiếu key → 401; key đúng → 200; `health` trả `{ db: "ok" }`
  - Không làm: chưa có rate limit
  - **Bằng chứng:** 9 test trong `app.test.ts`. Key lưu dạng sha256, không lưu thô. Message của "key sai" và "key không tồn tại" giống hệt nhau — nếu khác thì đó là kênh dò xem một key có tồn tại hay không

- [x] T7 — `POST /v1/payouts` + idempotency
  - Làm gì: validate, `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, trả 202/200
  - Chạm file: `apps/api/src/payouts.route.ts`, `payouts.repo.ts`, `validate.ts`
  - Xong khi: 10 request song song cùng key → 1 payout (test thật, không mock)
  - Không làm: chưa gửi chain
  - **Bằng chứng:** 26 test HTTP trong `routes.test.ts`. Test "10 request SONG SONG": đúng 1 response 202, 9 response 200, tất cả cùng một id, DB có 1 dòng. Bug thật đã bắt: PGlite trả BIGINT thành `number` khi vừa safe-integer → sửa bằng `::text` trong SQL

- [x] T8 — `POST /v1/batches` + `GET /v1/batches/:id`
  - Làm gì: validate toàn bộ, accepted/rejected, chia lô, gán `batch_id` trong một transaction
  - Chạm file: `apps/api/src/batches.route.ts`, `batches.repo.ts`, `packages/db/migrations/003_batch_request_key.sql`
  - Xong khi: 2 đúng + 1 lỗi → 2 accepted, 1 rejected, lô có 2 payout
  - **Bằng chứng:** test 400 payout vượt trần gas → chia nhiều lô, tổng tiền bảo toàn từng micro. Retry cùng key → 200 duplicate. Dùng lại key với payload khác → 409, không trả kết quả cũ im lặng

- [x] T9 — `apps/web`: dashboard đọc API thật
  - Làm gì: HTML + CSS + ES module thuần, phục vụ từ chính API (`serveStatic`), không framework, không build step
  - Chạm file: `apps/web/public/index.html`, `styles.css`, `app.js`, `money.js`, `apps/web/money.test.js`, `apps/api/src/app.ts`, `apps/api/src/static.test.ts`
  - Xong khi: mở `http://localhost:3000` bằng trình duyệt, nhập key → KPI và bảng hiện số thật từ DB; submit payout → dòng mới xuất hiện; gom lô → toast số lô + số payout
  - Không làm: chưa có biểu đồ theo thời gian, chưa có màn quản lý worker
  - **Bằng chứng:** `npm run verify` → 174 test pass, 0 fail. Trong đó 7 test `static.test.ts` (MIME `text/html; charset=utf-8`, `text/css`, `text/javascript`, chặn `../`, API không bị static nuốt) và 25 test `money.test.js` (`1.650,75` vs `1,650.75` vs `1.650.000`, quá 6 chữ số → lỗi chứ không làm tròn, `10^18` micro không mất chính xác). Gọi thật: `GET /` → 200, `GET /v1/overview` → `queued 12 · confirmed 40 · workers 5 · batches 1`

- [x] T10 — Nâng cấp toàn diện UI/UX & tính năng hệ thống Nhịp theo aitmpl.com, oneliq.xyz, ezwallet.cash
  - Làm gì:
    1. Thiết kế Design System cao cấp: Theme Dark/Light tự động lưu `localStorage`, Arc Horizon Aurora mesh, Liquid Glass, phông chữ Space Grotesk / Inter / JetBrains Mono.
    2. Cấu trúc 4 phân hệ Tab hoàn chỉnh: Vận hành & Dòng tiền, Mạng Arc & Tính kinh tế, Chia lô hàng loạt (Bulk Payout Planner), Danh bạ & Cổng tra cứu biên nhận (Worker Portal).
    3. Command Palette (`Ctrl+K` / `⌘K` - học aitmpl.com) tìm kiếm và thao tác nhanh.
    4. Batch Details Drawer: Bấm vào bất kỳ lô nào để gọi `GET /v1/batches/:id` xem chi tiết từng payout trong lô.
    5. Máy tính tiết kiệm phí tự động Arc L1 vs Ethereum L1 (học oneliq.xyz).
    6. Cổng tra cứu biên nhận người nhận tức thì (học ezwallet.cash: tối giản, nhanh, không ma sát).
  - Chạm file: `apps/web/public/index.html`, `apps/web/public/styles.css`, `apps/web/public/app.js`, `.agents/roles/web-dev.md`
  - Xong khi: Giao diện đầy đủ tính năng, tương thích Dark/Light mode, tuân thủ nghiêm ngặt B9 (lỗi hiện `—`, cấm hiện 0) và B10 (BigInt micro), `npm run verify` chạy xanh toàn bộ.
  - **Bằng chứng:** `npm run verify` xanh 100%: 174 test pass, 0 fail, 8 rule lint guards sạch, 30 kiểm tra team check xanh.

## Ghi chú tiến độ

- 2026-10-27: T1–T10 xong hoàn chỉnh. `npm run verify` → **174 test pass, 0 fail**, typecheck sạch, team:check 30 xanh.
- Seed chạy thật: 5 worker, 52 payout, 1 lô lịch sử. Chạy lại không nhân đôi dữ liệu.
- Dashboard phục vụ cùng origin với API nên không có CORS: một key, một origin, không cấu hình thêm.
- Chưa chạm chain ở lát cắt này. `PayoutVault` và EIP-3009 để Phase 2–3.
- Rủi ro đang mở: `28.000 gas/payout` vẫn là **ước lượng**. Cần đo thật trên Arc Testnet trước khi chốt `gasBudget`.

## Backlog phát sinh

- Adapter `pg` cho production (PGlite dùng được cho pilot tới ~10k payout/ngày).
- Webhook + HMAC.
- Script đo gas thật trên Arc Testnet.
- Rate limit theo platform.
- Gửi transaction lên Arc (`PayoutVault` + EIP-3009).
- `.github/workflows/verify.yml` — hiện chỉ verify trên máy dev.
