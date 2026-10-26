/**
 * Ghi payout vào hàng đợi — trái tim của idempotency.
 *
 * Ba điều được đảm bảo bởi **một** câu SQL, không phải bởi logic ở tầng application:
 *
 * 1. Cùng `(platformId, idempotencyKey)` → chỉ một dòng tồn tại.
 * 2. Request thứ hai nhận lại **đúng bản ghi cũ** (cùng id, cùng số tiền), không phải lỗi.
 * 3. Hai request song song: một thắng, một đọc lại bản ghi của người thắng.
 *
 * Vì sao `ON CONFLICT DO UPDATE` chứ không `DO NOTHING`: `DO NOTHING` không trả về
 * dòng nào, buộc phải query lần hai — và giữa hai query đó là một cửa sổ race.
 * Dùng `DO UPDATE ... RETURNING` trả về dòng trong cùng một round trip.
 * `SET idempotency_key = EXCLUDED.idempotency_key` là no-op có chủ ý: ta cần
 * RETURNING, không cần thay đổi dữ liệu.
 */

import type { Database } from '../../../packages/db/src/client.ts';
import type { Micro } from '../../../packages/core/src/money.ts';

export interface PayoutInput {
  readonly id: string;
  readonly platformId: string;
  readonly workerId: string;
  readonly amountMicro: Micro;
  readonly idempotencyKey: string;
  readonly reference?: string | undefined;
}

export interface PayoutRow {
  readonly id: string;
  readonly worker_id: string;
  /** Chuỗi số nguyên, KHÔNG phải number. Xem ghi chú ở `SELECT_COLUMNS`. */
  readonly amount_micro: string;
  readonly idempotency_key: string;
  readonly reference: string | null;
  readonly state: string;
  readonly created_at: Date;
}

export interface UpsertResult {
  readonly payout: PayoutRow;
  /** true = bản ghi đã tồn tại từ trước, request này là retry. */
  readonly duplicate: boolean;
}

/**
 * Cursor hỏng là **lỗi của client**, không phải lỗi hệ thống.
 *
 * Có lớp riêng thay vì `Error('cursor không hợp lệ')` để route ánh xạ được sang
 * 400 mà không phải so khớp chuỗi message — so khớp message là thứ sẽ vỡ lặng lẽ
 * vào ngày ai đó sửa dấu câu.
 */
export class CursorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CursorError';
  }
}

/**
 * `amount_micro::text` là **bắt buộc**, không phải để cho đẹp.
 *
 * Driver (PGlite, và `pg` cũng vậy) trả BIGINT về dưới dạng `number` khi giá trị
 * nằm trong safe-integer, và `bigint` khi vượt. Kiểu khai báo `string` khi đó là
 * lời nói dối mà typecheck không bắt được — cho tới lúc một con số lớn xuất hiện
 * và mọi so sánh `===` trên số tiền bắt đầu sai. Ép sang text ở SQL làm kiểu trên
 * đường dây luôn đúng một kiểu duy nhất.
 */
const SELECT_COLUMNS =
  'id, worker_id, amount_micro::text AS amount_micro, idempotency_key, reference, state, created_at';

export async function upsertPayout(db: Database, input: PayoutInput): Promise<UpsertResult> {
  const result = await db.query<PayoutRow & { inserted: boolean }>(
    `INSERT INTO payouts (id, platform_id, worker_id, amount_micro, idempotency_key, reference)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (platform_id, idempotency_key) DO UPDATE
       SET idempotency_key = EXCLUDED.idempotency_key
     RETURNING ${SELECT_COLUMNS}, (xmax = 0) AS inserted`,
    [
      input.id,
      input.platformId,
      input.workerId,
      input.amountMicro.toString(),
      input.idempotencyKey,
      input.reference ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    // Không thể xảy ra nếu DB sống: INSERT ... RETURNING luôn trả một dòng.
    // Nếu tới đây thì là bug hạ tầng — phải nổ to, không được im lặng.
    throw new Error('upsertPayout: INSERT ... RETURNING không trả dòng nào');
  }

  const { inserted, ...payout } = row;
  return { payout, duplicate: !inserted };
}

export async function findPayoutById(db: Database, platformId: string, id: string): Promise<PayoutRow | null> {
  const result = await db.query<PayoutRow>(
    `SELECT ${SELECT_COLUMNS} FROM payouts WHERE id = $1 AND platform_id = $2`,
    [id, platformId],
  );
  return result.rows[0] ?? null;
}

export interface ListPayoutsOptions {
  readonly workerId?: string | undefined;
  readonly limit: number;
  readonly cursor?: string | undefined;
}

/**
 * Phân trang bằng cursor trên `(created_at, id)` — không dùng OFFSET.
 *
 * OFFSET đếm lại từ đầu mỗi lần, nên khi có payout mới được thêm vào, trang 2
 * sẽ lặp lại một dòng của trang 1. Với sổ tiền, lặp dòng là lỗi kế toán.
 */
export async function listPayouts(
  db: Database,
  platformId: string,
  options: ListPayoutsOptions,
): Promise<{ rows: PayoutRow[]; nextCursor: string | null }> {
  const params: unknown[] = [platformId];
  const conditions = ['platform_id = $1'];

  if (options.workerId) {
    params.push(options.workerId);
    conditions.push(`worker_id = $${params.length}`);
  }

  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (!decoded) {
      throw new CursorError('cursor không hợp lệ. Dùng đúng giá trị `nextCursor` của trang trước.');
    }
    params.push(decoded.createdAt, decoded.id);
    conditions.push(`(created_at, id) < ($${params.length - 1}, $${params.length})`);
  }

  params.push(options.limit + 1);
  const result = await db.query<PayoutRow>(
    `SELECT ${SELECT_COLUMNS} FROM payouts
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params,
  );

  const hasMore = result.rows.length > options.limit;
  const rows = hasMore ? result.rows.slice(0, options.limit) : result.rows;
  const last = rows.at(-1);
  const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;

  return { rows, nextCursor };
}

function encodeCursor(createdAt: Date | string, id: string): string {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : createdAt;
  return Buffer.from(`${iso}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = raw.lastIndexOf('|');
    if (separator <= 0) return null;
    const createdAt = raw.slice(0, separator);
    const id = raw.slice(separator + 1);
    if (!createdAt || !id) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
