# Arc Platform — ghi chú đã kiểm chứng

File này chỉ chứa thứ **đã đọc từ nguồn chính thức**. Mục đích: chặn việc bịa API/config
trong các phiên sau. Có gì chưa chắc thì nằm ở mục "Chưa kiểm chứng" cuối file.

Nguồn: `https://docs.arc.io/llms.txt` (index), `docs.arc.io/arc/references/*`,
`docs.arc.io/arc/concepts/stablecoin-native-model.md`, `docs.arc.io/arc/references/gas-and-fees.md`,
`docs.arc.io/arc/references/connect-to-arc`, `arc.network`.

## Mạng

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | `5042` | `5042002` |
| RPC | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Explorer | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` |
| Gas token | USDC | USDC |
| Faucet | — | `https://faucet.circle.com` |

RPC dự phòng (đã có trong docs): Alchemy, Blockdaemon, dRPC, QuickNode.
WebSocket cũng có cho các provider đó.

`viem/chains` đã có sẵn `arc` (mainnet) và `arcTestnet` — **không cần defineChain tay**.
Với Reown AppKit thì phải import `defineChain` từ `@reown/appkit/networks` và bổ sung
`caipNetworkId` + `chainNamespace`, nếu không sẽ lỗi runtime.

## USDC — điểm dễ sai nhất

USDC vừa là native token (gas) vừa có interface ERC-20 trên **cùng một số dư**.

| Interface | Decimals | Dùng cho |
|---|---|---|
| Native | 18 | gas, `msg.value`, `eth_getBalance`, `address.balance` |
| ERC-20 | 6 | `transfer`, `approve`, `balanceOf` |

Địa chỉ ERC-20: `0x3600000000000000000000000000000000000000`

Hệ quả thực tế:

- `balanceOf()` (6 dec) cắt 12 chữ số cuối của giá trị native (18 dec). Số dư nhỏ hơn
  ~1e-10 USDC không hiện trong `balanceOf` nhưng vẫn tồn tại.
- Không có WETH-style wrapper. **Không** deploy wrap, **không** alias địa chỉ
  `0xEeee...EEeE` (EIP-7528 sentinel) sang địa chỉ USDC — docs cảnh báo rõ.
- UI: **không** hiển thị native USDC và ERC-20 USDC thành 2 dòng số dư. Đó là một số dư.
- Gửi tới `address(0)` **revert** (trên Ethereum thì thành công) — đừng dùng `address(0)`
  làm "địa chỉ rỗng" trong logic.

## Gas & phí

- Mô hình: EIP-1559 + EWMA smoothing (base fee là trung bình có trọng số của vài block gần nhất).
- **Sàn `maxFeePerGas`: 20 Gwei.** Gửi dưới sàn → treo hoặc fail.
- Trần base fee: 20.000 Gwei.
- Throughput: 30M gas/block, block ~0.5s (~60M gas/s).
- Mục tiêu thiết kế: **~$0.001 cho một ERC-20 transfer**.

Tự tính lại cho chắc (đơn vị: USDC 18 decimals):

```
20 Gwei = 20e9 wei/gas
transfer ERC-20 ≈ 50.000 gas
50.000 × 20e9 = 1e15 wei = 0.001 USDC     ✓ khớp mục tiêu
contract call ~200.000 gas → 0.004 USDC
```

→ Chia hoá đơn 4 người = 4 transfer ≈ **$0.004 tổng phí**. Đây là con số dùng được
trong mọi bài pitching, và nó là số học, không phải marketing.

## Finality

Sub-second, deterministic. **Không cần chờ N confirmations.** Docs nói rõ: tx final
trong dưới 1 giây.

## Khác biệt EVM cần nhớ khi viết code

- Arc theo baseline **Osaka**.
- **System emitter** `0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE` log **mọi** event
  `Transfer` của USDC → chỉ cần theo dõi 1 địa chỉ là index được toàn bộ dòng tiền USDC.
  Rất tiện để làm indexer realtime thay vì quét từng block.
- **Blocklist revert** vẫn tiêu gas và **không sinh receipt** → đừng giả định
  "không có receipt = tx chưa chạy".
- `address(0)` send revert (xem trên).
- Có **transaction memos** (gắn dữ liệu vào tx) và **batched transactions** (gộp nhiều lệnh).

## App Kits (SDK của Circle cho Arc)

Bridge Kit · Swap Kit · Unified Balance Kit · Onramp Kit · Earn Kit · Borrow Kit.
Đều wrap CCTP. Unified Balance gộp USDC từ nhiều chain thành một số dư chi tiêu được.

## Công cụ

- **Arc Studio**: mô tả ý tưởng → sinh frontend + backend + smart contract.
- **Arc Portal**: entry point cho người dùng cuối — tạo/nạp ví, swap, earn, cấp ví cho agent,
  đặt hạn mức chi tiêu, uỷ quyền tác vụ onchain.
- **Arc Foundry**: fork của Foundry (`arc-forge`, `arc-cast`, `arc-anvil`) xử lý khác biệt
  protocol của Arc.
- **Circle skills cho agent**: `github.com/circlefin/skills` (plugin `use-arc`, `use-usdc`,
  `use-circle-wallets`, `use-gateway`, `use-smart-contract-platform`).
- Relayer/paymaster: docs có `integrate/relayers-and-paymasters/eip-3009-relayer.md` và
  `deploy-a-paymaster.md`.
- Indexing: `integrate/infrastructure/indexing-events.md`.
- Có opt-in privacy (tương lai) và post-quantum security (theo docs concepts).

## Chưa kiểm chứng (đừng coi là sự thật)

- [ ] Paymaster có sẵn trên mainnet cho third-party không, hay phải tự deploy.
- [ ] Rate limit cụ thể của `rpc.mainnet.arc.io`.
- [ ] Giá trị memo tối đa / chi phí thêm của batched tx.
- [ ] Account abstraction (ERC-4337) native hay cần entry point tự triển khai.
- [ ] Phí thực tế của một tx chuyển USDC ERC-20 đo trên mainnet (con số 50.000 gas là
      ước lượng chuẩn EVM, cần đo lại bằng `eth_estimateGas`).
- [ ] Provider onramp nào đang bật cho Arc và revenue share ra sao.
