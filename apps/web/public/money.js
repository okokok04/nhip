/**
 * Chuyển đổi tiền cho phía trình duyệt.
 *
 * Tách khỏi `app.js` vì đây là phần duy nhất của giao diện có thể sai theo cách
 * không ai thấy: `1650.75` và `1.650,75` là hai cách người Việt viết cùng một số,
 * còn `1.65` và `1650` thì không. Quy tắc ở đây được test trực tiếp thay vì được
 * kiểm bằng mắt trên màn hình.
 *
 * Không dùng `Number` ở bất kỳ đâu: JSON trả `amount_micro` dạng chuỗi chính là
 * để tránh mất chính xác, đổi sang float rồi đổi lại là tự phá bỏ bảo đảm đó.
 */

export const MICRO_PER_UNIT = 1_000_000n;

const vnNumber = new Intl.NumberFormat('vi-VN');

/** micro-USDC (chuỗi số nguyên) → "1.650,75". */
export function formatUsdc(microText) {
  let value;
  try {
    value = BigInt(microText);
  } catch {
    return '—';
  }

  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / MICRO_PER_UNIT;
  let fraction = (abs % MICRO_PER_UNIT).toString().padStart(6, '0');

  // Bỏ số 0 thừa ở đuôi nhưng giữ tối thiểu 2 chữ số: cột tiền phải thẳng hàng,
  // và "1,5" cạnh "1,50" trông như hai độ chính xác khác nhau.
  fraction = fraction.replace(/0+$/, '');
  if (fraction.length < 2) fraction = fraction.padEnd(2, '0');

  return `${negative ? '-' : ''}${vnNumber.format(whole)},${fraction}`;
}

/**
 * Chuỗi người dùng gõ → micro-USDC.
 *
 * Quy ước dấu:
 * - Có cả `.` và `,` → dấu xuất hiện **sau cùng** là dấu thập phân, dấu còn lại
 *   là phân cách hàng nghìn (`1.650,75` và `1,650.75` đều đúng).
 * - Một loại dấu, xuất hiện nhiều lần → phân cách hàng nghìn (`1.650.000`).
 * - Một loại dấu, xuất hiện đúng một lần → **thập phân**. Chọn vậy vì "1.650"
 *   gần như luôn là 1,65 USDC chứ không phải 1650; đoán sai theo hướng 1000 lần
 *   là lỗi không sửa được sau khi tiền đã ra khỏi ví.
 *
 * Trả `{ micro }` hoặc `{ error }` — không throw, vì lỗi ở đây là để hiện cạnh ô
 * nhập chứ không phải để làm sập form.
 */
export function parseAmountToMicro(raw) {
  const text = String(raw).trim().replace(/\s+/g, '');
  if (!text) return { error: 'Nhập số tiền.' };
  if (/[^0-9.,]/.test(text)) return { error: 'Chỉ dùng chữ số và dấu thập phân.' };

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let integerPart = text;
  let fractionPart = '';

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalIndex = Math.max(lastComma, lastDot);
    const groupChar = text[decimalIndex] === ',' ? '.' : ',';
    integerPart = text.slice(0, decimalIndex).split(groupChar).join('');
    fractionPart = text.slice(decimalIndex + 1);
  } else {
    const separator = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : null;
    if (separator) {
      const parts = text.split(separator);
      if (parts.length > 2) {
        integerPart = parts.join('');
      } else {
        integerPart = parts[0] ?? '';
        fractionPart = parts[1] ?? '';
      }
    }
  }

  const whole = integerPart === '' ? '0' : integerPart;
  if (!/^\d+$/.test(whole)) return { error: 'Phần nguyên không hợp lệ.' };
  if (fractionPart && !/^\d+$/.test(fractionPart)) return { error: 'Phần lẻ không hợp lệ.' };
  if (fractionPart.length > 6) {
    return { error: `Tối đa 6 chữ số thập phân, bạn nhập ${fractionPart.length}.` };
  }

  const micro = `${whole}${fractionPart.padEnd(6, '0')}`.replace(/^0+(?=\d)/, '');
  if (BigInt(micro) <= 0n) return { error: 'Số tiền phải lớn hơn 0.' };
  return { micro };
}
