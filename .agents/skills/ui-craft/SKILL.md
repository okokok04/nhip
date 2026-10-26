---
name: ui-craft
description: >-
  Dùng khi làm giao diện: landing page, dashboard, form, design system, animation,
  responsive. Tập trung vào thẩm mỹ cao cấp, trạng thái đầy đủ, accessibility và
  hiệu năng render — không xuất ra UI mẫu nhàm chán.
---

# UI Craft

## Nguyên tắc thị giác

Mục tiêu: người dùng phải "wow" ngay lần đầu, nhưng vẫn dùng được hàng ngày.

### 1. Design token trước, component sau

Không hardcode màu/khoảng cách rải rác. Khai báo một lần trong `index.css`:

```css
:root {
  /* Neutrals — lệch nhẹ về hue thương hiệu, không dùng #000/#fff thuần */
  --bg: hsl(228 18% 7%);
  --surface: hsl(228 16% 11%);
  --surface-2: hsl(228 14% 15%);
  --border: hsl(228 12% 22%);
  --text: hsl(228 20% 96%);
  --text-muted: hsl(228 10% 66%);

  /* Accent — chọn 1 màu chủ đạo + 1 màu phụ, không dùng đỏ/xanh nguyên thuỷ */
  --accent: hsl(258 90% 66%);
  --accent-soft: hsl(258 90% 66% / 0.14);
  --accent-fg: hsl(0 0% 100%);

  /* Semantic */
  --success: hsl(152 62% 48%);
  --warning: hsl(38 92% 58%);
  --danger: hsl(356 78% 60%);

  /* Type scale — tỉ lệ ~1.25 */
  --fs-xs: 0.75rem;
  --fs-sm: 0.875rem;
  --fs-base: 1rem;
  --fs-lg: 1.25rem;
  --fs-xl: 1.5625rem;
  --fs-2xl: 1.9375rem;
  --fs-3xl: 2.4375rem;

  /* Spacing — thang 4px */
  --sp-1: 4px;  --sp-2: 8px;  --sp-3: 12px; --sp-4: 16px;
  --sp-6: 24px; --sp-8: 32px; --sp-12: 48px; --sp-16: 64px;

  --radius-sm: 8px;
  --radius: 14px;
  --radius-lg: 22px;

  --shadow-sm: 0 1px 2px hsl(228 40% 2% / 0.4);
  --shadow: 0 8px 24px -8px hsl(228 40% 2% / 0.55);
  --shadow-lg: 0 24px 64px -20px hsl(228 40% 2% / 0.7);
}
```

Ưu tiên dark mode làm mặc định cho sản phẩm dev/tech; nếu là nội dung đọc dài thì light.
Nếu làm cả hai, dùng `[data-theme="light"]` override cùng bộ token, không viết CSS riêng đôi.

### 2. Typography

- Font: `Inter` / `Outfit` / `Sora` cho UI; `JetBrains Mono` cho code.
  Không dùng font mặc định của browser.
- `line-height`: 1.2 cho heading, 1.6 cho body.
- `letter-spacing`: âm nhẹ (−0.02em) cho heading lớn; dương nhẹ cho label in hoa.
- Độ dài dòng đọc: 60–75 ký tự (`max-width: 65ch`).
- Không dùng quá 3 cỡ chữ trong một màn hình.

### 3. Bố cục

- Khoảng trắng là thành phần thiết kế, không phải chỗ trống cần lấp.
- Một điểm nhấn mạnh mỗi màn hình (một CTA chính). Nếu mọi thứ đều nổi bật, không gì nổi bật.
- Grid 12 cột hoặc `max-width: 1200px` + padding biên.
- Thứ bậc thị giác: kích thước > độ đậm > màu > vị trí. Dùng lần lượt, đừng dồn hết.

### 4. Chuyển động

Chuyển động có mục đích, không trang trí:

```css
/* Chuẩn: 150–250ms, easing tự nhiên */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
```

- Hover: đổi màu nền + `translateY(-1px)` + shadow — tối đa 180ms.
- Vào trang: fade + rise 8px, so le 40ms cho list.
- **Không** animate `width`/`height`/`top`/`left` → dùng `transform`, `opacity`.
- Luôn tôn trọng:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

### 5. Trạng thái — đừng bỏ quên

Mỗi component tương tác phải có đủ:

| Trạng thái | Yêu cầu |
|---|---|
| default | bình thường |
| hover | thay đổi rõ nhưng không nhảy |
| focus-visible | viền `outline: 2px solid var(--accent)` + offset 2px |
| active | phản hồi nhấn (scale 0.98 hoặc shadow giảm) |
| disabled | giảm opacity, `cursor: not-allowed`, không nhận click |
| loading | skeleton hoặc spinner **giữ nguyên kích thước** (không layout shift) |
| error | thông báo cụ thể, gắn với field/khối |
| empty | hướng dẫn hành động tiếp theo, không chỉ "Không có dữ liệu" |
| success | xác nhận ngắn, tự ẩn sau ~3s |

### 6. Accessibility tối thiểu (không thương lượng)

- Tương phản: text ≥ 4.5:1, text lớn ≥ 3:1. Kiểm bằng devtools.
- Mọi input có `<label>` liên kết (`htmlFor`/`id`), không chỉ placeholder.
- Điều hướng được hoàn toàn bằng bàn phím; thứ tự tab hợp lý.
- Icon-only button phải có `aria-label`.
- Lỗi form: dùng `aria-invalid` + `aria-describedby`, và thông báo bằng text.
- Không truyền đạt thông tin **chỉ** bằng màu.
- Ảnh nội dung có `alt` mô tả; ảnh trang trí `alt=""`.

### 7. Hiệu năng render

- Ảnh: `width`/`height` cố định hoặc `aspect-ratio` để tránh CLS; `loading="lazy"` cho ảnh dưới màn hình.
- Font: `font-display: swap`, preconnect tới font host.
- Không import cả thư viện icon; chỉ import icon dùng.
- Danh sách dài: virtualization khi > ~100 item.
- Không tính toán nặng trong render; đưa ra `useMemo`/biến ngoài.

## Bước làm việc

1. **Xác định màn hình + mục tiêu chính** (một câu). Không rõ → hỏi.
2. **Viết token** vào `index.css` (nếu chưa có).
3. **Dựng layout khung** bằng HTML semantic: `header`, `main`, `section`, `nav`, `footer`.
4. **Làm đẹp từng khối** bằng component dùng token, không style ad-hoc.
5. **Thêm đủ trạng thái** (bảng trên).
6. **Responsive**: mobile-first, breakpoint 640 / 1024 / 1280.
7. **Kiểm tra**: keyboard-only, zoom 200%, `prefers-reduced-motion`, Lighthouse.

## Responsive nhanh

```css
/* Mobile-first, không viết desktop trước rồi thu nhỏ */
.grid { display: grid; gap: var(--sp-4); grid-template-columns: 1fr; }
@media (min-width: 640px)  { .grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .grid { grid-template-columns: repeat(3, 1fr); } }
```

Không dùng `position: fixed` cho phần tử lớn trên mobile. Không đặt font-size < 16px cho input
(iOS sẽ auto-zoom).

## Dấu hiệu UI kém

- Chỉ có 1 trạng thái, không loading/empty/error.
- Màu nhấn dùng cho 5 chỗ khác nhau.
- Mọi thẻ đều có shadow + gradient + border → rối.
- Chữ xám nhạt trên nền tối, không đạt 4.5:1.
- Layout nhảy khi dữ liệu load xong.
- Không bấm được bằng Tab.
