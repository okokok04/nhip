/**
 * Số liệu tổng hợp cho dashboard.
 *
 * Tính bằng SQL chứ không tải hết payout về Node rồi cộng: một nền tảng 5.000
 * payout/ngày có 150.000 dòng sau một tháng, và dashboard không được phép chậm
 * dần theo tuổi của dữ liệu.
 *
 * Mọi cột tiền đều `::text` — cùng lý do như `payouts.repo.ts`: driver trả BIGINT
 * thành `number` khi vừa safe-integer, và cộng dồn số tiền bằng `number` là bug.
 */

import type { Database } from '../../../packages/db/src/client.ts';

export interface OverviewRow {
  readonly queued_count: string;
  readonly queued_micro: string;
  readonly batched_count: string;
  readonly batched_micro: string;
  readonly confirmed_count: string;
  readonly confirmed_micro: string;
  readonly failed_count: string;
  readonly failed_micro: string;
  readonly worker_count: string;
  readonly batch_count: string;
}

export interface Overview {
  readonly queued: { count: number; totalMicro: string };
  readonly batched: { count: number; totalMicro: string };
  readonly confirmed: { count: number; totalMicro: string };
  readonly failed: { count: number; totalMicro: string };
  readonly workers: number;
  readonly batches: number;
  /** Số payout đã trả thành công trên tổng số đã xử lý — mẫu số là confirmed + failed. */
  readonly successRate: number | null;
}

const toNumber = (value: string | undefined): number => Number(value ?? '0');

export async function loadOverview(db: Database, platformId: string): Promise<Overview> {
  const result = await db.query<OverviewRow>(
    `SELECT
       COALESCE(SUM(amount_micro) FILTER (WHERE state = 'queued'), 0)::text    AS queued_micro,
       COUNT(*) FILTER (WHERE state = 'queued')::text                          AS queued_count,
       COALESCE(SUM(amount_micro) FILTER (WHERE state = 'batched'), 0)::text   AS batched_micro,
       COUNT(*) FILTER (WHERE state = 'batched')::text                         AS batched_count,
       COALESCE(SUM(amount_micro) FILTER (WHERE state = 'confirmed'), 0)::text AS confirmed_micro,
       COUNT(*) FILTER (WHERE state = 'confirmed')::text                       AS confirmed_count,
       COALESCE(SUM(amount_micro) FILTER (WHERE state = 'failed'), 0)::text    AS failed_micro,
       COUNT(*) FILTER (WHERE state = 'failed')::text                          AS failed_count,
       (SELECT COUNT(*)::text FROM workers WHERE platform_id = $1)             AS worker_count,
       (SELECT COUNT(*)::text FROM batches WHERE platform_id = $1)             AS batch_count
     FROM payouts WHERE platform_id = $1`,
    [platformId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('loadOverview: aggregate query không trả dòng nào — không thể xảy ra với COUNT(*)');
  }

  const confirmed = toNumber(row.confirmed_count);
  const failed = toNumber(row.failed_count);
  const settled = confirmed + failed;

  return {
    queued: { count: toNumber(row.queued_count), totalMicro: row.queued_micro },
    batched: { count: toNumber(row.batched_count), totalMicro: row.batched_micro },
    confirmed: { count: confirmed, totalMicro: row.confirmed_micro },
    failed: { count: failed, totalMicro: row.failed_micro },
    workers: toNumber(row.worker_count),
    batches: toNumber(row.batch_count),
    successRate: settled === 0 ? null : confirmed / settled,
  };
}

export interface RecentBatchRow {
  readonly id: string;
  readonly state: string;
  readonly payout_count: number;
  readonly total_micro: string;
  readonly created_at: Date;
  readonly tx_hash: string | null;
}

export async function loadRecentBatches(
  db: Database,
  platformId: string,
  limit: number,
): Promise<RecentBatchRow[]> {
  const result = await db.query<RecentBatchRow>(
    `SELECT id, state, payout_count, total_micro::text AS total_micro, created_at, tx_hash
       FROM batches
      WHERE platform_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [platformId, limit],
  );
  return result.rows;
}
