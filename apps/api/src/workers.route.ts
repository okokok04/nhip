/**
 * `/v1/workers` — danh bạ người nhận tiền.
 *
 * Endpoint này là nơi duy nhất nền tảng khai báo "người có mã X nhận tiền ở ví Y".
 * Mọi sai sót ở đây đều là sai sót về **ai được trả tiền**, nên nó từ chối nhiều
 * hơn mức tối thiểu cần thiết:
 *
 * - `externalId` bắt buộc: không có nó thì không có cách nào nhận ra cùng một người
 *   qua hai lần gọi, và mỗi lần đổi ví sẽ sinh một người mới.
 * - `address` không bắt buộc **khi tạo** (người lao động có thể chưa có ví), nhưng
 *   nếu có thì phải hợp lệ. Không lưu địa chỉ rác để "cập nhật sau".
 */

import { Hono } from 'hono';

import type { Address } from '../../../packages/core/src/address.ts';
import type { Database } from '../../../packages/db/src/client.ts';
import { ID_PREFIX, newId } from '../../../packages/core/src/ids.ts';
import type { AppEnv } from './context.ts';
import { AppError, ErrorCode } from './errors.ts';
import {
  findWorkerByExternalId,
  listWorkers,
  upsertWorker,
  type WorkerRow,
} from './workers.repo.ts';
import {
  newCollector,
  readJsonBody,
  requireObject,
  takeAddress,
  takeLimit,
  takeString,
} from './validate.ts';
import type { RouteOptions } from './payouts.route.ts';

export interface WorkerBody {
  readonly id: string;
  readonly externalId: string;
  readonly address: string | null;
  readonly displayName: string | null;
  /**
   * Token mở biên nhận công khai. Chỉ route **đã xác thực** mới trả về: đây là bí mật
   * của người lao động, và nền tảng cần nó để gửi link. Không có trường này thì platform
   * không bao giờ gửi được link cho người nhận, và tính năng biên nhận thành demo-only.
   */
  readonly claimToken: string | null;
  readonly created_at: string;
}

export function toWorkerBody(row: WorkerRow): WorkerBody {
  return {
    id: row.id,
    externalId: row.external_id,
    address: row.address,
    displayName: row.display_name,
    claimToken: row.claim_token,
    created_at: row.created_at.toISOString(),
  };
}

export function createWorkerRoutes(options: RouteOptions): Hono<AppEnv> {
  const { db } = options;
  const routes = new Hono<AppEnv>();

  /**
   * Upsert theo `externalId`.
   *
   * Không nhận `id` từ client: id là của chúng ta, và cho client đặt id nghĩa là
   * cho họ ghi đè bản ghi của người khác bằng cách đoán id.
   */
  routes.post('/', async (c) => {
    const platform = c.get('platform');

    const body = await readJsonBody(c.req);
    const collector = newCollector();
    const source = requireObject(body, collector);
    if (!source) {
      collector.throwIfAny();
      throw new AppError(ErrorCode.INTERNAL, 'Body không phải object nhưng không có lỗi — lỗi logic.');
    }

    const externalId = takeString(source, 'externalId', collector, { min: 1, max: 200 });
    const address = takeAddress(source, 'address', collector, { required: false });
    const displayName = takeString(source, 'displayName', collector, { required: false, max: 200 });
    collector.throwIfAny();

    if (externalId === null) {
      throw new AppError(ErrorCode.INTERNAL, 'Thiếu externalId sau khi validate — lỗi logic.');
    }

    const { worker, created } = await upsertWorker(db, {
      id: newId(ID_PREFIX.WORKER),
      platformId: platform.id,
      externalId,
      address: address as Address | null,
      displayName: displayName ?? undefined,
    });

    return c.json({ ...toWorkerBody(worker), created }, created ? 201 : 200);
  });

  routes.get('/', async (c) => {
    const platform = c.get('platform');
    const collector = newCollector();
    const limit = takeLimit(c.req.query('limit'), collector, { fallback: 100, max: 500 });
    collector.throwIfAny();

    const workers = await listWorkers(db, platform.id, limit ?? 100);
    return c.json({ workers: workers.map(toWorkerBody) });
  });

  routes.get('/:id', async (c) => {
    const platform = c.get('platform');
    const externalId = c.req.query('externalId');

    if (externalId) {
      const worker = await findWorkerByExternalId(db, platform.id, externalId);
      if (!worker) throw new AppError(ErrorCode.WORKER_NOT_FOUND, 'Không tìm thấy người lao động.');
      return c.json(toWorkerBody(worker));
    }

    const worker = await db.query<WorkerRow>(
      `SELECT id, external_id, address, display_name, claim_token, created_at
         FROM workers WHERE id = $1 AND platform_id = $2`,
      [c.req.param('id'), platform.id],
    );
    const row = worker.rows[0];
    if (!row) throw new AppError(ErrorCode.WORKER_NOT_FOUND, 'Không tìm thấy người lao động.');
    return c.json(toWorkerBody(row));
  });

  return routes;
}
