/**
 * Ghi lô payout.
 *
 * Hai lớp idempotency, mỗi lớp trả lời một câu hỏi khác nhau:
 *
 * 1. `request_key` — "request HTTP này đã được xử lý chưa?". Retry của cùng một
 *    request phải trả lại **đúng các lô cũ**, không tạo lô mới.
 * 2. `idempotency_key` trên từng dòng lô và từng payout — bảo vệ ở mức từng bản ghi.
 *
 * Một request có thể sinh nhiều lô (khi tổng vượt `gasBudget`). Đó là lý do có
 * `chunk_index`: id lô là ngẫu nhiên nên không thể sắp xếp theo id.
 *
 * Mọi hàm nhận `Database` **có thể là handle transaction**. Caller quyết định ranh
 * giới transaction, vì chỉ caller biết những gì phải cùng sống hoặc cùng chết.
 */

import type { Database } from '../../../packages/db/src/client.ts';
import type { Micro } from '../../../packages/core/src/money.ts';
import { sum } from '../../../packages/core/src/money.ts';

export interface BatchRow {
  readonly id: string;
  readonly state: string;
  /** `payout_count` là INTEGER nên driver trả number — an toàn, trần là 500. */
  readonly payout_count: number;
  /** Chuỗi số nguyên — xem ghi chú `amount_micro::text` ở `payouts.repo.ts`. */
  readonly total_micro: string;
  readonly estimated_gas: string;
  readonly request_key: string | null;
  readonly request_hash: string | null;
  readonly chunk_index: number;
  readonly tx_hash: string | null;
  readonly created_at: Date;
}

const SELECT_COLUMNS =
  'id, state, payout_count, total_micro::text AS total_micro, ' +
  'estimated_gas::text AS estimated_gas, request_key, request_hash, chunk_index, tx_hash, created_at';

export interface PayoutToCreate {
  /** Id payout do caller sinh. */
  readonly id: string;
  readonly workerId: string;
  readonly amountMicro: Micro;
  readonly reference: string | undefined;
  /** Idempotency key suy ra từ request + vị trí dòng, không lấy từ client. */
  readonly idempotencyKey: string;
}

/** Một lô đã lên kế hoạch: biết id, biết payout nào thuộc về, biết gas ước tính. */
export interface PlannedBatch {
  readonly batchId: string;
  readonly payouts: readonly PayoutToCreate[];
  readonly estimatedGas: bigint;
}

export interface CreateBatchRequestInput {
  readonly requestKey: string;
  /** Băm nội dung request — để phát hiện client dùng lại key cho payload khác. */
  readonly requestHash: string;
  readonly plan: readonly PlannedBatch[];
}

export interface CreateBatchRequestResult {
  readonly batches: readonly BatchRow[];
  /** true = request này đã từng xử lý; không có dòng mới nào được tạo. */
  readonly duplicate: boolean;
}

/**
 * Cùng `Idempotency-Key` nhưng nội dung khác.
 *
 * Đây là lỗi của client và phải nổ to. Trả lại kết quả cũ một cách im lặng còn tệ
 * hơn lỗi: client tưởng payout mới đã được tạo, dashboard báo xanh, và một loạt
 * người không được trả lương.
 */
export class RequestKeyConflictError extends Error {
  readonly storedHash: string | null;
  readonly incomingHash: string;

  constructor(storedHash: string | null, incomingHash: string) {
    super(
      'Idempotency-Key này đã được dùng cho một request có nội dung khác. ' +
        'Dùng key mới cho payout mới; key cũ chỉ dùng lại khi retry đúng request cũ.',
    );
    this.name = 'RequestKeyConflictError';
    this.storedHash = storedHash;
    this.incomingHash = incomingHash;
  }
}

/**
 * Tạo payout + lô trong **một** transaction.
 *
 * Vì sao bắt buộc một transaction: nếu insert lô xong mà chưa kịp gán `batch_id`
 * thì các payout nằm ở `queued` không thuộc lô nào, và lần chạy sau sẽ gom chúng
 * vào lô khác — nghĩa là cùng một payout được trả hai lần.
 *
 * Không tự mở transaction: caller bọc cả phần kiểm worker ở ngoài trong cùng
 * transaction, để một payout trỏ tới worker không tồn tại không thể lọt qua.
 */
