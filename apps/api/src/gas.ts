/**
 * Hằng số gas.
 *
 * Cả hai con số ở đây đều **quan trọng hơn vẻ ngoài của chúng**: chúng quyết định
 * một lô có được đóng vào block hay treo vô hạn, và chúng quyết định mô hình chi phí
 * của toàn bộ sản phẩm.
 */

/**
 * Gas cho một `transfer` USDC tới địa chỉ **đã từng giữ** token.
 *
 * Đo thật trên Arc Testnet (`eth_estimateGas`, USDC `0x3600…0000`, 2026-10-27):
 * 49.338 – 49.950. Lấy cận trên và làm tròn lên 50.000.
 */
export const GAS_PER_PAYOUT_WARM = 50_000n;

/**
 * Gas cho một `transfer` USDC tới địa chỉ **chưa từng nhận** token (cold account).
 *
 * Đo thật trên Arc Testnet: 74.682. Đây là trường hợp phổ biến nhất của sản phẩm —
 * người lao động gig nhận lương lần đầu bằng ví mới. Ước lượng theo trường hợp đắt
 * nhất là có chủ đích: chia lô nhỏ hơn mức cần là an toàn, chia lớn hơn mức cho phép
 * là một lô revert và cả lô người không được trả.
 */
export const GAS_PER_PAYOUT_COLD = 75_000n;

/**
 * Con số dùng để chia lô. Chọn trường hợp **lạnh**, không phải trường hợp trung bình,
 * vì trần gas phải đúng cho lô tệ nhất.
 *
 * Đây từng là 28.000 — một giả định chưa đo, thấp hơn thực tế 1,8–2,7 lần. Nếu
 * dùng lại con số đó, một lô 357 payout sẽ cần ~26,7M gas, vượt gas limit block
 * 30M sau khi cộng overhead, và transaction sẽ không bao giờ được đóng vào block.
 */
export const GAS_PER_PAYOUT_ESTIMATE = GAS_PER_PAYOUT_COLD;

/**
 * Sàn `maxFeePerGas` của Arc.
 *
 * Dưới sàn này, transaction **không bao giờ** được đóng vào block — nó treo, không
 * phải fail. Treo tệ hơn fail: fail thì biết mà retry, treo thì cả lô nằm im và
 * người lao động không được trả.
 */
export const MIN_MAX_FEE_PER_GAS = 20_000_000_000n;

/**
 * Gas limit của một transaction trên Arc (đo `eth_getBlockByNumber`, block mới nhất:
 * 30.000.000). Dùng để kiểm rằng một lô vẫn còn chỗ trong block, không phải để đặt
 * `gasLimit` cho tx.
 */
export const ARC_BLOCK_GAS_LIMIT = 30_000_000n;
