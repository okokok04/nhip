/**
 * Đọc/ghi dấu vết settlement của một lô.
 *
 * File này là chỗ duy nhất được phép đổi `payouts.state` sang `submitted`/`confirmed`/
 * `failed`/`unknown`, vì đó là chỗ duy nhất biết cả ba thứ cần thiết: batch nào, tx nào,
 * và kết quả chain nào. Route chỉ quyết định *khi nào* gọi; file này quyết định *cái gì
 * được ghi*.
 *
 * Nguyên tắc: ghi trạng thái **trước** khi hành động, không phải sau. Một tx đã broadcast
 * mà DB vẫn nói `batched` nghĩa là nếu process chết, lần chạy sau sẽ gửi lại — trả tiền
 * hai lần. Ghi `submitted` + tx_hash trước khi chờ receipt là cách duy nhất để chết giữa
 * chừng vẫn an toàn.
 */

import type { Database } from '../../../packages/db/src/client.ts';
import type { Micro } from '../../../packages/core/src/money.ts';
import type { SettlementTally } from '../../../packages/core/src/settlement.ts';

export interface SettleablePayout {
  readonly id: string;
  readonly worker_id: string;
  readonly address: string | null;
  readonly amount_micro: string;
  readonly state: string;
}

/**
 * Payout có thể gửi tiền: đã thuộc lô, **có địa chỉ ví**, đang chờ gửi.
 *
 * Điều kiện `w.address IS NOT NULL` nằm ở đây chứ không ở Node: hai danh sách
 * (`gửi được` và `thiếu ví`) phải rời nhau. Nếu list này trả cả payout thiếu ví, báo giá
 * sẽ tính tiền cho một người không nhận được, và số payout trên màn hình sẽ sai.
 */
export async function listPayoutsToSettle(
  db: Database,
  platformId: string,
  batchId: string,
): Promise<SettleablePayout[]> {
  const result = await db.query<SettleablePayout>(
    `SELECT p.id, p.worker_id, w.address, p.amount_micro::text AS amount_micro, p.state
       FROM payouts p
       JOIN workers w ON w.id = p.worker_id AND w.platform_id = p.platform_id
      WHERE p.platform_id = $1 AND p.batch_id = $2
        AND p.state = 'batched'
        AND w.address IS NOT NULL
      ORDER BY p.created_at ASC, p.id ASC`,
    [platformId, batchId],
  );
  return result.rows;
}

/** Payout không có địa chỉ ví — không thể trả, và phải nói ra chứ không im lặng bỏ qua. */
export interface UnpayablePayout {
  readonly id: string;
  readonly worker_id: string;
  readonly amount_micro: string;
}

export async function listPayoutsWithoutAddress(
  db: Database,
  platformId: string,
  batchId: string,
): Promise<UnpayablePayout[]> {
  const result = await db.query<UnpayablePayout>(
    `SELECT p.id, p.worker_id, p.amount_micro::text AS amount_micro
       FROM payouts p
       JOIN workers w ON w.id = p.worker_id AND w.platform_id = p.platform_id
      WHERE p.platform_id = $1 AND p.batch_id = $2
        AND p.state = 'batched'
        AND w.address IS NULL`,
    [platformId, batchId],
  );
  return result.rows;
}

