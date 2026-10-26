import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AddressError } from '../../../packages/core/src/address.ts';
import { BatchPlanError } from '../../../packages/core/src/batching.ts';
import { MoneyFormatError } from '../../../packages/core/src/money.ts';
import { AppError, ErrorCode, toAppError } from './errors.ts';

const REQUEST_ID = 'req_test_001';

describe('ErrorBody shape', () => {
  it('luôn có code, message, requestId', () => {
    const body = new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy').toBody(REQUEST_ID);
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.error.message, 'Không tìm thấy');
    assert.equal(body.error.requestId, REQUEST_ID);
  });

  it('details chỉ có khi được truyền, không có key rỗng', () => {
    const without = new AppError(ErrorCode.NOT_FOUND, 'x').toBody(REQUEST_ID);
    assert.equal('details' in without.error, false);

    const withDetails = new AppError(ErrorCode.NOT_FOUND, 'x', { potId: 'abc' }).toBody(REQUEST_ID);
    assert.deepEqual(withDetails.error.details, { potId: 'abc' });
  });
});

describe('mã trạng thái HTTP', () => {
  const cases: [ErrorCode, number][] = [
    [ErrorCode.UNAUTHENTICATED, 401],
    [ErrorCode.FORBIDDEN, 403],
    [ErrorCode.NOT_FOUND, 404],
    [ErrorCode.WORKER_NOT_FOUND, 404],
    [ErrorCode.VALIDATION_FAILED, 400],
    [ErrorCode.INVALID_ADDRESS, 400],
    [ErrorCode.DUPLICATE_IDEMPOTENCY, 409],
    [ErrorCode.INSUFFICIENT_BALANCE, 409],
    [ErrorCode.RATE_LIMITED, 429],
    [ErrorCode.CHAIN_UNAVAILABLE, 503],
    [ErrorCode.INTERNAL, 500],
  ];

  for (const [code, status] of cases) {
    it(`${code} → ${status}`, () => {
      assert.equal(new AppError(code, 'x').status, status);
    });
  }
});

describe('toAppError', () => {
  it('giữ nguyên AppError', () => {
    const original = new AppError(ErrorCode.FORBIDDEN, 'không có quyền');
    assert.equal(toAppError(original), original);
  });

  it('đổi lỗi domain ở core thành VALIDATION_FAILED (lỗi của người dùng, không phải 500)', () => {
    for (const error of [
      new MoneyFormatError('1.2345678', 'quá 6 chữ số thập phân'),
      new AddressError('0x0', 'zero address'),
      new BatchPlanError('gasBudget quá nhỏ'),
    ]) {
      const mapped = toAppError(error);
      assert.equal(mapped.code, ErrorCode.VALIDATION_FAILED);
      assert.equal(mapped.status, 400);
      assert.equal(mapped.message, error.message, 'message của core hữu ích, phải giữ');
    }
  });

  it('ValidationError giữ nguyên danh sách trường sai trong details', () => {
    const validation = Object.assign(new Error('Payload không hợp lệ: a, b'), {
      name: 'ValidationError',
      fields: [
        { field: 'a', message: 'thiếu' },
        { field: 'b', message: 'sai' },
      ],
    });

    const mapped = toAppError(validation);
    assert.equal(mapped.code, ErrorCode.VALIDATION_FAILED);
    assert.equal(mapped.status, 400);
    assert.deepEqual(mapped.details, {
      fields: [
        { field: 'a', message: 'thiếu' },
        { field: 'b', message: 'sai' },
      ],
    });
  });

  it('KHÔNG để lộ message nội bộ của lỗi lạ', () => {
    const leaky = new Error('password=abc123 connection refused at 10.0.0.5');
    const mapped = toAppError(leaky);
    assert.equal(mapped.code, ErrorCode.INTERNAL);
    assert.equal(mapped.status, 500);
    assert.ok(!mapped.message.includes('password'), 'message nội bộ không được ra client');
    assert.ok(!mapped.message.includes('10.0.0.5'));
  });

  it('xử lý giá trị không phải Error', () => {
    for (const value of [null, undefined, 'oops', 42, { foo: 'bar' }]) {
      const mapped = toAppError(value);
      assert.equal(mapped.code, ErrorCode.INTERNAL);
    }
  });
});
