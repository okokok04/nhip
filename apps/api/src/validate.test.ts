import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ValidationError,
  newCollector,
  readJsonBody,
  requireIdempotencyKey,
  requireObject,
  takeAddress,
  takeAmountMicro,
  takeLimit,
  takeString,
} from './validate.ts';

describe('FieldCollector — gom hết lỗi, không dừng ở lỗi đầu', () => {
  it('ghi nhiều lỗi rồi ném một lần', () => {
    const collector = newCollector();
    collector.add('a', 'sai');
    collector.add('b', 'thiếu');

    assert.equal(collector.hasErrors, true);

    let caught: ValidationError | null = null;
    try {
      collector.throwIfAny();
    } catch (error) {
      assert.ok(error instanceof ValidationError);
      caught = error;
    }

    assert.ok(caught, 'throwIfAny phải ném khi có lỗi');
    assert.deepEqual(
      caught.fields.map((f) => f.field),
      ['a', 'b'],
    );
  });

  it('không ném khi sạch', () => {
    assert.doesNotThrow(() => newCollector().throwIfAny());
  });

  it('JSON body hỏng là lỗi 400 nói được cách sửa, không phải TypeError', async () => {
    const broken = { json: async () => JSON.parse('{ khong-phai-json') };
    await assert.rejects(readJsonBody(broken), (error: unknown) => {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.fields[0]?.field, '(body)');
      return true;
    });
  });
});

describe('requireObject', () => {
  it('từ chối array, null, string, number', () => {
    for (const value of [[], null, 'x', 42, undefined]) {
      const collector = newCollector();
      assert.equal(requireObject(value, collector), null, `${JSON.stringify(value)} phải bị từ chối`);
      assert.equal(collector.errors.length, 1);
    }
  });

  it('nhận object', () => {
    const collector = newCollector();
    assert.deepEqual(requireObject({ a: 1 }, collector), { a: 1 });
    assert.equal(collector.hasErrors, false);
  });
});

describe('takeAmountMicro', () => {
  const parse = (value: unknown) => {
    const collector = newCollector();
    const result = takeAmountMicro({ amount_micro: value }, 'amount_micro', collector);
    return { result, errors: collector.errors };
  };

  it('nhận chuỗi số nguyên micro', () => {
    assert.equal(parse('1650750').result, 1_650_750n);
    assert.equal(parse('1').result, 1n);
    assert.equal(parse('  1000  ').result, 1000n, 'phải trim khoảng trắng');
  });

  it('nhận số micro lớn hơn 2^53 mà không mất chính xác', () => {
    // 9007199254740993 = 2^53 + 1, số đầu tiên mà `number` không biểu diễn được.
    assert.equal(parse('9007199254740993').result, 9007199254740993n);
  });

  it('TỪ CHỐI number — kể cả số nguyên trông hợp lệ', () => {
    const { result, errors } = parse(1650750);
    assert.equal(result, null);
    assert.match(errors[0]?.message ?? '', /không phải number|phải là chuỗi/);
  });

  it('TỪ CHỐI số thập phân và nói rõ cách đổi sang micro', () => {
    for (const value of ['1650.75', '0.000001', '1,5']) {
      const { result, errors } = parse(value);
      assert.equal(result, null, `"${value}" phải bị từ chối`);
      assert.match(errors[0]?.message ?? '', /micro|chữ số/);
    }
  });

  it('TỪ CHỐI số 0 và số âm', () => {
    for (const value of ['0', '000', '-5']) {
      const { result, errors } = parse(value);
      assert.equal(result, null, `"${value}" phải bị từ chối`);
      assert.ok(errors.length > 0);
    }
  });

  it('TỪ CHỐI ký hiệu khoa học, dấu cộng, khoảng trắng bên trong', () => {
    for (const value of ['1e6', '+5', '1 000', '0x10']) {
      assert.equal(parse(value).result, null, `"${value}" phải bị từ chối`);
    }
  });

  it('TỪ CHỐI thiếu trường', () => {
    const collector = newCollector();
    assert.equal(takeAmountMicro({}, 'amount_micro', collector), null);
    assert.match(collector.errors[0]?.message ?? '', /Thiếu/);
  });
});