/** Tổng tiền của lô, đọc từ DB — nguồn duy nhất đáng tin về số phải trả. */
export async function sumBatchAmount(db: Database, platformId: string, batchId: string): Promise<Micro> {
  const result = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_micro), 0)::text AS total
       FROM payouts WHERE platform_id = $1 AND batch_id = $2`,
    [platformId, batchId],
  );
  return BigInt(result.rows[0]?.total ?? '0') as Micro;
}

export interface SettleableBatchRow {
  readonly id: string;
  readonly state: string;
  readonly payout_count: number;
  readonly total_micro: string;
  readonly settlement_mode: string;
  readonly created_at: Date;
}

/**
 * Lô còn dở dang ở bước settlement: `planned` (chờ gửi), `submitting` (đã broadcast,
 * chờ receipt), `unknown` (phải đối soát, không được gửi lại — B6).
 *
 * Không trả lô `confirmed`/`failed`/`partial`: chúng không còn việc gì để làm, và trộn
 * chúng vào danh sách khiến người vận hành phải tự lọc bằng mắt trước khi bấm một nút
 * chuyển tiền thật.
 */
export async function listSettleableBatches(
  db: Database,
  platformId: string,
  limit: number,
): Promise<SettleableBatchRow[]> {
  const result = await db.query<SettleableBatchRow>(
    `SELECT id, state, payout_count, total_micro::text AS total_micro, settlement_mode, created_at
       FROM batches
      WHERE platform_id = $1 AND state IN ('planned', 'submitting', 'unknown')
      ORDER BY created_at ASC, id ASC
      LIMIT $2`,
    [platformId, limit],
  );
  return result.rows;
}

export interface QuoteRow {
  readonly quoted_gas: string | null;
  readonly quoted_gas_price_wei: string | null;
  readonly quoted_fee_wei: string | null;
  readonly quoted_at: Date | null;
}

export async function readQuote(db: Database, platformId: string, batchId: string): Promise<QuoteRow | null> {
  const result = await db.query<QuoteRow>(
    `SELECT quoted_gas::text AS quoted_gas,
            quoted_gas_price_wei,
            quoted_fee_wei,
            quoted_at
       FROM batches WHERE id = $1 AND platform_id = $2`,
    [batchId, platformId],
  );
  return result.rows[0] ?? null;
}

/**
 * Lưu báo giá. Bốn cột luôn được ghi cùng nhau vì constraint `batches_quote_complete`
 * không cho phép nửa bộ — một nửa báo giá không dùng được để đối soát sau này.
 */
export async function saveQuote(
  db: Database,
  platformId: string,
  batchId: string,
  quote: { gas: bigint; maxFeePerGasWei: bigint; maxFeeWei: bigint; at: Date },
): Promise<void> {
  await db.query(
    `UPDATE batches
        SET quoted_gas           = $3,
            quoted_gas_price_wei = $4,
            quoted_fee_wei       = $5,
            quoted_at            = $6
      WHERE id = $1 AND platform_id = $2`,
    [
      batchId,
      platformId,
      quote.gas.toString(),
      quote.maxFeePerGasWei.toString(),
      quote.maxFeeWei.toString(),
      quote.at.toISOString(),
    ],
  );
}

/**
 * Đánh dấu lô đang gửi và ghi hash của từng payout **trước khi** chờ kết quả.
 *
 * `ON CONFLICT (tx_hash) DO NOTHING` không dùng được vì `payouts.tx_hash` không UNIQUE
 * (một tx có thể trả nhiều payout nếu sau này có contract gộp). Thay vào đó chỉ UPDATE
 * khi payout còn `batched`: nếu ai đó đã chuyển payout sang trạng thái khác, lần ghi này
 * không được kéo nó ngược lại.
 */
export async function markPayoutsSubmitted(
  db: Database,
  platformId: string,
  batchId: string,
  assignments: readonly { payoutId: string; txHash: string }[],
  submittedAt: Date,
): Promise<number> {
  let updated = 0;
  for (const assignment of assignments) {
    const result = await db.query(
      `UPDATE payouts
          SET state = 'submitted', tx_hash = $3, submitted_at = $4
        WHERE platform_id = $1 AND batch_id = $2 AND id = $5 AND state = 'batched'`,
      [platformId, batchId, assignment.txHash, submittedAt.toISOString(), assignment.payoutId],
    );
    updated += result.rowCount;
  }
  return updated;
}

export async function setBatchSubmitting(
  db: Database,
  platformId: string,
  batchId: string,
  arcNetwork: string,
  submittedAt: Date,
): Promise<number> {
  // `AND state = 'planned'` là guard chống gửi hai lần: hai request submit đồng thời
  // chỉ một cái update được 1 dòng, cái còn lại nhận 0 và tự từ chối.
  const result = await db.query(
    `UPDATE batches
        SET state = 'submitting', settlement_mode = 'onchain',
            arc_network = $3, submitted_at = $4
      WHERE id = $1 AND platform_id = $2 AND state = 'planned'`,
    [batchId, platformId, arcNetwork, submittedAt.toISOString()],
  );
  return result.rowCount;
}

export interface ReceiptUpdate {
  readonly payoutId: string;
  readonly outcome:
    | { status: 'success'; blockNumber: bigint; gasUsed: bigint }
    | { status: 'reverted'; blockNumber: bigint; gasUsed: bigint; reason: string }
    | { status: 'pending' };
}

/**
 * Ghi kết quả đọc receipt.
 *
 * Ba nhánh, và chúng khác nhau về hậu quả:
 * - `success`  → `confirmed` + block + gas. Tiền đã đi.
 * - `reverted` → `failed` + lý do. Tiền chưa đi, gas đã mất. Con người phải quyết định.
 * - `pending`  → **không** ghi `failed`, cũng không ghi `confirmed`. Giữ `submitted`:
 *   transaction có thể còn trong mempool. Ghi `failed` ở đây là tự tạo ra một lần trả lại.
 *
 * Trả về số payout thực sự đổi trạng thái, để route biết có gì mới mà báo cho người dùng.
 */
export async function applyReceipts(
  db: Database,
  platformId: string,
  batchId: string,
  updates: readonly ReceiptUpdate[],
  confirmedAt: Date,
): Promise<number> {
  let changed = 0;
  for (const update of updates) {
    if (update.outcome.status === 'pending') continue;

    if (update.outcome.status === 'success') {
      const result = await db.query(
        `UPDATE payouts
            SET state = 'confirmed', confirmed_at = $3,
                block_number = $4, gas_used = $5
          WHERE platform_id = $1 AND batch_id = $2 AND id = $6 AND state = 'submitted'`,
        [
          platformId,
          batchId,
          confirmedAt.toISOString(),
          update.outcome.blockNumber.toString(),
          update.outcome.gasUsed.toString(),
          update.payoutId,
        ],
      );
      changed += result.rowCount;
      continue;
    }

    const result = await db.query(
      `UPDATE payouts
          SET state = 'failed', failure_reason = $3,
              block_number = $4, gas_used = $5
        WHERE platform_id = $1 AND batch_id = $2 AND id = $6 AND state = 'submitted'`,
      [
        platformId,
        batchId,
        update.outcome.reason,
        update.outcome.blockNumber.toString(),
        update.outcome.gasUsed.toString(),
        update.payoutId,
      ],
    );
    changed += result.rowCount;
  }
  return changed;
}

export interface BatchStateRow {
  readonly state: string;
  readonly confirmed_count: string;
  readonly submitted_count: string;
  readonly failed_count: string;
  readonly unknown_count: string;
  readonly tx_hash: string | null;
  readonly settlement_mode: string;
  readonly total_micro: string;
}

export async function readBatchState(
  db: Database,
  platformId: string,
  batchId: string,
): Promise<BatchStateRow | null> {
  const result = await db.query<BatchStateRow>(
    `SELECT b.state, b.tx_hash, b.settlement_mode, b.total_micro::text AS total_micro,
            COUNT(p.id) FILTER (WHERE p.state = 'confirmed')::text AS confirmed_count,
            COUNT(p.id) FILTER (WHERE p.state = 'submitted')::text AS submitted_count,
            COUNT(p.id) FILTER (WHERE p.state = 'failed')::text    AS failed_count,
            COUNT(p.id) FILTER (WHERE p.state = 'unknown')::text   AS unknown_count
       FROM batches b
       LEFT JOIN payouts p ON p.batch_id = b.id AND p.platform_id = b.platform_id
      WHERE b.id = $1 AND b.platform_id = $2
      GROUP BY b.id`,
    [batchId, platformId],
  );
  return result.rows[0] ?? null;
}

/** Trạng thái lô ghi xuống DB, suy từ số đếm payout. Caller truyền hàm thuần vào. */
export async function setBatchState(
  db: Database,
  platformId: string,
  batchId: string,
  state: string,
  error: string | null,
): Promise<void> {
  await db.query(
    `UPDATE batches SET state = $3, error = $4 WHERE id = $1 AND platform_id = $2`,
    [batchId, platformId, state, error],
  );
}

/** Tổng tiền đã xác nhận thật của một lô — dùng để đối soát payout vs batch. */
export async function sumConfirmed(db: Database, platformId: string, batchId: string): Promise<Micro> {
  const result = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_micro) FILTER (WHERE state = 'confirmed'), 0)::text AS total
       FROM payouts WHERE platform_id = $1 AND batch_id = $2`,
    [platformId, batchId],
  );
  return BigInt(result.rows[0]?.total ?? '0') as Micro;
}

/** Tally cho `settleBatchState`, đọc từ một dòng `readBatchState`. */
export function toTally(row: BatchStateRow): SettlementTally {
  return {
    confirmedCount: Number(row.confirmed_count),
    submittedCount: Number(row.submitted_count),
    failedCount: Number(row.failed_count),
    unknownCount: Number(row.unknown_count),
  };
}
