/**
 * `/v1/overview` — số liệu tổng hợp cho dashboard.
 *
 * Một endpoint thay vì để client gọi 4 endpoint rồi tự cộng: cộng tiền ở client
 * nghĩa là mỗi lần dashboard mở lại có thêm một chỗ có thể sai số, và client dùng
 * JavaScript `number` thì không cộng được bigint.
 */

import { Hono } from 'hono';

import type { Database } from '../../../packages/db/src/client.ts';
import type { AppEnv } from './context.ts';
import { loadOverview, loadRecentBatches } from './overview.repo.ts';
import type { RouteOptions } from './payouts.route.ts';
import { newCollector, takeLimit } from './validate.ts';

export function createOverviewRoutes(options: RouteOptions): Hono<AppEnv> {
  const { db } = options;
  const routes = new Hono<AppEnv>();

  routes.get('/', async (c) => {
    const platform = c.get('platform');
    const collector = newCollector();
    const limit = takeLimit(c.req.query('recentBatches'), collector, {
      field: 'recentBatches',
      fallback: 8,
      max: 50,
    });
    collector.throwIfAny();

    const [overview, batches] = await Promise.all([
      loadOverview(db, platform.id),
      loadRecentBatches(db, platform.id, limit ?? 8),
    ]);

    return c.json({
      ...overview,
      recentBatches: batches.map((batch) => ({
        id: batch.id,
        state: batch.state,
        payoutCount: batch.payout_count,
        total_micro: batch.total_micro,
        txHash: batch.tx_hash,
        settlementMode: batch.settlement_mode,
        created_at: batch.created_at.toISOString(),
      })),
    });
  });

  return routes;
}
