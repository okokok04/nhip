# Nhịp

Hạ tầng trả lương tức thì cho nền tảng gig, chạy trên **Arc** (Circle L1).

> Trạng thái: **lát cắt MVP** — API nhận payout, chống trùng, chia lô theo ngân sách gas.
> **Chưa** gửi giao dịch lên chain. Xem [docs/specs/nhip-mvp.md](docs/specs/nhip-mvp.md) mục non-goal.

## Vấn đề

Nền tảng gig trả tiền theo tuần bằng batch file ngân hàng. Người lao động chờ 7 ngày,
nền tảng mất người-giờ đối soát, và không ai kiểm toán được dòng tiền cho tới khi có khiếu nại.

Trả 5.000 người/ngày trên Ethereum L1 tốn khoảng **$12.600** — 437% giá trị một đơn hàng
15.000đ. Trên Arc tốn khoảng **$3** (0,1%). Đó là toàn bộ lý do dự án này tồn tại.

## Chạy thử

```bash
npm install
npm run seed     # tạo dữ liệu mẫu, in API key (chỉ một lần)
npm run dev      # http://localhost:3000 — mở bằng trình duyệt
```

Seed ghi vào `./.data/nhip` (đã gitignore). Chạy lại `npm run seed` không nhân đôi dữ liệu,
chỉ xoay key.

Mở `http://localhost:3000`, dán key vừa in ra. Dashboard đọc thẳng từ API — không có mock,
không có số ước lượng. API key nằm trong `localStorage` của trình duyệt, không gửi đi đâu khác.

```bash
curl -H "Authorization: Bearer <key từ seed>" http://localhost:3000/v1/me
```

## API

Mọi route `/v1/*` cần header `Authorization: Bearer <api_key>`.

| Method | Path | Ghi chú |
|---|---|---|
| `GET` | `/health` | Public. Không lộ thông tin nội bộ |
| `GET` | `/` | Dashboard (static, cùng origin — không CORS) |
| `GET` | `/v1/me` | Thông tin nền tảng, gồm `maxPayoutsPerBatch` |
| `GET` | `/v1/overview` | KPI + lô gần đây, tính bằng SQL aggregate |
| `POST` | `/v1/workers` | Upsert theo `externalId`. Đổi ví là UPDATE, không tạo người mới |
| `GET` | `/v1/workers` | Danh bạ người nhận |
| `POST` | `/v1/payouts` | **Bắt buộc** `Idempotency-Key`. `202` lần đầu, `200` khi retry |
| `GET` | `/v1/payouts` | Cursor pagination, không OFFSET |
| `GET` | `/v1/payouts/:id` | |
| `POST` | `/v1/batches` | **Bắt buộc** `Idempotency-Key`. `207` khi có dòng bị từ chối |
| `POST` | `/v1/batches/from-queue` | Gom payout đang `queued` thành lô (`FOR UPDATE SKIP LOCKED`) |
| `GET` | `/v1/batches/:id` | Lô kèm danh sách payout |
| `GET` | `/v1/batches?requestKey=` | Các lô của một request |

### Ví dụ

```bash
curl -X POST http://localhost:3000/v1/payouts \
  -H "Authorization: Bearer $KEY" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"workerId":"wrk_...","amount_micro":"1650750","reference":"Đơn #1042"}'
```

`amount_micro` là **chuỗi số nguyên**, đơn vị 1e-6 USDC. `"1650750"` = 1,65075 USDC.
Gửi `1650.75` hoặc `1650750` (number) đều bị từ chối — không có cách đọc nào an toàn.

## Kiến trúc

```
packages/core   Domain thuần: tiền (bigint Micro), địa chỉ, chia lô. Không I/O.
packages/db     Schema + migration. Ràng buộc ở DB, không ở code.
apps/api        HTTP layer. Hono. Không chờ chain.
apps/web        Dashboard. HTML + CSS + ES module thuần, không framework, không build step.
scripts/        seed, lint-guards, team-check, team-board
```

Không ORM, không build step. TypeScript chạy trực tiếp bằng type-stripping của Node 24
(`erasableSyntaxOnly: true`).

## Làm việc nhóm

Repo này được thiết kế để nhiều agent cùng làm mà không giẫm chân nhau.

| File | Vai trò |
|---|---|
| [ROLE.md](ROLE.md) | Hiến pháp: 8 bất biến kỹ thuật, bảng quyền sở hữu file, giao thức |
| [CHAT.md](CHAT.md) | Nhóm chat chung, append-only, 7 loại tin |
| [.agents/roles/](.agents/roles) | 5 vai: `leader`, `core-dev`, `db-dev`, `api-dev`, `qa` |

```bash
npm run verify       # lint + typecheck + test + team:check — trước mọi "xong"
npm run team:check   # kiểm ROLE.md, role cards, CHAT.md, xung đột sở hữu
npm run team:board   # in trạng thái task
```

`team:check` **từ chối** một tin `DONE` không kèm output lệnh. Agent không báo "xong" suông được.

## Tám bất biến

Vi phạm một điều là blocker, không phải nit. `scripts/lint-guards.mjs` chặn phần chặn được bằng máy.

1. **B1** — Mọi số tiền là `bigint` brand `Micro`, 1e-6 USDC, trong JSON là string
2. **B2** — Cấm `parseUnits(x, 18)` cho USDC. Cấm alias `0xEeee…EEeE`
3. **B3** — Cấm gửi tới `address(0)` (Arc revert, Ethereum thì không)
4. **B4** — `maxFeePerGas` ≥ 20 Gwei (sàn của Arc)
5. **B5** — Không endpoint nào chờ chain
6. **B6** — Trạng thái `unknown` không bao giờ tự retry
7. **B7** — Idempotency là `UNIQUE` ở DB, không phải logic ở code
8. **B8** — Chain là source of truth; Postgres là read model

## Chưa làm (và biết là chưa làm)

- Gửi giao dịch lên Arc — cần key testnet có tiền từ [faucet.circle.com](https://faucet.circle.com)
- **Gas/payout = 28.000 là ước lượng**, chưa đo trên Arc Testnet. Toàn bộ mô hình chi phí dựa vào số này
- Webhook, `PayoutVault`, EIP-3009 relayer
- Adapter `pg` cho production (PGlite đủ cho pilot tới ~10k payout/ngày)
- Rate limit
- CI (`.github/workflows/verify.yml`) — hiện chỉ verify trên máy dev
