/**
 * Chia lô payout.
 *
 * Bài toán: nền tảng gửi 5.000 payout cùng lúc. Gộp vào một giao dịch thì rẻ,
 * nhưng nếu vượt gas limit hoặc revert, **toàn bộ** số người đó không được trả.
 *
 * Nên mỗi lô có hai trần:
 * - `gasBudget`  — không vượt quá một phần block, để tx luôn có chỗ được đóng vào block.
 * - `maxBatchSize` — trần cứng, để một lô không chạy quá lâu hoặc sinh payload quá lớn.
 *
 * Bất biến quan trọng nhất: **không payout nào bị mất và không payout nào bị nhân đôi.**
 * Bất biến đó được kiểm bằng test, không bằng review mắt.
 */

export interface ChunkOptions {
  /** Gas tối đa cho một lô (không phải gas limit của tx). */
  readonly gasBudget: bigint;
  /** Gas ước tính cho một payout, đã làm tròn LÊN. */
  readonly gasPerPayout: bigint;
  /** Trần số payout trong một lô. */
  readonly maxBatchSize: number;
}

export interface ChunkResult<T> {
  readonly batches: readonly (readonly T[])[];
  /** Số payout mỗi lô, để log và để ước tính phí trước khi gửi. */
  readonly gasPerBatch: readonly bigint[];
}

export class BatchPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BatchPlanError';
  }
}

/**
 * Chia danh sách thành các lô tôn trọng cả hai trần.
 *
 * Thứ tự đầu vào được giữ nguyên — payout đến trước được trả trước. Không sort,
 * vì sort theo số tiền sẽ tạo ra "người nhỏ bị trả sau", điều không ai hứa.
 *
 * @throws BatchPlanError nếu cấu hình vô lý (gasBudget < 1 payout, maxBatchSize < 1)
 */
export function planBatches<T>(items: readonly T[], options: ChunkOptions): ChunkResult<T> {
  const { gasBudget, gasPerPayout, maxBatchSize } = options;

  if (gasPerPayout <= 0n) throw new BatchPlanError('gasPerPayout phải > 0');
  if (gasBudget < gasPerPayout) {
    throw new BatchPlanError(
      `gasBudget (${gasBudget}) nhỏ hơn gas của một payout (${gasPerPayout}) — không lô nào chạy được`,
    );
  }
  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
    throw new BatchPlanError('maxBatchSize phải là số nguyên >= 1');
  }

  const byGas = Number(gasBudget / gasPerPayout);
  const size = Math.min(byGas, maxBatchSize);

  if (items.length === 0) return { batches: [], gasPerBatch: [] };

  const batches: T[][] = [];
  const gasPerBatch: bigint[] = [];
  for (let index = 0; index < items.length; index += size) {
    const slice = items.slice(index, index + size);
    batches.push(slice);
    gasPerBatch.push(BigInt(slice.length) * gasPerPayout);
  }

  return { batches, gasPerBatch };
}
