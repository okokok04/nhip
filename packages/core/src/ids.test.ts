import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ID_PREFIX, newId } from './ids.ts';

describe('newId', () => {
  it('có tiền tố đúng', () => {
    assert.ok(newId('pay').startsWith('pay_'));
    assert.ok(newId(ID_PREFIX.BATCH).startsWith('bat_'));
  });

  it('phần ngẫu nhiên dài 32 ký tự hex', () => {
    const suffix = newId('pay').slice('pay_'.length);
    assert.match(suffix, /^[0-9a-f]{32}$/);
  });

  it('không trùng trong 10.000 lần', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId('pay')));
    assert.equal(ids.size, 10_000);
  });

  it('từ chối tiền tố không hợp lệ', () => {
    for (const bad of ['', 'P', 'PAY', 'p', 'pay_', 'pay1', 'a-b']) {
      assert.throws(() => newId(bad), /tiền tố id không hợp lệ/, `phải từ chối ${JSON.stringify(bad)}`);
    }
  });
});
