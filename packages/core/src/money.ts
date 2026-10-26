/**
 * Tiền tệ của Nhịp — chỉ USDC, chỉ micro-unit.
 *
 * Vì sao có file này thay vì dùng `number` ở khắp nơi:
 *
 * 1. USDC trên Arc có HAI interface trên CÙNG một số dư: native 18 decimals
 *    (gas, msg.value) và ERC-20 6 decimals (transfer, balanceOf). Nhầm giữa hai
 *    bên là sai hệ số 10^12 — mất tiền thật, không phải bug hiển thị.
 * 2. `number` của JS mất chính xác trên 2^53. Một payout 1 tỷ micro cộng dồn
 *    vài nghìn lần là đủ để lệch.
 *
 * Nên: mọi số tiền là `bigint` mang brand `Micro`, đơn vị LuÔN là 1e-6 USDC.
 * Không có API nào trong file này nhận `number`.
 */

/** Số tiền tính bằng 1e-6 USDC. Brand để không ai vô tình truyền bigint thường. */
export type Micro = bigint & { readonly __brand: 'Micro' };

/** Số chữ số thập phân của ERC-20 USDC trên Arc. Không phải 18. */
export const MICRO_DECIMALS = 6;

const SCALE = 1_000_000n;

/** Giới hạn hợp lý: 15 chữ số phần nguyên (~10^15 USDC). Vượt mức này là lỗi nhập liệu. */
const MAX_INTEGER_DIGITS = 15;

const AMOUNT_PATTERN = /^(\d{1,15})(?:\.(\d{1,6}))?$/;

export class MoneyFormatError extends Error {
  readonly input: string;

  constructor(input: string, reason: string) {
    super(`Số tiền không hợp lệ (${reason}): ${JSON.stringify(input)}`);
    this.name = 'MoneyFormatError';
    this.input = input;
  }
}

/** Nhận bigint đã đúng đơn vị. Dùng khi đọc từ DB (BIGINT) — không qua chuỗi. */
export function micro(value: bigint): Micro {
  return value as Micro;
}

export const ZERO = 0n as Micro;

/**
 * Parse chuỗi người dùng nhập ("1.234567") thành micro.
 *
 * Cố tình KHÔNG nhận:
 * - `number` (float) — 0.1 + 0.2 = 0.30000000000000004
 * - quá 6 chữ số thập phân — cắt âm thầm là mất tiền
 * - dấu phẩy, khoảng trắng bên trong, `1e6`, dấu `+`
 *
 * @throws MoneyFormatError
 */
export function parseAmount(input: string): Micro {
  // Chặn cả ở runtime: nếu ai đó lách kiểu (hoặc dữ liệu từ JSON không kiểm),
  // phải ra MoneyFormatError chứ không phải TypeError khó đọc.
  if (typeof input !== 'string') {
    throw new MoneyFormatError(String(input), 'không phải chuỗi');
  }

  const trimmed = input.trim();
  if (trimmed === '') throw new MoneyFormatError(input, 'rỗng');

  const match = AMOUNT_PATTERN.exec(trimmed);
  if (!match) {
    const tooManyDecimals = /^\d*\.\d{7,}$/.test(trimmed);
    throw new MoneyFormatError(
      input,
      tooManyDecimals ? `quá ${MICRO_DECIMALS} chữ số thập phân` : 'định dạng không hợp lệ',
    );
  }

  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (whole.replace(/^0+/, '').length > MAX_INTEGER_DIGITS) {
    throw new MoneyFormatError(input, 'quá lớn');
  }

  const padded = fraction.padEnd(MICRO_DECIMALS, '0');
  return micro(BigInt(whole) * SCALE + BigInt(padded));
}

/**
 * In ra chuỗi thập phân chính xác, bỏ số 0 thừa ở cuối.
 * Dùng cho API response và export CSV — KHÔNG dùng cho UI (UI cần locale).
 */
export function toDecimalString(value: Micro): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(MICRO_DECIMALS, '0').replace(/0+$/, '');
  const sign = negative ? '-' : '';
  return fraction === '' ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}

export function add(a: Micro, b: Micro): Micro {
  return micro(a + b);
}

export function subtract(a: Micro, b: Micro): Micro {
  return micro(a - b);
}

export function sum(values: readonly Micro[]): Micro {
  let total = 0n;
  for (const value of values) total += value;
  return micro(total);
}

export function compare(a: Micro, b: Micro): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isPositive(value: Micro): boolean {
  return value > 0n;
}
