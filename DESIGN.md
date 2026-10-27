# DESIGN — Hiến pháp thiết kế hệ thống Nhịp (Arc L1)

> Tệp này là **nguồn sự thật duy nhất** về thẩm mỹ, hệ thống token, chuyển động và tương tác giao diện của dự án Nhịp.
> Biên soạn theo chuẩn **Google Labs DESIGN.md**, bộ quy tắc chống rập khuôn **Impeccable (61 quy tắc)**, tiêu chuẩn chuyển động **Emil Kowalski** và 57 tiêu chí kiểm toán **Hallmark**.
> Mọi agent (đặc biệt là `web-dev` và `qa`) phải đọc tệp này trước khi sửa bất kỳ tệp giao diện nào (`apps/web/`).

---

## 1. Triết lý thiết kế (Design Philosophy)

1. **Reality-First & Financial Precision:**
   - Nhịp là phần mềm chuyển tiền thật cho người lao động. Giao diện ưu tiên tính minh bạch, chính xác tuyệt đối và mật độ thông tin cao.
   - Không dùng số liệu giả, không che giấu lỗi.
   - **Bất biến B9:** Lỗi hoặc chưa tải $\rightarrow$ hiển thị `—` kèm thông báo giải thích. Tuyệt đối không hiển thị `0`.
   - **Bất biến B10:** Toàn bộ số tiền trên client là `BigInt` chuỗi micro (1 USDC = 1.000.000 micro). Mọi số tiền căn phải và dùng `font-variant-numeric: tabular-nums`.

2. **Arc Horizon Aurora & Liquid Glass (cảm hứng oneliq.xyz):**
   - Thẩm mỹ mang bản sắc mạng Arc (Circle L1): Nền không gian sâu thẳm (`#0A1628` $\rightarrow$ `#04070D`), dải sáng cực quang Arc Teal (`#4DD6DB`), Arc Blue (`#4A7BEC`), Arc Peach (`#F4C89A`).
   - Thẻ kính chất lỏng (**Liquid Glass**): `backdrop-filter: blur(20px)`, viền phát sáng nhẹ góc 135°, lớp phủ hạt siêu mịn (Noise Overlay `opacity: 0.035`), hiệu ứng rọi sáng theo con trỏ chuột (`--mx`, `--my`).

3. **Zero Friction cho người nhận (cảm hứng ezwallet.cash):**
   - Người lao động bình dân, tài xế, shipper không cần hiểu Web3/gas token.
   - Cổng tra cứu biên nhận cực nhanh chỉ bằng mã nhân viên/ví, không bắt kết nối tiện ích rườm rà.

4. **Developer Experience & Tương tác bàn phím (cảm hứng aitmpl.com):**
   - Command Palette (`Ctrl+K` / `⌘K`) thực thi mọi tác vụ trong 1 nốt nhạc.
   - 1-click sao chép ID, Hash, Key kèm phản hồi Toast tức thì.
   - Hỗ trợ đầy đủ cả 2 chế độ **Tối (Dark - Mặc định)** và **Sáng (Light)**.

---

## 2. Hệ màu & Design Tokens

