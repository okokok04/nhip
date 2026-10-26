import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AddressError, ZERO_ADDRESS, normalizeAddress, shortenAddress, toChecksumAddress } from './address.ts';

// Địa chỉ kiểm checksum thật (EIP-55), dùng làm vector cố định.
const CHECKSUM_OK = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const CHECKSUM_BAD = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAeD'; // chữ D cuối sai case
const ALL_LOWER = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';

describe('normalizeAddress', () => {
  it('chuẩn hoá về lowercase', () => {
    assert.equal(normalizeAddress(CHECKSUM_OK), ALL_LOWER);
    assert.equal(normalizeAddress(ALL_LOWER), ALL_LOWER);
    assert.equal(normalizeAddress(`  ${CHECKSUM_OK}  `), ALL_LOWER);
  });

  it('chấp nhận all-uppercase hex (không có checksum để kiểm)', () => {
    assert.equal(normalizeAddress(ALL_LOWER.toUpperCase().replace('0X', '0x')), ALL_LOWER);
  });

  it('từ chối checksum sai — đây là lỗi gõ 1 ký tự', () => {
    assert.throws(() => normalizeAddress(CHECKSUM_BAD), AddressError);
  });

  it('từ chối zero address (Arc revert)', () => {
    assert.throws(() => normalizeAddress(ZERO_ADDRESS), AddressError);
    assert.throws(() => normalizeAddress(ZERO_ADDRESS.toUpperCase().replace('0X', '0x')), AddressError);
  });

  it('từ chối input sai định dạng', () => {
    const bad = [
      '',
      '   ',
      '5aaeb6053f3e94c9b9a09f33669435e7ef1beaed',
      '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beae',
      '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaedd',
      '0xzzzzb6053f3e94c9b9a09f33669435e7ef1beaed',
      '0x5aaeb605-3f3e-94c9-b9a0-9f33669435e7',
    ];
    for (const value of bad) {
      assert.throws(() => normalizeAddress(value), AddressError, `phải từ chối ${JSON.stringify(value)}`);
    }
  });

  it('từ chối giá trị không phải chuỗi ở runtime', () => {
    assert.throws(() => normalizeAddress(12345 as unknown as string), AddressError);
  });
});

describe('hiển thị', () => {
  it('shortenAddress giữ 4 ký tự hai đầu', () => {
    assert.equal(shortenAddress(ALL_LOWER), '0x5aae…eaed');
  });

  it('toChecksumAddress trả đúng vector EIP-55', () => {
    assert.equal(toChecksumAddress(ALL_LOWER), CHECKSUM_OK);
  });
});
