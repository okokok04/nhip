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

- [x] T11 — Settlement Loop thật trên Arc + biên nhận công khai
  - Làm gì:
    1. `migration 004`: `batches.settlement_mode` (`unsettled|onchain|simulated`), cột báo giá, `payouts.tx_hash/block_number/gas_used`, `platforms.is_demo/relayer_address`. Ràng buộc: lô `simulated` không được có `tx_hash`; payout `confirmed` phải có `tx_hash` trừ lô demo (trigger, vì điều kiện vắt qua hai bảng).
    2. `packages/core/settlement.ts`: `quoteBatchFee` (BigInt wei → micro, 1 micro = 10^12 wei), `canSubmit`, `canConfirm`, `settleBatchState`.
    3. `apps/api/chain.ts`: `ChainGateway` + viem, `TRANSFER_GAS_LIMIT = 75.000`, `maxFeePerGas = max(giá thị trường + 25%, 20 Gwei)`, `sumUsdcTransferLogs` **lọc theo địa chỉ contract** (mỗi transfer phát hai log `Transfer`).
    4. `POST /quote` → `POST /submit` (202, nonce cấp tuần tự) → `POST /confirm` (đọc receipt). Không endpoint nào chờ chain (B5).
    5. `GET /v1/receipts/:claimToken` public, `claim_token` 24 byte CSPRNG sinh ở Node, không trả địa chỉ ví.
    6. UI: tab "Thanh toán on-chain" (3 nút tách rời) + trang biên nhận `?claim=`.
  - Chạm file: `packages/db/migrations/004_settlement.sql`, `packages/db/src/migrate.ts`, `packages/db/src/pg.ts`, `packages/core/src/settlement.ts`, `apps/api/src/{chain,settlement.repo,settlement.route,receipts.route}.ts`, `apps/api/src/workers.repo.ts`, `apps/web/public/*`
  - Xong khi: `npm run verify` xanh; seed chạy lại không lỗi; biên nhận mở được mà không cần key.
  - **Bằng chứng:** `npm test` → **221 test pass, 0 fail** (46 suite), gồm 15 test `settlement.route.test.ts`, 10 `receipts.route.test.ts`, 11 `workers.repo.test.ts`. `node scripts/lint-guards.mjs` → 8 rule, 53 file sạch. `node scripts/team-check.mjs` → 42 kiểm tra xanh (33 tin chat). `npm run seed` → `workers 5 / payouts 52 / batches 1`, chạy hai lần liên tiếp không nhân đôi, `confirmed_at` = `created_at`. Gọi thật: `GET /v1/receipts/<token>` → 200, `totals.paid_micro = 870000000`, 10 dòng, token sai → 404.

## Ghi chú tiến độ

- 2026-10-27: T1–T11 xong. `npm run verify` → **221 test pass, 0 fail**, typecheck sạch, 42 kiểm tra team check xanh.
- Seed chạy thật: 5 worker, 52 payout, 1 lô lịch sử (`simulated`, không có `tx_hash`). Chạy lại không nhân đôi dữ liệu.
- Dashboard phục vụ cùng origin với API nên không có CORS: một key, một origin, không cấu hình thêm.
- `28.000 gas/payout` **đã bị thay bằng số đo thật**: 49.338 (ví ấm) – 74.826 (ví lạnh). Trần chia lô dùng 75.000. Con số cũ thấp hơn thực tế 1,8–2,7 lần, đủ để một lô 357 payout không bao giờ vào được block.
- Settlement chạy được nhưng **chưa gửi thật lần nào** trên mạng: chưa có `RELAYER_PRIVATE_KEY` có số dư. Vì vậy `GET /v1/me` trả `chain.configured = false` và UI tắt nút gửi thay vì báo lỗi sau khi bấm.

## Backlog phát sinh

- Đặt `DATABASE_URL` (Neon/Supabase) rồi kiểm `PgDatabase` với Postgres thật — hiện chỉ PGlite đã được chạy.
- Webhook + HMAC khi payout chuyển `confirmed`.
- Rate limit theo platform.
- `PayoutVault` + EIP-3009 để gộp nhiều người vào một tx.
- Luồng để người lao động tự khai địa chỉ ví từ link biên nhận (hiện người chưa có ví bị bỏ qua).
- `.github/workflows/verify.yml` — hiện chỉ verify trên máy dev.
