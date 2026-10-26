/**
 * Test cho logic tiền của dashboard.
 *
 * Đây là file `.js` (không phải `.ts`) vì nó import trực tiếp `public/money.js`
 * — cùng file mà trình duyệt tải. Test một bản sao được biên dịch lại thì không
 * chứng minh được gì về thứ người dùng thật sự chạy.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatUsdc, parseAmountToMicro } from './public/money.js';

describe('parseAmountToMicro', () => {
  it('số nguyên không dấu', () => {
    assert.deepEqual(parseAmountToMicro('5'), { micro: '5000000' });
    assert.deepEqual(parseAmountToMicro('1650'), { micro: '1650000000' });
  });

  it('dấu chấm là thập phân khi chỉ xuất hiện một lần', () => {
    assert.deepEqual(parseAmountToMicro('1.65'), { micro: '1650000' });
    assert.deepEqual(parseAmountToMicro('0.000001'), { micro: '1' });
  });

  it('dấu phẩy là thập phân khi chỉ xuất hiện một lần', () => {
    assert.deepEqual(parseAmountToMicro('1,65'), { micro: '1650000' });
  });

  it('có cả hai dấu → dấu sau cùng là thập phân', () => {
    assert.deepEqual(parseAmountToMicro('1.650,75'), { micro: '1650750000' });
    assert.deepEqual(parseAmountToMicro('1,650.75'), { micro: '1650750000' });
    assert.deepEqual(parseAmountToMicro('1.234.567,89'), { micro: '1234567890000' });
  });

  it('một loại dấu lặp lại → phân cách hàng nghìn', () => {
    assert.deepEqual(parseAmountToMicro('1.650.000'), { micro: '1650000000000' });
    assert.deepEqual(parseAmountToMicro('1,650,000'), { micro: '1650000000000' });
  });

  it('chấp nhận dấu phẩy thập phân kiểu Việt Nam ở giá trị lẻ', () => {
    // Ca thật: 15.000đ một đơn hàng ≈ 0,6 USDC.
    assert.deepEqual(parseAmountToMicro('0,6'), { micro: '600000' });
  });

  it('đệm đủ 6 chữ số thập phân', () => {
    assert.deepEqual(parseAmountToMicro('12.5'), { micro: '12500000' });
    assert.deepEqual(parseAmountToMicro('12.05'), { micro: '12050000' });
  });

  it('bỏ khoảng trắng', () => {
    assert.deepEqual(parseAmountToMicro(' 1 650,75 '), { micro: '1650750000' });
  });

  it('từ chối quá 6 chữ số thập phân thay vì làm tròn', () => {
    const result = parseAmountToMicro('1.1234567');
    assert.ok(result.error, 'phải báo lỗi');
    assert.match(result.error, /6 chữ số/);
  });

  it('từ chối số 0 và số âm', () => {
    assert.ok(parseAmountToMicro('0').error);
    assert.ok(parseAmountToMicro('0.0').error);
    assert.ok(parseAmountToMicro('-5').error);
  });

  it('từ chối ký tự lạ', () => {
    for (const input of ['', '   ', 'abc', '1e6', '5 USDC', '+5', '0x10']) {
      assert.ok(parseAmountToMicro(input).error, `"${input}" phải bị từ chối`);
    }
  });
});

describe('formatUsdc', () => {
  it('định dạng theo vi-VN, tối thiểu 2 chữ số lẻ', () => {
    assert.equal(formatUsdc('1650750000'), '1.650,75');
    assert.equal(formatUsdc('5000000'), '5,00');
    assert.equal(formatUsdc('600000'), '0,60');
  });

  it('giữ tới 6 chữ số lẻ khi cần', () => {
    assert.equal(formatUsdc('1'), '0,000001');
    assert.equal(formatUsdc('1234567'), '1,234567');
  });

  it('số 0 vẫn đọc được', () => {
    assert.equal(formatUsdc('0'), '0,00');
  });

  it('không mất chính xác với số lớn hơn safe integer', () => {
    // 9.007.199.254.740.991 là Number.MAX_SAFE_INTEGER; 10^18 micro = 10^12 USDC.
    assert.equal(formatUsdc('1000000000000000000'), '1.000.000.000.000,00');
  });

  it('đầu vào rác → "—" thay vì NaN', () => {
    assert.equal(formatUsdc('abc'), '—');
    assert.equal(formatUsdc(undefined), '—');
  });
});

describe('đi vòng', () => {
  it('parse rồi format trả lại đúng số đã gõ', () => {
    for (const [input, expected] of [
      ['1.650,75', '1.650,75'],
      ['0,6', '0,60'],
      ['5', '5,00'],
      ['12.5', '12,50'],
    ]) {
      const parsed = parseAmountToMicro(input);
      assert.ok(parsed.micro, `"${input}" phải parse được`);
      assert.equal(formatUsdc(parsed.micro), expected);
    }
  });
});
