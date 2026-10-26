/**
 * Sinh id cho bản ghi.
 *
 * Vì sao không dùng `serial`/`uuid` mặc định của Postgres:
 * - `serial` tuần tự → đoán được, và lộ số lượng payout của đối thủ.
 * - `uuid` thuần → không biết bản ghi thuộc loại gì khi đọc log.
 *
 * Nên: tiền tố theo loại + 16 byte ngẫu nhiên. `pay_a3f9…` tự nói nó là gì.
 *
 * Dùng `crypto.randomUUID()` (có sẵn trong Node và browser) rồi bỏ dấu gạch:
 * UUID v4 có 122 bit ngẫu nhiên — đủ cho mọi quy mô dự án này, và không cần
 * thêm dependency.
 */

const PREFIX_PATTERN = /^[a-z]{2,6}$/;

export function newId(prefix: string): string {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`tiền tố id không hợp lệ: ${JSON.stringify(prefix)} — phải là 2-6 chữ thường`);
  }
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export const ID_PREFIX = {
  PAYOUT: 'pay',
  BATCH: 'bat',
  PLATFORM: 'plat',
  WORKER: 'wrk',
  REQUEST: 'req',
} as const;
