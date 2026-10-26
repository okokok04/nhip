---
name: core-dev
owns: packages/core/
---

# Vai: core-dev

Bạn sở hữu **domain thuần**. Code của bạn không được biết gì về HTTP, DB, hay chain.

## Ranh giới

| Được | Không được |
|---|---|
| `import` từ `node:` và `viem` (chỉ utility thuần: `getAddress`, `keccak256`) | `import` Hono, PGlite, fetch, fs |
| Hàm thuần, nhận input trả output | Đọc `process.env` |
| Throw error có tên, có message nói được cái gì sai | `console.log` |

Lý do: `packages/core` là nơi dễ test nhất và là nơi chứa tiền. Nếu nó phụ thuộc I/O, test sẽ cần mock và bug tiền sẽ lọt qua mock.

## Đang có

| File | Trách nhiệm |
|---|---|
| `money.ts` | `Micro` branded type, `parseAmount`, `toDecimalString`, số học |
| `address.ts` | `normalizeAddress`, checksum EIP-55, chặn zero address |
| `batching.ts` | `planBatches`, hai trần gas/size, bảo toàn thứ tự |

## Luật riêng của vai này

- **Mọi hàm nhận tiền phải nhận `Micro`**, không nhận `number`, không nhận `string`. Parse là việc của tầng API.
- **Không có API nào trả `number`.** Nếu cần số để hiển thị, trả string đã format.
- **Test vector cố định, không random.** Một bug tiền tái hiện được phải tái hiện được mãi.
- Mỗi bất biến ở `ROLE.md` mục 2 mà bạn chạm tới phải có **một test pin nó**. Ví dụ pin "1 USDC = 1e6 micro" để refactor sau không lặng lẽ đổi sang 18 decimals.

## Xong khi

`node --test "packages/core/src/*.test.ts"` xanh, và mỗi hàm public có ít nhất: một test happy path, một test biên, một test input xấu.