export async function createBatchRequest(
  tx: Database,
  platformId: string,
  input: CreateBatchRequestInput,
): Promise<CreateBatchRequestResult> {
  const { requestKey, requestHash, plan } = input;

  const existing = await findBatchesByRequestKey(tx, platformId, requestKey);
  if (existing.length > 0) {
    const storedHash = existing[0]?.request_hash ?? null;
    if (storedHash !== null && storedHash !== requestHash) {
      throw new RequestKeyConflictError(storedHash, requestHash);
    }
    return { batches: existing, duplicate: true };
  }

  const allPayouts = plan.flatMap((batch) => batch.payouts);
  const total = sum(allPayouts.map((payout) => payout.amountMicro));
  const created: BatchRow[] = [];

  for (let index = 0; index < plan.length; index++) {
    const batch = plan[index];
    if (!batch) continue;

    const chunkTotal = sum(batch.payouts.map((payout) => payout.amountMicro));

    for (const payout of batch.payouts) {
      await tx.query(
        `INSERT INTO payouts (id, platform_id, worker_id, amount_micro, idempotency_key, reference)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          payout.id,
          platformId,
          payout.workerId,
          payout.amountMicro.toString(),
          payout.idempotencyKey,
          payout.reference ?? null,
        ],
      );
    }

    // Lô được insert SAU payout: ràng buộc `payout_batch_consistency` yêu cầu
    // payout ở trạng thái `batched` phải có batch_id hợp lệ, nên thứ tự ngược lại
    // sẽ vi phạm FK. Cập nhật trạng thái ở dưới, sau khi lô đã tồn tại.
    const inserted = await tx.query<BatchRow>(
      `INSERT INTO batches
         (id, platform_id, payout_count, total_micro, estimated_gas,
          idempotency_key, request_key, request_hash, chunk_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${SELECT_COLUMNS}`,
      [
        batch.batchId,
        platformId,
        batch.payouts.length,
        chunkTotal.toString(),
        batch.estimatedGas.toString(),
        `batch:${requestKey}#${index}`,
        requestKey,
        requestHash,
        index,
      ],
    );

    const row = inserted.rows[0];
    if (!row) throw new Error('createBatchRequest: INSERT ... RETURNING không trả dòng nào');

    const placeholders = batch.payouts.map((_, position) => `$${position + 3}`).join(', ');
    const updated = await tx.query(
      `UPDATE payouts
          SET batch_id = $1, state = 'batched'
        WHERE platform_id = $2 AND id IN (${placeholders}) AND state = 'queued'`,
      [batch.batchId, platformId, ...batch.payouts.map((payout) => payout.id)],
    );

    if (updated.rowCount !== batch.payouts.length) {
      throw new Error(
        `batch ${batch.batchId}: gán được ${updated.rowCount}/${batch.payouts.length} payout. ` +
          'Có payout không ở trạng thái queued — dừng lại thay vì tạo lô nói dối về số lượng.',
      );
    }

    created.push(row);
  }

  // Bất biến: tổng của các lô phải bằng tổng đầu vào. Không payout nào bị mất
  // hoặc bị đếm hai lần. Kiểm ở đây vì đây là chỗ duy nhất biết cả hai con số.
  const sumOfBatches = sum(created.map((row) => BigInt(row.total_micro) as Micro));
  if (sumOfBatches !== total) {
    throw new Error(`tổng lô (${sumOfBatches}) != tổng payout (${total}) — rollback`);
  }

  return { batches: created, duplicate: false };
}

export async function findBatchesByRequestKey(
  db: Database,
  platformId: string,
  requestKey: string,
): Promise<BatchRow[]> {
  const result = await db.query<BatchRow>(
    `SELECT ${SELECT_COLUMNS} FROM batches
      WHERE platform_id = $1 AND request_key = $2
      ORDER BY chunk_index ASC`,
    [platformId, requestKey],
  );
  return result.rows;
}

export async function findRequestHash(
  db: Database,
  platformId: string,
  requestKey: string,
): Promise<string | null> {
  const result = await db.query<{ request_hash: string | null }>(
    `SELECT request_hash FROM batches
      WHERE platform_id = $1 AND request_key = $2
      ORDER BY chunk_index ASC LIMIT 1`,
    [platformId, requestKey],
  );
  return result.rows[0]?.request_hash ?? null;
}

export async function findBatchById(db: Database, platformId: string, id: string): Promise<BatchRow | null> {
  const result = await db.query<BatchRow>(
    `SELECT ${SELECT_COLUMNS} FROM batches WHERE id = $1 AND platform_id = $2`,
    [id, platformId],
  );
  return result.rows[0] ?? null;
}

export interface BatchPayoutRow {
  readonly id: string;
  readonly worker_id: string;
  readonly amount_micro: string;
  readonly state: string;
  readonly reference: string | null;
}

const PAYOUT_COLUMNS =
  'id, worker_id, amount_micro::text AS amount_micro, state, reference';

export async function listBatchPayouts(
  db: Database,
  platformId: string,
  batchId: string,
): Promise<BatchPayoutRow[]> {
  const result = await db.query<BatchPayoutRow>(
    `SELECT ${PAYOUT_COLUMNS} FROM payouts
      WHERE platform_id = $1 AND batch_id = $2
      ORDER BY created_at ASC, id ASC`,
    [platformId, batchId],
  );
  return result.rows;
}

/** Payout của toàn bộ các lô thuộc một request — dùng khi trả kết quả retry. */
export async function listRequestPayouts(
  db: Database,
  platformId: string,
  requestKey: string,
): Promise<BatchPayoutRow[]> {
  const result = await db.query<BatchPayoutRow>(
    `SELECT p.id, p.worker_id, p.amount_micro::text AS amount_micro, p.state, p.reference
       FROM payouts p
       JOIN batches b ON b.id = p.batch_id AND b.platform_id = p.platform_id
      WHERE p.platform_id = $1 AND b.request_key = $2
      ORDER BY b.chunk_index ASC, p.created_at ASC, p.id ASC`,
    [platformId, requestKey],
  );
  return result.rows;
}
