---
name: test-strategy
description: >-
  Dùng khi cần quyết định test gì, test ở tầng nào, hoặc khi test suite chậm/flaky
  và không bắt được bug. Ưu tiên test hành vi, tỉ lệ pyramid hợp lý, chạy nhanh.
---

# Test Strategy

## Nguyên tắc

Test tồn tại để **bắt lỗi và cho phép refactor an toàn**, không để tăng coverage.

- Test hành vi qua interface công khai, không test implementation detail.
- Một test chỉ nên đỏ vì **một** lý do.
- Test phải nhanh, độc lập, kết quả ổn định (không phụ thuộc thứ tự, thời gian, mạng).

## Phân tầng

| Tầng | Số lượng | Tốc độ | Kiểm gì |
|---|---|---|---|
| Unit | nhiều nhất | ms | Logic thuần: tính toán, parse, validate, state machine |
| Integration | vừa | 100ms–2s | Handler + DB, service + repository, component + hook |
| E2E | ít (5–15 luồng) | giây | Luồng người dùng quan trọng nhất, chạy trên app thật |

Không viết E2E cho mọi thứ. Một E2E cho "đăng ký → đăng nhập → tạo đơn" có giá trị hơn
50 E2E cho từng nút bấm.

## Phải có test cho

- **Tiền, số lượng, quyền** — mọi logic tài chính và phân quyền.
- **Bug đã từng xảy ra** — test hồi quy, đỏ trước khi fix.
- **Biên**: rỗng, 1 phần tử, rất lớn, ký tự đặc biệt, unicode, null/undefined.
- **Nhánh lỗi**: không tìm thấy, hết hạn, trùng lặp, mất mạng, timeout.
- **State machine**: mọi chuyển trạng thái hợp lệ + ít nhất một chuyển không hợp lệ.

## Không cần test

- Getter/setter tầm thường, hằng số.
- Thư viện bên thứ ba (tin vào thư viện, test tích hợp của mình với nó).
- Chi tiết render thuần tuý (snapshot CSS) — dễ vỡ vô nghĩa.

## Cấu trúc một test

```ts
describe('calculateInvoiceTotal', () => {
  it('cộng tiền các dòng và áp thuế', () => {
    // Arrange
    const items = [
      { unitPriceCents: 10_000, qty: 2 },
      { unitPriceCents: 5_000, qty: 1 },
    ]
    // Act
    const total = calculateInvoiceTotal(items, { taxRate: 0.1 })
    // Assert
    expect(total).toBe(27_500)
  })

  it('làm tròn tới cent gần nhất', () => {
    const total = calculateInvoiceTotal([{ unitPriceCents: 333, qty: 1 }], { taxRate: 0.08 })
    expect(total).toBe(360)   // 333 * 1.08 = 359.64
  })

  it('ném lỗi khi số lượng âm', () => {
    expect(() => calculateInvoiceTotal([{ unitPriceCents: 100, qty: -1 }], { taxRate: 0 }))
      .toThrow(/qty/)
  })
})
```

Tên test đọc lên phải hiểu được hành vi, không phải `it('works')`.

## Test flaky — xử lý dứt điểm

Nguyên nhân thường gặp và cách sửa:

| Nguyên nhân | Cách sửa |
|---|---|
| Chờ bằng `sleep` | Chờ **điều kiện** (`waitFor`, polling có timeout) |
| Phụ thuộc thời gian | Inject clock/`vi.setSystemTime`, không dùng `Date.now()` trực tiếp |
| Phụ thuộc thứ tự test | Reset state trong `beforeEach`, không chia sẻ DB toàn cục |
| Phụ thuộc mạng | Mock ở biên (fetch client), không gọi API thật trong unit |
| Dữ liệu test trùng | Sinh id/email ngẫu nhiên theo từng test |
| Async không await | `await` mọi promise; bật lint `no-floating-promises` |

Không được: thêm `retry: 3` rồi coi như đã sửa. Flaky test che bug thật.

## Mock ở đâu

- Mock **biên hệ thống**: HTTP client, clock, filesystem, third-party SDK.
- Không mock module nội bộ của chính bạn (làm test dính implementation).
- Với DB: ưu tiên DB thật nhẹ (SQLite/testcontainers) hơn mock query builder.

## Đo lường có ích

- Test fail vì đâu khi refactor? Nếu phải sửa nhiều test mà hành vi không đổi → test đang
  bám implementation.
- Thời gian chạy unit suite: mục tiêu < 10s. Vượt nhiều → tách integration.
- Test nào đỏ 2 lần vì lý do khác nhau → đang flaky, sửa ngay.

## Checklist

```markdown
- [ ] Có test cho happy path, ít nhất 2 nhánh lỗi, ít nhất 1 biên
- [ ] Tên test mô tả hành vi
- [ ] Không sleep, không phụ thuộc thứ tự, không phụ thuộc mạng
- [ ] Chạy lại 3 lần liên tiếp: đều xanh
- [ ] Không test nào bị skip vô thời hạn mà không có lý do ghi rõ
```
