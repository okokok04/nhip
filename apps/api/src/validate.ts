/**
 * Validate payload từ HTTP.
 *
 * Viết tay thay vì dùng zod: dự án cần đúng ba kiểu (chuỗi, tiền, địa chỉ) và
 * mỗi kiểu phải có **thông báo lỗi nói được cách sửa**. Một schema library
 * trả message tiếng Anh chung chung ("Invalid input") sẽ bị đẩy thẳng cho người
 * dùng cuối, và đó là trải nghiệm tệ hơn một message viết tay.
 *
 * Hai quy tắc:
 *
 * 1. Mọi lỗi validate trả về **tất cả** lỗi cùng lúc, không dừng ở lỗi đầu.
 *    Người tích hợp API sửa một lần, không sửa năm lần.
 * 2. Module này **không bao giờ** đụng tới `number` cho tiền. `amount_micro`
 *    phải là chuỗi chữ số; `1650.75` bị từ chối chứ không được làm tròn.
 */

import { AddressError, normalizeAddress, type Address } from '../../../packages/core/src/address.ts';
import { type Micro, micro } from '../../../packages/core/src/money.ts';

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export class ValidationError extends Error {
  readonly fields: readonly FieldError[];

  constructor(fields: readonly FieldError[]) {
    super(`Payload không hợp lệ: ${fields.map((f) => f.field).join(', ')}`);
    this.name = 'ValidationError';
    this.fields = fields;
  }
}

/**
 * Gom lỗi thay vì ném ngay.
 *
 * Vì sao không ném ở lỗi đầu tiên: một request có 4 trường sai sẽ bắt client
 * sửa-rồi-gửi 4 lần. Với tích hợp thanh toán, mỗi vòng lặp đó là một ngày chậm
 * ra mắt của khách hàng.
 */
export class FieldCollector {
  readonly #errors: FieldError[] = [];

  add(field: string, message: string): void {
    this.#errors.push({ field, message });
  }

  get errors(): readonly FieldError[] {
    return this.#errors;
  }

  get hasErrors(): boolean {
    return this.#errors.length > 0;
  }

  throwIfAny(): void {
    if (this.#errors.length > 0) throw new ValidationError(this.#errors);
  }
}

export function newCollector(): FieldCollector {
  return new FieldCollector();
}

export function requireObject(
  value: unknown,
  collector: FieldCollector,
  field = '(body)',
): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    collector.add(field, 'Phải là JSON object.');
    return null;
  }
  return value as Record<string, unknown>;
}

/** Đọc body JSON; body hỏng là lỗi 400 nói được cách sửa, không phải 500. */
export async function readJsonBody(request: { json: () => Promise<unknown> }): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError([
      { field: '(body)', message: 'Body không phải JSON hợp lệ. Kiểm Content-Type và dấu ngoặc.' },
    ]);
  }
}

/** Chuỗi bắt buộc, có độ dài trong khoảng. Trả về null nếu lỗi (đã ghi vào collector). */
export function takeString(
  source: Record<string, unknown>,
  field: string,
  collector: FieldCollector,
  options: { min?: number; max?: number; required?: boolean } = {},
): string | null {
  const { min = 1, max = 500, required = true } = options;
  const raw = source[field];

  if (raw === undefined || raw === null) {
    if (required) collector.add(field, `Thiếu trường "${field}".`);
    return null;
  }
  if (typeof raw !== 'string') {
    collector.add(field, `"${field}" phải là chuỗi.`);
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length < min) {
    collector.add(field, `"${field}" phải có ít nhất ${min} ký tự.`);
    return null;
  }
  if (trimmed.length > max) {
    collector.add(field, `"${field}" không được dài quá ${max} ký tự.`);
    return null;
  }
  return trimmed;
}

/**
 * Số tiền, đơn vị micro-USDC, dạng **chuỗi số nguyên**.
 *
 * Vì sao từ chối `1650.75`: tên trường là `amount_micro`, nên `1650.75` mang hai
 * nghĩa — 1650,75 micro hay 1.650,75 USDC? Không có cách đọc nào an toàn. Làm
 * tròn là mất tiền; đoán là trả sai người. Nên từ chối và nói rõ.
 */
