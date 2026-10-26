/**
 * Gom các payout **đang chờ** trong hàng đợi thành lô.
 *
 * Đây là luồng nghiệp vụ chính của sản phẩm, khác với `POST /v1/batches`:
 *
 * - `POST /v1/batches` — client đẩy danh sách payout mới, ta tạo rồi chia lô luôn.
 * - Hàm này — payout đã nằm trong hàng đợi từ trước (do client đẩy lẻ qua
 *   `POST /v1/payouts`), giờ gom chúng lại.
 *
 * Cả hai đều cần vì hai kiểu tích hợp khác nhau: nền tảng lớn đẩy theo lô, nền
 * tảng nhỏ đẩy từng payout khi đơn hoàn thành rồi để hệ thống tự gom.
 *
 * Không dùng lại `createBatchRequest`: hàm đó INSERT payout mới. Ở đây payout đã
 * tồn tại và chỉ đổi trạng thái — dùng chung sẽ tạo ra bản ghi trùng.
 */

import type { Database } from '../../../packages/db/src/client.ts';
import type { Micro } from '../../../packages/core/src/money.ts';
import { sum } from '../../../packages/core/src/money.ts';
import type { BatchRow } from './batches.repo.ts';

export interface QueuedPayout {
  readonly id: string;
  readonly amount_micro: string;
}

/**
 * Đọc hàng đợi, cũ nhất trước.
 *
 * `FOR UPDATE SKIP LOCKED`: nếu hai worker nền cùng chạy, mỗi cái lấy một tập
 * payout khác nhau thay vì cùng lấy một tập rồi một cái phải fail. Đây là cách
 * chuẩn để xử lý hàng đợi trên Postgres mà không cần một lock toàn cục.
 */
export async function claimQueuedPayouts(
  tx: Database,
  platformId: string,
  limit: number,
): Promise<QueuedPayout[]> {
  const result = await tx.query<QueuedPayout>(
    `SELECT id, amount_micro::text AS amount_micro
       FROM payouts
      WHERE platform_id = $1 AND state = 'queued'
      ORDER BY created_at ASC, id ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED`,
    [platformId, limit],
  );
  return result.rows;
}

export interface QueueChunk {
  readonly batchId: string;
  readonly payoutIds: readonly string[];
  readonly estimatedGas: bigint;
}

export interface CreateFromQueueResult {
  readonly batches: BatchRow[];
  readonly payoutCount: number;
  readonly totalMicro: string;
}

const SELECT_COLUMNS =
  'id, state, payout_count, total_micro::text AS total_micro, ' +
  'estimated_gas::text AS estimated_gas, request_key, request_hash, chunk_index, tx_hash, created_at';

/**
 * Gán các payout đã có vào lô.
 *
 * Kiểm `rowCount` sau mỗi `UPDATE`: nếu một payout đã bị worker khác lấy mất thì
 * `UPDATE ... WHERE state = 'queued'` sẽ bỏ qua nó, và lô sẽ có `payout_count`
 * lớn hơn số payout thật. Sai lệch đó không được phép lọt qua — nó là nguồn gốc
 * của việc "trả 200 người nhưng chỉ 197 người nhận tiền".
 *
 * `requestKey` là key của **lần gom lô** này (do hệ thống sinh), không phải của
 * client, nên retry không có ý nghĩa ở đây: mỗi lần gom là một sự kiện riêng.
 */
export async function createBatchesFromQueue(
  tx: Database,
  platformId: string,
  requestKey: string,
  chunks: readonly QueueChunk[],
  amountsById: ReadonlyMap<string, Micro>,
): Promise<CreateFromQueueResult> {
  const batches: BatchRow[] = [];
  let payoutCount = 0;
  let totalMicro: Micro = 0n as Micro;

  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    if (!chunk) continue;

    const chunkAmounts = chunk.payoutIds.map((id) => amountsById.get(id) ?? (0n as Micro));
    const chunkTotal = sum(chunkAmounts);

    const inserted = await tx.query<BatchRow>(
      `INSERT INTO batches
         (id, platform_id, state, payout_count, total_micro, estimated_gas,
          idempotency_key, request_key, chunk_index)
       VALUES ($1, $2, 'planned', $3, $4, $5, $6, $7, $8)
       RETURNING ${SELECT_COLUMNS}`,
      [
        chunk.batchId,
        platformId,
        chunk.payoutIds.length,
        chunkTotal.toString(),
        chunk.estimatedGas.toString(),
        `batch:${requestKey}#${index}`,
        requestKey,
        index,
      ],
    );

    const row = inserted.rows[0];
    if (!row) throw new Error('createBatchesFromQueue: INSERT ... RETURNING không trả dòng nào');

    const placeholders = chunk.payoutIds.map((_, position) => `$${position + 3}`).join(', ');
    const updated = await tx.query(
      `UPDATE payouts SET batch_id = $1, state = 'batched'
        WHERE platform_id = $2 AND id IN (${placeholders}) AND state = 'queued'`,
      [chunk.batchId, platformId, ...chunk.payoutIds],
    );

    if (updated.rowCount !== chunk.payoutIds.length) {
      throw new Error(
        `batch ${chunk.batchId}: chỉ gán được ${updated.rowCount}/${chunk.payoutIds.length} payout. ` +
          'Có payout vừa bị worker khác lấy. Rollback để lần gom sau nhặt lại — ' +
          'thà chậm một nhịp còn hơn tạo lô nói dối về số người được trả.',
      );
    }

    batches.push(row);
    payoutCount += chunk.payoutIds.length;
    totalMicro = (totalMicro + chunkTotal) as Micro;
  }

  return { batches, payoutCount, totalMicro: totalMicro.toString() };
}
