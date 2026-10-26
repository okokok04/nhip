import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  type Micro,
  MoneyFormatError,
  ZERO,
  add,
  compare,
  micro,
  parseAmount,
  subtract,
  sum,
  toDecimalString,
} from './money.ts';

const m = (n: number | bigint) => micro(BigInt(n));

describe('parseAmount', () => {
  it('parse số nguyên', () => {
    assert.equal(parseAmount('1'), m(1_000_000));
    assert.equal(parseAmount('0'), ZERO);
    assert.equal(parseAmount('1234'), m(1_234_000_000));
  });

  it('parse có phần thập phân', () => {
    assert.equal(parseAmount('1.5'), m(1_500_000));
    assert.equal(parseAmount('0.000001'), m(1));
    assert.equal(parseAmount('123.456789'), m(123_456_789));
  });

  it('bỏ khoảng trắng hai đầu nhưng không bỏ ở giữa', () => {
    assert.equal(parseAmount('  2.25  '), m(2_250_000));
    assert.throws(() => parseAmount('2 .25'), MoneyFormatError);
  });

  it('từ chối hơn 6 chữ số thập phân thay vì cắt âm thầm', () => {
    assert.throws(() => parseAmount('1.2345678'), MoneyFormatError);
    assert.throws(() => parseAmount('0.0000001'), MoneyFormatError);
  });

  it('từ chối mọi thứ không phải chuỗi thập phân thuần', () => {
    for (const bad of ['', '  ', 'abc', '1,5', '1e6', '+1', '-1', '.5', '1.', '1.2.3', '0x10']) {
      assert.throws(() => parseAmount(bad), MoneyFormatError, `phải từ chối: ${JSON.stringify(bad)}`);
    }
  });

  it('từ chối số quá lớn', () => {
    assert.throws(() => parseAmount('1234567890123456'), MoneyFormatError);
  });

  it('từ chối number (float) ngay ở tầng kiểu', () => {
    // Ép kiểu để chắc chắn runtime cũng chặn, không chỉ TypeScript.
    assert.throws(() => parseAmount(0.1 + 0.2 as unknown as string), MoneyFormatError);
  });
});

describe('toDecimalString', () => {
  it('in chính xác, bỏ số 0 thừa', () => {
    assert.equal(toDecimalString(m(1_000_000)), '1');
    assert.equal(toDecimalString(m(1_500_000)), '1.5');
    assert.equal(toDecimalString(m(1)), '0.000001');
    assert.equal(toDecimalString(ZERO), '0');
    assert.equal(toDecimalString(m(123_456_789)), '123.456789');
  });

  it('giữ nguyên chuỗi gốc sau khi round-trip', () => {
    for (const input of ['0', '1', '1.5', '0.000001', '123.456789', '999999.999999']) {
      assert.equal(toDecimalString(parseAmount(input)), input.replace(/\.?0+$/, '') || '0');
    }
  });

  it('xử lý số âm (chỉ dùng cho hiển thị chênh lệch, không dùng cho payout)', () => {
    assert.equal(toDecimalString(m(-1_500_000)), '-1.5');
  });
});

describe('số học', () => {
  it('cộng trừ chính xác trên 2^53', () => {
    const big = m(9_007_199_254_740_993n); // 2^53 + 1
    assert.equal(add(big, m(1)), m(9_007_199_254_740_994n));
    assert.equal(subtract(big, m(1)), m(9_007_199_254_740_992n));
  });

  it('sum không mất chính xác', () => {
    const values = Array.from({ length: 1000 }, () => m(1));
    assert.equal(sum(values), m(1000));
  });

  it('sum rỗng là 0', () => {
    assert.equal(sum([]), ZERO);
  });

  it('compare', () => {
    assert.equal(compare(m(1), m(2)), -1);
    assert.equal(compare(m(2), m(2)), 0);
    assert.equal(compare(m(3), m(2)), 1);
  });
});

describe('chống nhầm 18 decimals', () => {
  it('1 USDC là 1e6 micro, không phải 1e18', () => {
    const oneUsdc: Micro = parseAmount('1');
    assert.equal(oneUsdc, 1_000_000n);
    assert.notEqual(oneUsdc, 1_000_000_000_000_000_000n);
  });
});