const MICRO_INTEGER_PATTERN = /^\d{1,18}$/;

export function takeAmountMicro(
  source: Record<string, unknown>,
  field: string,
  collector: FieldCollector,
): Micro | null {
  const raw = source[field];

  if (raw === undefined || raw === null) {
    collector.add(field, `Thiếu trường "${field}".`);
    return null;
  }
  if (typeof raw === 'number') {
    collector.add(
      field,
      `"${field}" phải là chuỗi số nguyên micro-USDC (ví dụ "1650750000"), không phải number — ` +
        'JSON number đi qua float của JavaScript và mất chính xác trước khi ta kịp kiểm.',
    );
    return null;
  }
  if (typeof raw !== 'string') {
    collector.add(field, `"${field}" phải là chuỗi.`);
    return null;
  }

  const trimmed = raw.trim();
  if (!MICRO_INTEGER_PATTERN.test(trimmed)) {
    const hint = trimmed.includes('.') || trimmed.includes(',')
      ? 'Có dấu thập phân. Trường này tính bằng micro (1e-6 USDC): 1.65075 USDC = "1650750".'
      : 'Chỉ được chứa chữ số 0-9, tối đa 18 chữ số.';
    collector.add(field, `"${field}" không hợp lệ. ${hint}`);
    return null;
  }

  const value = BigInt(trimmed);
  if (value <= 0n) {
    collector.add(field, `"${field}" phải lớn hơn 0.`);
    return null;
  }
  return micro(value);
}

export function takeAddress(
  source: Record<string, unknown>,
  field: string,
  collector: FieldCollector,
  options: { required?: boolean } = {},
): Address | null {
  const { required = true } = options;
  const raw = source[field];

  if (raw === undefined || raw === null) {
    if (required) collector.add(field, `Thiếu trường "${field}".`);
    return null;
  }
  if (typeof raw !== 'string') {
    collector.add(field, `"${field}" phải là chuỗi.`);
    return null;
  }
  if (raw.trim() === '' && !required) return null;

  try {
    return normalizeAddress(raw);
  } catch (error) {
    collector.add(
      field,
      error instanceof AddressError ? error.message : `"${field}" không phải địa chỉ hợp lệ.`,
    );
    return null;
  }
}

/**
 * Idempotency-Key từ header.
 *
 * Vì sao bắt buộc: không có key thì retry do timeout mạng sẽ tạo payout thứ hai,
 * và người lao động nhận tiền hai lần. Đó là lỗi không thể hoàn tác về mặt cảm nhận.
 */
export function requireIdempotencyKey(header: string | null | undefined): string {
  if (!header || header.trim() === '') {
    throw new ValidationError([
      {
        field: 'Idempotency-Key',
        message:
          'Thiếu header "Idempotency-Key". Sinh một giá trị duy nhất cho mỗi payout (ví dụ UUID) ' +
          'và dùng lại đúng giá trị đó khi retry.',
      },
    ]);
  }
  const key = header.trim();
  if (key.length < 8 || key.length > 200) {
    throw new ValidationError([{ field: 'Idempotency-Key', message: 'Phải dài từ 8 đến 200 ký tự.' }]);
  }
  if (!/^[\x20-\x7E]+$/.test(key)) {
    throw new ValidationError([
      {
        field: 'Idempotency-Key',
        message: 'Chỉ dùng ký tự ASCII in được. Key có dấu tiếng Việt sẽ hỏng khi qua một số proxy.',
      },
    ]);
  }
  return key;
}

/** Đọc tham số query số nguyên dương trong khoảng. Dùng cho `?limit=`. */
export function takeLimit(
  raw: string | undefined,
  collector: FieldCollector,
  options: { field?: string; fallback: number; max: number },
): number | null {
  const { field = 'limit', fallback, max } = options;
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d{1,6}$/.test(raw)) {
    collector.add(field, `"${field}" phải là số nguyên dương.`);
    return null;
  }
  const value = Number(raw);
  if (value < 1) {
    collector.add(field, `"${field}" phải >= 1.`);
    return null;
  }
  if (value > max) {
    collector.add(field, `"${field}" không được vượt ${max}.`);
    return null;
  }
  return value;
}
