/**
 * `/v1/batches` — nhận nhiều payout trong một request, chia lô theo ngân sách gas.
 *
 * Ba quyết định định hình file này:
 *
 * 1. **Một dòng lỗi không làm hỏng cả request.** 2 dòng đúng + 1 dòng sai → 2 dòng
 *    được tạo, 1 dòng bị từ chối kèm chỉ số và lý do. Nền tảng trả lương cho 400
 *    người không thể bị chặn bởi một mã tài xế viết sai.
 *
 * 2. **Validate toàn bộ trước khi ghi bất cứ thứ gì.** Chia lô trên một danh sách
 *    còn đang lỗi nghĩa là lô sau có số payout khác lô trước một cách không giải
 *    thích được.
 *
 * 3. **Không chờ chain.** Trả `202` với id lô. Gửi giao dịch là việc của worker nền.
 */

import { createHash } from 'node:crypto';

import { Hono } from 'hono';

import { planBatches } from '../../../packages/core/src/batching.ts';
import type { Database } from '../../../packages/db/src/client.ts';
import { ID_PREFIX, newId } from '../../../packages/core/src/ids.ts';
import type { Micro } from '../../../packages/core/src/money.ts';
import {
  createBatchRequest,
  findBatchById,
  findBatchesByRequestKey,
  listBatchPayouts,
  listRequestPayouts,
  type BatchRow,
  type PlannedBatch,
} from './batches.repo.ts';
import type { AppEnv } from './context.ts';
import { AppError, ErrorCode } from './errors.ts';
import { GAS_PER_PAYOUT_ESTIMATE } from './gas.ts';
import type { RouteOptions } from './payouts.route.ts';
import { claimQueuedPayouts, createBatchesFromQueue } from './queue.repo.ts';
import {
  newCollector,
  readJsonBody,
  requireIdempotencyKey,
  requireObject,
  takeAmountMicro,
  takeString,
} from './validate.ts';

/** Trần cứng của một request. Vượt mức này là client nên chia nhỏ ở phía họ. */
const MAX_PAYOUTS_PER_REQUEST = 5_000;

interface AcceptedRow {
  readonly index: number;
  readonly workerId: string;
  readonly amountMicro: Micro;
  readonly reference: string | undefined;
}

interface RejectedRow {
  readonly index: number;
  readonly code: string;
  readonly message: string;
  readonly fields?: readonly { field: string; message: string }[];
}

export function toBatchBody(row: BatchRow) {
  return {
    id: row.id,
    state: row.state,
    payoutCount: row.payout_count,
    total_micro: row.total_micro,
    estimatedGas: row.estimated_gas,
    chunkIndex: row.chunk_index,
    txHash: row.tx_hash,
    created_at: row.created_at.toISOString(),
  };
}

/**
 * Băm nội dung request để phát hiện việc dùng lại key cho payload khác.
 *
 * Không băm chuỗi body thô: cùng một payload có thể tới dưới hai dạng khoảng trắng
 * khác nhau và bị coi là hai payload khác nhau — client sẽ nhận 409 dù họ không
 * làm gì sai. Băm trên dữ liệu **đã chuẩn hoá** thì chỉ nội dung thật mới tạo ra
 * hash khác.
 */
function hashRequest(payouts: readonly AcceptedRow[]): string {
  const canonical = payouts.map((payout) => [
    payout.index,
    payout.workerId,
    payout.amountMicro.toString(),
    payout.reference ?? '',
  ]);
  return createHash('sha256').update(JSON.stringify(canonical), 'utf8').digest('hex');
}

