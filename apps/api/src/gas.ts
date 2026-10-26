/**
 * Hằng số gas.
 *
 * Cả hai con số ở đây đều **quan trọng hơn vẻ ngoài của chúng**: chúng quyết định
 * một lô có được đóng vào block hay treo vô hạn, và chúng quyết định mô hình chi phí
 * của toàn bộ sản phẩm.
 */

/**
 * Gas ước lượng cho một payout USDC `transfer`.
 *
 * `GIẢ ĐỊNH:` 28.000 là **ước lượng**, chưa đo trên Arc Testnet. Đây là con số
 * duy nhất trong repo mà toàn bộ luận điểm kinh tế dựa vào mà chưa có bằng chứng.
 * Khi có key testnet, thay bằng số đo `eth_estimateGas` thật và cập nhật cả
 * `ROLE.md` lẫn `docs/specs/nhip-mvp.md`.
 *
 * Vì sao ước lượng này vẫn dùng được: nó chỉ ảnh hưởng *cách chia lô*, không ảnh
 * hưởng *số tiền*. Chia lô nhỏ hơn mức cần thiết là an toàn; chia lớn hơn mức cho
 * phép mới là nguy hiểm.
 */
export const GAS_PER_PAYOUT_ESTIMATE = 28_000n;

/**
 * Sàn `maxFeePerGas` của Arc.
 *
 * Dưới sàn này, transaction **không bao giờ** được đóng vào block — nó treo, không
 * phải fail. Treo tệ hơn fail: fail thì biết mà retry, treo thì cả lô nằm im và
 * người lao động không được trả.
 */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n;
