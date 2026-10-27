/**
 * Người lao động — danh bạ nhận tiền của một nền tảng.
 *
 * Điều quan trọng nhất ở file này: **upsert theo `(platform_id, external_id)`,
 * không theo `address`.**
 *
 * Vì sao: `external_id` là id của người trong hệ thống của nền tảng (mã tài xế,
 * mã shipper). Địa chỉ ví có thể đổi — người lao động mất điện thoại, đổi ví,
 * hoặc chuyển từ ví custodial sang ví tự quản. Nếu key là địa chỉ, mỗi lần đổi ví
 * sẽ sinh một "người mới", và lịch sử trả lương bị chẻ đôi. Ngược lại nếu key là
 * `external_id` thì đổi ví chỉ là UPDATE một cột.
 *
 * Ràng buộc `UNIQUE (platform_id, external_id)` ở DB đảm bảo điều này; file này
 * không tự kiểm tra trùng trước khi insert, vì kiểm-tra-rồi-insert có cửa sổ race.
 */

import { randomBytes } from 'node:crypto';

import type { Database } from '../../../packages/db/src/client.ts';
import type { Address } from '../../../packages/core/src/address.ts';

export interface WorkerInput {
  readonly id: string;
  readonly platformId: string;
  readonly externalId: string;
  readonly address?: Address | null | undefined;
  readonly displayName?: string | undefined;
}

export interface WorkerRow {
  readonly id: string;
  readonly external_id: string;
  readonly address: string | null;
  readonly display_name: string | null;
  /**
   * Bí mật mở biên nhận công khai (`?claim=<token>`). `null` với bản ghi cũ chưa
   * từng được upsert lại sau khi tính năng này ra đời.
   */
  readonly claim_token: string | null;
  readonly created_at: Date;
}

export interface UpsertWorkerResult {
  readonly worker: WorkerRow;
  /** true = chưa từng tồn tại trước request này. */
  readonly created: boolean;
}

const SELECT_COLUMNS = 'id, external_id, address, display_name, claim_token, created_at';

/**
 * Token mở biên nhận: 24 byte ngẫu nhiên → 48 ký tự hex.
 *
 * Vì sao 24 byte: token là **toàn bộ** lớp bảo vệ của một trang public chứa thu nhập
 * của một người. 6 ký tự thì dò được; 24 byte (192 bit) thì không. Định dạng hex khớp
 * regex mà `/v1/receipts/:claimToken` chấp nhận.
 *
 * Vì sao sinh ở đây chứ không ở SQL: `random()` của Postgres không phải nguồn ngẫu
 * nhiên mật mã, và `pgcrypto` không có trên mọi nền tảng (PGlite).
 */
export function newClaimToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * Upsert theo `(platform_id, external_id)`.
 *
 * `created` được xác định bằng `xmax = 0`: trong Postgres, một dòng vừa được
 * INSERT trong câu lệnh hiện tại có `xmax = 0`; dòng bị UPDATE bởi `ON CONFLICT`
 * có `xmax != 0`. Đây là cách duy nhất phân biệt insert với update **trong cùng
 * một round trip** — nếu query lại lần hai thì đã có khoảng race.
 *
 * Chỉ ghi đè `address`/`display_name` khi client có gửi: nền tảng đôi khi chỉ
 * muốn cập nhật tên mà không có địa chỉ mới, và `COALESCE` giữ dữ liệu cũ thay
 * vì xoá trắng.
 */
export async function upsertWorker(db: Database, input: WorkerInput): Promise<UpsertWorkerResult> {
  const result = await db.query<WorkerRow & { inserted: boolean }>(
    `INSERT INTO workers (id, platform_id, external_id, address, display_name, claim_token)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (platform_id, external_id) DO UPDATE
       SET address      = COALESCE(EXCLUDED.address, workers.address),
           display_name = COALESCE(EXCLUDED.display_name, workers.display_name),
           claim_token  = COALESCE(workers.claim_token, EXCLUDED.claim_token)
     RETURNING ${SELECT_COLUMNS}, (xmax = 0) AS inserted`,
    [
      input.id,
      input.platformId,
      input.externalId,
      input.address ?? null,
      input.displayName ?? null,
      newClaimToken(),
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('upsertWorker: INSERT ... RETURNING không trả dòng nào');
  }

  const { inserted, ...worker } = row;
  return { worker, created: inserted };
}

export async function findWorkerById(db: Database, platformId: string, id: string): Promise<WorkerRow | null> {
  const result = await db.query<WorkerRow>(
    `SELECT ${SELECT_COLUMNS} FROM workers WHERE id = $1 AND platform_id = $2`,
    [id, platformId],
  );
  return result.rows[0] ?? null;
}

export async function findWorkerByExternalId(
  db: Database,
  platformId: string,
  externalId: string,
): Promise<WorkerRow | null> {
  const result = await db.query<WorkerRow>(
    `SELECT ${SELECT_COLUMNS} FROM workers WHERE platform_id = $1 AND external_id = $2`,
    [platformId, externalId],
  );
  return result.rows[0] ?? null;
}

/**
 * Danh sách người lao động, mới nhất trước.
 *
 * Không phân trang bằng cursor: một nền tảng gig có vài nghìn người, và màn hình
 * chọn người để trả lương cần tìm được người vừa tạo. `limit` đủ cho việc đó.
 * Khi nào có nền tảng > 10.000 người thì thêm cursor — không thêm trước.
 */
export async function listWorkers(
  db: Database,
  platformId: string,
  limit: number,
): Promise<WorkerRow[]> {
  const result = await db.query<WorkerRow>(
    `SELECT ${SELECT_COLUMNS} FROM workers
      WHERE platform_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [platformId, limit],
  );
  return result.rows;
}
