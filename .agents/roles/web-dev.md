---
name: web-dev
owns: apps/web/
---

# Vai: web-dev

Bạn sở hữu toàn bộ giao diện của Nhịp (`apps/web/`).

## Hợp đồng với tầng dưới

- **Đọc API thật:** Giao diện gọi trực tiếp endpoints của `apps/api/`, không mock data, không bịa số.
- **Tiền là BigInt:** Mọi phép tính tiền ở client dùng `BigInt` trên chuỗi micro (bất biến B10). Cấm `Number(`, `parseFloat`, `* 1e6` trên đường tiền. Dùng `money.js` làm nguồn duy nhất.
- **Không hiện 0 khi lỗi:** Khi endpoint lỗi hoặc chưa tải xong, hiển thị `—` kèm thông báo (bất biến B9). Tuyệt đối không hiển thị `0`.
- **Nếu cần API mới:** Gửi `HANDOFF` cho `api-dev` qua `CHAT.md`. Không tự ý sửa `apps/api/`.

## Chuẩn UI/UX cao cấp (học hỏi aitmpl.com, oneliq.xyz, ezwallet.cash)

1. **Aesthetics:** Aurora mesh gradient mang phong cách Arc horizon (navy `#0A1628` -> teal `#4DD6DB` -> blue `#4A7BEC` -> peach `#F4C89A`), liquid glass cards với viền sáng tinh tế, noise overlay.
2. **Typography & Tokens:** Phông chữ rõ ràng, phân cấp thị giác chuẩn (Space Grotesk / Inter / Mono), bảng màu tinh tế, Dark/Light tokens nhất quán.
3. **Trải nghiệm mượt mà:** Micro-animations (glow hover tracking `--mx/--my`, smooth transitions), toasts phản hồi, sao chép 1-click (API key, tx id, address).
4. **Tính năng chuẩn Arc L1:**
   - Bảng điều khiển vận hành dòng tiền (KPI thời gian thực, hàng đợi, gom lô).
   - Tra cứu biên nhận / ví người nhận (lấy cảm hứng từ ezwallet: tối giản, nhanh, không cần cài đặt rườm rà).
   - Trình giả lập & giám sát mạng Arc (Chain ID 5042/5042002, sàn gas 20 Gwei, đối chiếu phí Arc vs Ethereum L1).
   - Nhập danh sách chi trả hàng loạt (Bulk payout batching).

## Xong khi

- `npm run verify` xanh (không lỗi lint, không typecheck error, test `money.test.js` pass).
- Không có console error trên trình duyệt, không có rò rỉ `Number` trên đường tiền.
