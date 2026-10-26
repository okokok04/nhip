/**
 * Địa chỉ ví trên Arc.
 *
 * Ba luật, mỗi luật chặn một sự cố thật:
 *
 * 1. **Chuẩn hoá về lowercase** trước khi lưu. So sánh địa chỉ mà phân biệt hoa
 *    thường là nguồn gốc của "tiền về nhầm ví" và của việc một người bị tạo hai lần.
 * 2. **Chặn `0x0000…0000`**. Trên Ethereum gửi tới zero address thành công (burn);
 *    trên Arc thì **revert**. Nếu để lọt, cả một lô payout sẽ fail vì một dòng dữ liệu.
 * 3. **Kiểm checksum EIP-55 nếu địa chỉ có chữ hoa.** Checksum là thứ duy nhất
 *    bắt được lỗi gõ sai một ký tự giữa hai địa chỉ đều "đúng định dạng".
 */

import { getAddress } from 'viem';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export type Address = `0x${string}`;

export class AddressError extends Error {
  readonly input: string;

  constructor(input: string, reason: string) {
    super(`Địa chỉ không hợp lệ (${reason}): ${JSON.stringify(input)}`);
    this.name = 'AddressError';
    this.input = input;
  }
}

/**
 * Chuẩn hoá và kiểm tra. Trả về address lowercase.
 *
 * @throws AddressError
 */
export function normalizeAddress(input: string): Address {
  if (typeof input !== 'string') throw new AddressError(String(input), 'không phải chuỗi');

  const trimmed = input.trim();
  if (trimmed === '') throw new AddressError(input, 'rỗng');
  if (!trimmed.startsWith('0x')) throw new AddressError(input, 'thiếu tiền tố 0x');
  if (trimmed.length !== 42) throw new AddressError(input, 'phải dài 42 ký tự');
  if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) throw new AddressError(input, 'không phải hex 20 byte');

  // Chuẩn Ethereum: all-lower hoặc all-upper nghĩa là "không kèm checksum" → hợp lệ.
  // Chỉ khi TRỘN hoa thường thì checksum mới có nghĩa và mới bị kiểm.
  //
  // Không dùng `isAddress(strict)` của viem ở đây: nó coi all-upper là sai checksum,
  // trong khi ethers và chuẩn EIP-55 coi đó là không có checksum. Dữ liệu xuất từ
  // hệ thống cũ đôi khi upper toàn bộ; từ chối chúng là bug tương thích, không phải
  // là bảo vệ.
  const body = trimmed.slice(2);
  const hasLower = /[a-f]/.test(body);
  const hasUpper = /[A-F]/.test(body);
  if (hasLower && hasUpper && getAddress(trimmed as Address) !== trimmed) {
    throw new AddressError(input, 'sai checksum EIP-55 (có thể gõ nhầm 1 ký tự)');
  }

  const lower = trimmed.toLowerCase() as Address;
  if (lower === ZERO_ADDRESS) throw new AddressError(input, 'không được là zero address (Arc revert)');

  return lower;
}

/** Trả về address có checksum để hiển thị cho người dùng. */
export function toChecksumAddress(address: Address): Address {
  return getAddress(address) as Address;
}

/** Rút gọn để hiện trong bảng: 0x1234…abcd */
export function shortenAddress(address: Address, visible = 4): string {
  return `${address.slice(0, 2 + visible)}…${address.slice(-visible)}`;
}

export function isNormalized(address: string): boolean {
  return address === address.toLowerCase();
}