export function createBatchRoutes(options: RouteOptions): Hono<AppEnv> {
  const { db } = options;
  const routes = new Hono<AppEnv>();

  routes.post('/', async (c) => {
    const platform = c.get('platform');
    const idempotencyKey = requireIdempotencyKey(c.req.header('idempotency-key'));

    const body = await readJsonBody(c.req);
    const collector = newCollector();
    const source = requireObject(body, collector);
    if (!source) {
      collector.throwIfAny();
      throw new AppError(ErrorCode.INTERNAL, 'Body không phải object nhưng không có lỗi — lỗi logic.');
    }

    const rawPayouts = source.payouts;
    if (!Array.isArray(rawPayouts)) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Payload không hợp lệ: payouts', {
        fields: [{ field: 'payouts', message: 'Phải là mảng các payout.' }],
      });
    }
    if (rawPayouts.length === 0) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Payload không hợp lệ: payouts', {
        fields: [{ field: 'payouts', message: 'Mảng rỗng thì không có gì để trả lương.' }],
      });
    }
    if (rawPayouts.length > MAX_PAYOUTS_PER_REQUEST) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Payload không hợp lệ: payouts', {
        fields: [
          {
            field: 'payouts',
            message: `Tối đa ${MAX_PAYOUTS_PER_REQUEST} payout mỗi request. Chia thành nhiều request.`,
          },
        ],
      });
    }

    // ---- 1. Validate từng dòng, gom lỗi theo chỉ số ----
    const accepted: AcceptedRow[] = [];
    const rejected: RejectedRow[] = [];

    rawPayouts.forEach((raw, index) => {
      const rowCollector = newCollector();
      const row = requireObject(raw, rowCollector, `payouts[${index}]`);
      if (!row) {
        rejected.push({
          index,
          code: ErrorCode.VALIDATION_FAILED,
          message: rowCollector.errors[0]?.message ?? 'Dòng không phải object.',
        });
        return;
      }

      const workerId = takeString(row, 'workerId', rowCollector, { min: 3, max: 100 });
      const amountMicro = takeAmountMicro(row, 'amount_micro', rowCollector);
      const reference = takeString(row, 'reference', rowCollector, { required: false, max: 500 });

      if (rowCollector.hasErrors) {
        rejected.push({
          index,
          code: ErrorCode.VALIDATION_FAILED,
          message: rowCollector.errors.map((f) => f.message).join(' '),
          fields: rowCollector.errors,
        });
        return;
      }
      if (workerId === null || amountMicro === null) {
        throw new AppError(ErrorCode.INTERNAL, 'Validate xong mà thiếu trường — lỗi logic.');
      }

      accepted.push({ index, workerId, amountMicro, reference: reference ?? undefined });
    });

    // ---- 2. Kiểm worker thuộc nền tảng nào, một query cho cả lô ----
    const knownWorkers = await findKnownWorkers(db, platform.id, accepted.map((row) => row.workerId));
    const payable: AcceptedRow[] = [];
    for (const row of accepted) {
      if (knownWorkers.has(row.workerId)) {
        payable.push(row);
      } else {
        rejected.push({
          index: row.index,
          code: ErrorCode.WORKER_NOT_FOUND,
          message: 'Không tìm thấy người lao động này trong nền tảng.',
        });
      }
    }

    // Sắp lại theo chỉ số gốc: thứ tự trả lương phải giữ nguyên thứ tự client gửi.
    payable.sort((a, b) => a.index - b.index);
    rejected.sort((a, b) => a.index - b.index);

    if (payable.length === 0) {
      // Không có gì được tạo, nên đây là lỗi của cả request chứ không phải "một phần".
      throw new AppError(
        ErrorCode.VALIDATION_FAILED,
        `Không có payout nào hợp lệ trong ${rawPayouts.length} dòng.`,
        { rejected },
      );
    }

    // ---- 3. Chia lô ----
    const { batches: chunks, gasPerBatch } = planBatches(payable, {
      gasBudget: platform.gasBudget,
      gasPerPayout: GAS_PER_PAYOUT_ESTIMATE,
      maxBatchSize: platform.batchSize,
    });

    const requestHash = hashRequest(payable);

    // Payout mới cần id ổn định giữa các lần retry: sinh từ request key + chỉ số dòng.
    // Nếu sinh ngẫu nhiên, retry trong cùng một request sẽ có id khác và không thể
    // đối chiếu với lần trước.
    const plan: PlannedBatch[] = chunks.map((chunk, chunkIndex) => ({
      batchId: newId(ID_PREFIX.BATCH),
      estimatedGas: gasPerBatch[chunkIndex] ?? 0n,
      payouts: chunk.map((row) => ({
        id: deriveId(ID_PREFIX.PAYOUT, idempotencyKey, row.index),
        workerId: row.workerId,
        amountMicro: row.amountMicro,
        reference: row.reference,
        idempotencyKey: deriveId('idem', idempotencyKey, row.index),
      })),
    }));

    // ---- 4. Ghi trong một transaction ----
    const result = await db.transaction((tx) =>
      createBatchRequest(tx, platform.id, {
        requestKey: idempotencyKey,
        requestHash,
        plan,
      }),
    );

    const payoutRows = result.duplicate
      ? await listRequestPayouts(db, platform.id, idempotencyKey)
      : await listBatchPayoutsForBatches(db, platform.id, result.batches.map((row) => row.id));

    const payload = {
      batches: result.batches.map(toBatchBody),
      payouts: payoutRows.map((row) => ({
        id: row.id,
        workerId: row.worker_id,
        amount_micro: row.amount_micro,
        state: row.state,
        reference: row.reference,
      })),
      accepted: result.duplicate ? payoutRows.length : payable.length,
      rejected,
      duplicate: result.duplicate,
    };

    if (result.duplicate) return c.json(payload, 200);
    return c.json(payload, rejected.length > 0 ? 207 : 202);
  });

  /**
   * Gom các payout đang `queued` thành lô.
   *
   * Khác `POST /v1/batches` ở chỗ: endpoint kia nhận payout MỚI từ client, endpoint
   * này gom payout ĐÃ CÓ trong hàng đợi. Không cần `Idempotency-Key` vì mỗi lần gom
   * là một sự kiện riêng — gọi hai lần thì lần hai gom phần còn lại, và nếu hàng đợi
   * rỗng thì không tạo gì.
   */
  routes.post('/from-queue', async (c) => {
    const platform = c.get('platform');

    const collected = await db.transaction(async (tx) => {
      // `FOR UPDATE SKIP LOCKED` để hai lần gọi đồng thời không cùng nhặt một payout.
      // Đọc trong transaction vì lock chỉ có hiệu lực tới COMMIT.
      const queued = await claimQueuedPayouts(tx, platform.id, platform.batchSize * 10);
      if (queued.length === 0) return null;

      const amountsById = new Map<string, Micro>();
      for (const row of queued) amountsById.set(row.id, BigInt(row.amount_micro) as Micro);

      const { batches, gasPerBatch } = planBatches(queued, {
        gasBudget: platform.gasBudget,
        gasPerPayout: GAS_PER_PAYOUT_ESTIMATE,
        maxBatchSize: platform.batchSize,
      });

      const requestKey = newId(ID_PREFIX.BATCH);
      const chunks = batches.map((chunk, index) => ({
        batchId: newId(ID_PREFIX.BATCH),
        payoutIds: chunk.map((row) => row.id),
        estimatedGas: gasPerBatch[index] ?? 0n,
      }));

      return createBatchesFromQueue(tx, platform.id, requestKey, chunks, amountsById);
    });

    if (!collected) {
      return c.json({ batches: [], payoutCount: 0, total_micro: '0', message: 'Hàng đợi rỗng.' }, 200);
    }

    return c.json(
      {
        batches: collected.batches.map(toBatchBody),
        payoutCount: collected.payoutCount,
        total_micro: collected.totalMicro,
      },
      202,
    );
  });

  routes.get('/:id', async (c) => {
    const platform = c.get('platform');
    const batch = await findBatchById(db, platform.id, c.req.param('id'));
    if (!batch) throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy lô.');

    const payouts = await listBatchPayouts(db, platform.id, batch.id);
    return c.json({
      ...toBatchBody(batch),
      payouts: payouts.map((row) => ({
        id: row.id,
        workerId: row.worker_id,
        amount_micro: row.amount_micro,
        state: row.state,
        reference: row.reference,
      })),
    });
  });

  /** Các lô của một request, để client retry không phải giữ state. */
  routes.get('/', async (c) => {
    const platform = c.get('platform');
    const requestKey = c.req.query('requestKey');
    if (!requestKey) {
      throw new AppError(ErrorCode.VALIDATION_FAILED, 'Thiếu tham số requestKey.', {
        fields: [{ field: 'requestKey', message: 'Truyền Idempotency-Key của request cần tra.' }],
      });
    }
    const batches = await findBatchesByRequestKey(db, platform.id, requestKey);
    return c.json({ batches: batches.map(toBatchBody) });
  });

  return routes;
}