describe('takeAddress', () => {
  it('chuẩn hoá về lowercase', () => {
    const collector = newCollector();
    const result = takeAddress(
      { address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed' },
      'address',
      collector,
    );
    assert.equal(result, '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
    assert.equal(collector.hasErrors, false);
  });

  it('TỪ CHỐI zero address và giữ message của core', () => {
    const collector = newCollector();
    assert.equal(takeAddress({ address: `0x${'0'.repeat(40)}` }, 'address', collector), null);
    assert.match(collector.errors[0]?.message ?? '', /zero address/i);
  });

  it('TỪ CHỐI checksum sai', () => {
    const collector = newCollector();
    // Đổi 1 ký tự của địa chỉ có checksum → checksum không còn đúng.
    assert.equal(
      takeAddress({ address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe0' }, 'address', collector),
      null,
    );
    assert.match(collector.errors[0]?.message ?? '', /checksum/i);
  });

  it('trường không bắt buộc mà thiếu → null nhưng không lỗi', () => {
    const collector = newCollector();
    assert.equal(takeAddress({}, 'address', collector, { required: false }), null);
    assert.equal(collector.hasErrors, false);
  });
});

describe('takeString', () => {
  it('trim và trả chuỗi', () => {
    const collector = newCollector();
    assert.equal(takeString({ name: '  Nguyễn Văn A  ' }, 'name', collector), 'Nguyễn Văn A');
  });

  it('từ chối chuỗi toàn khoảng trắng', () => {
    const collector = newCollector();
    assert.equal(takeString({ name: '   ' }, 'name', collector), null);
    assert.equal(collector.errors.length, 1);
  });

  it('từ chối vượt độ dài', () => {
    const collector = newCollector();
    assert.equal(takeString({ name: 'x'.repeat(11) }, 'name', collector, { max: 10 }), null);
    assert.match(collector.errors[0]?.message ?? '', /10/);
  });

  it('từ chối kiểu không phải chuỗi', () => {
    const collector = newCollector();
    assert.equal(takeString({ name: 42 }, 'name', collector), null);
    assert.equal(collector.errors.length, 1);
  });
});

describe('requireIdempotencyKey', () => {
  it('nhận key hợp lệ', () => {
    assert.equal(requireIdempotencyKey('idem_2f8c1a4e'), 'idem_2f8c1a4e');
  });

  it('từ chối thiếu header và nói rõ phải làm gì', () => {
    for (const value of [null, undefined, '', '   ']) {
      assert.throws(
        () => requireIdempotencyKey(value),
        (error: unknown) => {
          assert.ok(error instanceof ValidationError);
          assert.equal(error.fields[0]?.field, 'Idempotency-Key');
          assert.match(error.fields[0]?.message ?? '', /retry/i);
          return true;
        },
      );
    }
  });

  it('từ chối quá ngắn và quá dài', () => {
    assert.throws(() => requireIdempotencyKey('abc'), ValidationError);
    assert.throws(() => requireIdempotencyKey('x'.repeat(201)), ValidationError);
  });

  it('từ chối ký tự ngoài ASCII in được', () => {
    // Dấu tiếng Việt trong header sẽ bị một số proxy re-encode và hai request
    // tưởng là khác nhau lại thành cùng key — hoặc ngược lại.
    assert.throws(() => requireIdempotencyKey('idem-khoá-0001'), ValidationError);
  });
});

describe('takeLimit', () => {
  const parse = (raw: string | undefined) => {
    const collector = newCollector();
    const value = takeLimit(raw, collector, { fallback: 50, max: 100 });
    return { value, errors: collector.errors };
  };

  it('dùng fallback khi không truyền', () => {
    assert.equal(parse(undefined).value, 50);
    assert.equal(parse('').value, 50);
  });

  it('nhận giá trị trong khoảng', () => {
    assert.equal(parse('10').value, 10);
    assert.equal(parse('100').value, 100);
  });

  it('từ chối vượt trần, bằng 0, số thập phân, chữ', () => {
    for (const raw of ['101', '0', '1.5', 'abc', '-1']) {
      const { value, errors } = parse(raw);
      assert.equal(value, null, `"${raw}" phải bị từ chối`);
      assert.equal(errors.length, 1);
    }
  });
});