Tất cả màu sắc được khai báo tập trung tại `:root` trong [`apps/web/public/styles.css`](file:///d:/Arc/apps/web/public/styles.css).

### Bảng màu thương hiệu Arc L1
| Token | Giá trị HEX | Vai trò |
|---|---|---|
| `--arc-teal` | `#4DD6DB` | Màu nhấn chính (Primary brand, nút bấm, viền kích hoạt) |
| `--arc-blue` | `#4A7BEC` | Dòng tiền đã vào lô (Batched state, gradient phụ) |
| `--arc-peach` | `#F4C89A` | Dòng tiền đang chờ (Queued subtext, chân trời aurora) |
| `--arc-mint` | `#7BE495` | Thanh toán thành công (Confirmed state, số liệu tích cực) |
| `--arc-purple` | `#A78BFA` | Điểm nhấn cao cấp (Badges, tag tính năng mới) |
| `--arc-rose` | `#FB7185` | Báo lỗi, giao dịch thất bại, cảnh báo nghiêm trọng |
| `--arc-amber` | `#FBBF24` | Cảnh báo hàng đợi, trạng thái pending |

### Bảng màu bề mặt (Surfaces)
```css
/* Chế độ Tối (Dark - Mặc định) */
html.dark {
  --bg: #070B14;
  --bg-deep: #04070D;
  --bg-card: rgba(12, 20, 36, 0.65);
  --bg-card-hover: rgba(16, 26, 48, 0.8);
  --surface: rgba(255, 255, 255, 0.035);
  --surface-hover: rgba(255, 255, 255, 0.075);
  --border: rgba(255, 255, 255, 0.09);
  --border-strong: rgba(255, 255, 255, 0.16);
  --border-glow: rgba(77, 214, 219, 0.35);
  --text: #F8FAFC;
  --text-sub: #94A3B8;
  --text-mute: #64748B;
}

/* Chế độ Sáng (Light) */
html.light {
  --bg: #F4F7FB;
  --bg-deep: #E8EEF5;
  --bg-card: rgba(255, 255, 255, 0.88);
  --bg-card-hover: rgba(255, 255, 255, 0.98);
  --surface: rgba(15, 23, 42, 0.035);
  --surface-hover: rgba(15, 23, 42, 0.065);
  --border: rgba(15, 23, 42, 0.09);
  --border-strong: rgba(15, 23, 42, 0.16);
  --border-glow: rgba(14, 165, 233, 0.35);
  --text: #0F172A;
  --text-sub: #475569;
  --text-mute: #94A3B8;
}
```

---

## 3. Hệ thống Typography

* **Display Heading Font:** `'Space Grotesk', 'Inter', sans-serif`
  * Dùng cho: Tiêu đề Hero (`h1`), tiêu đề phân hệ (`h2`, `h3`), số liệu KPI lớn (`.kpi-card__val`).
  * Trọng số: `700`, `800`.
  * Khoảng cách chữ: `letter-spacing: -0.025em`, `line-height: 1.15`.
* **Body Text Font:** `'Inter', system-ui, sans-serif`
  * Dùng cho: Toàn bộ văn bản thông thường, nhãn form, mô tả, nút bấm.
  * Trọng số: `400` (Regular), `500` (Medium), `600` (Semi-bold).
  * Khoảng cách chữ: `letter-spacing: -0.01em`, `line-height: 1.55`.
* **Monospace Font:** `'JetBrains Mono', 'Space Mono', monospace`
  * Dùng cho: Số tiền USDC, mã ID (`pout_...`, `bat_...`), Tx Hash, địa chỉ ví, code snippet, badge trạng thái.
  * Bắt buộc có: `font-variant-numeric: tabular-nums` (để các chữ số không bị lệch cột khi đếm).

---

## 4. Thang khoảng cách, Bo góc & Đổ bóng

* **Thang Spacing (Hệ 4px):**
  * `4px` (xs), `8px` (sm), `12px` (md), `16px` (lg), `24px` (xl), `32px` (2xl), `48px` (3xl).
* **Thang Bo góc (Border Radii):**
  * `var(--r-xs): 6px` — Chips, phím tắt kbd.
  * `var(--r-sm): 10px` — Nút bấm nhỏ, input field, menu item.
  * `var(--r-md): 14px` — Nút bấm lớn, thẻ con, hộp thoại popup.
  * `var(--r-lg): 20px` — Thẻ Panel, Bento card, KPI card.
  * `var(--r-xl): 28px` — Thẻ Modal lớn, Cổng kết nối (Gate).
* **Đổ bóng (Elevation):**
  * Không dùng bóng đen đặc cẩu thả. Dùng bóng phân tầng kết hợp đường viền inset:
    `box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 24px 60px -20px rgba(0, 0, 0, 0.85);`

---

## 5. Quy tắc chuyển động (Motion Craft — Chuẩn Emil Kowalski)

1. **Easing Curve chủ đạo:**
   * Dùng đường cong vật lý lò xo: `var(--ease): cubic-bezier(0.22, 1, 0.36, 1)`.
   * **Cấm** dùng `linear` hoặc `ease-in` cho các thành phần UI thông thường.
2. **Thời lượng phản hồi:**
   * Tương tác vi mô (Hover, Active, Focus, Chip click): **`150ms – 220ms`**.
   * Chuyển Tab, trượt Toast, mở Modal: **`200ms – 250ms`**.
   * Trượt mở Drawer: **`300ms`**.
3. **Phản hồi tương tác (Micro-interactions):**
   * Nút bấm khi hover: Nâng nhẹ `transform: translateY(-1px)` kèm bóng sáng.
   * Nút bấm khi click (Active): `transform: scale(0.98)`.
   * Thẻ kính khi hover: Kích hoạt viền sáng và tâm rọi sáng theo con trỏ chuột (`--mx`, `--my`).
4. **Giảm chuyển động (Accessibility):**
   * Tuân thủ `@media (prefers-reduced-motion: reduce)`: Tắt ngay các animation nền và đưa `transition` về `none`.

---

## 6. Bộ quy tắc chống rập khuôn (Anti-Generic Rules — Impeccable)

Mọi agent phải tuân thủ 10 điều cấm kỵ sau:

1. **Cấm màu tím mặc định:** Không tạo các nút bấm hoặc gradient màu tím/hồng vô nghĩa kiểu template mẫu. Nhịp dùng bảng màu mạng Arc (`teal/blue/peach`).
2. **Cấm Card trống trải:** Mọi thẻ card phải có mật độ thông tin hữu dụng (tiêu đề, số liệu chính, nhãn phụ, thanh tiến trình hoặc nút hành động).
3. **Cấm bảng thiếu căn chỉnh:** Cột số tiền và số lượng **bắt buộc căn phải** (`text-align: right`). Cột mã ID căn trái.
4. **Cấm thiếu trạng thái:** Mọi nút bấm và trường nhập phải có đủ 5 trạng thái: `default`, `hover`, `focus-visible`, `active`, `disabled`.
5. **Cấm spinner toàn màn hình vô hồn:** Dùng trạng thái nạp dữ liệu tại chỗ (inline spinner trên nút bấm) hoặc hiệu ứng nạp cục bộ.
6. **Cấm văn bản tràn không kiểm soát:** Các chuỗi dài như Tx Hash, Địa chỉ ví, ID phải được rút gọn bằng `shortenAddress()` (`0x5aae…eaed`) kèm tooltip hoặc nút copy.
7. **Cấm trạng thái rỗng cộc lốc:** Khi bảng rỗng, không chỉ viết chữ "Trống". Phải viết câu hướng dẫn hành động (ví dụ: *"Chưa có lô thanh toán nào. Bấm 'Gom lô' để bắt đầu."*).
8. **Cấm số tiền float:** Cấm tuyệt đối `Number(`, `parseFloat` trên luồng tiền.
9. **Cấm mất dấu phân tách hàng nghìn:** Mọi số tiền lớn phải được phân tách hàng nghìn theo chuẩn tiếng Việt (`1.650.000,00 USDC`).
10. **Cấm vùng bấm nhỏ hơn 40px trên di động:** Mọi nút bấm, tab, filter item trên thiết bị cảm ứng phải có diện tích bấm tối thiểu 44x44px.

---

## 7. Danh mục 57 tiêu chí kiểm toán giao diện (Hallmark Audit Gate)

Trước khi ký `DONE`, vai `qa` phải kiểm tra theo bảng tiêu chí:

| Nhóm | Tiêu chí kiểm tra | Đạt khi |
|---|---|---|
| **Độ tương phản** | Chữ thường trên nền thẻ kính | Tỉ lệ tương phản WCAG AA $\ge 4.5:1$ |
| **Độ tương phản** | Chữ tiêu đề lớn trên nền gradient | Tương phản $\ge 3:1$, dễ đọc ở cả 2 theme |
| **Bất biến B9** | Mất mạng hoặc API trả mã lỗi 500 | KPI và bảng hiện `—`, **không hiện 0** |
| **Bất biến B10** | Số tiền `1.000.000.000 USDC` | Đọc qua `BigInt`, hiển thị `1.000.000.000,00` không mất chính xác |
| **Bàn phím** | Bấm `Ctrl+K` / `⌘K` | Mở ngay Command Palette, gõ phím tìm kiếm mượt mà |
| **Bàn phím** | Bấm `Escape` | Đóng ngay Drawer hoặc Command Palette đang mở |
| **Di động** | Chiều rộng màn hình `375px` (iPhone) | Không vỡ khung, không xuất hiện thanh cuộn ngang trang |
| **Tải trang** | Mở trang lần đầu | Tải dưới 100ms, không có hiện tượng giật cục (layout shift) |
| **An toàn** | XSS Guard | Dữ liệu người dùng (tham chiếu, tên) dựng qua `textContent`, không nối chuỗi `innerHTML` |