/** Id ổn định: cùng `(key, index)` luôn ra cùng id. */
function deriveId(prefix: string, key: string, index: number): string {
  const digest = createHash('sha256').update(`${key}#${index}`, 'utf8').digest('hex');
  return `${prefix}_${digest.slice(0, 32)}`;
}

async function findKnownWorkers(db: Database, platformId: string, ids: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();

  const placeholders = unique.map((_, index) => `$${index + 2}`).join(', ');
  const result = await db.query<{ id: string }>(
    `SELECT id FROM workers WHERE platform_id = $1 AND id IN (${placeholders})`,
    [platformId, ...unique],
  );
  return new Set(result.rows.map((row) => row.id));
}

async function listBatchPayoutsForBatches(
  db: Database,
  platformId: string,
  batchIds: readonly string[],
): Promise<{ id: string; worker_id: string; amount_micro: string; state: string; reference: string | null }[]> {
  if (batchIds.length === 0) return [];
  const placeholders = batchIds.map((_, index) => `$${index + 2}`).join(', ');
  const result = await db.query<{
    id: string;
    worker_id: string;
    amount_micro: string;
    state: string;
    reference: string | null;
  }>(
    `SELECT id, worker_id, amount_micro::text AS amount_micro, state, reference
       FROM payouts
      WHERE platform_id = $1 AND batch_id IN (${placeholders})
      ORDER BY created_at ASC, id ASC`,
    [platformId, ...batchIds],
  );
  return result.rows;
}
