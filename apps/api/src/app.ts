import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

import type { Database } from '../../../packages/db/src/client.ts';
import { authenticate } from './auth.ts';
import { createBatchRoutes } from './batches.route.ts';
import type { ChainGateway } from './chain.ts';
import type { AppEnv } from './context.ts';
import { AppError, ErrorCode, toAppError } from './errors.ts';
import { GAS_PER_PAYOUT_ESTIMATE } from './gas.ts';
import { createOverviewRoutes } from './overview.route.ts';
import { createPayoutRoutes } from './payouts.route.ts';
import { createReceiptRoutes } from './receipts.route.ts';
import { createSettlementRoutes } from './settlement.route.ts';
import { createWorkerRoutes } from './workers.route.ts';

export interface AppOptions {
  readonly db: Database;
  /** Cho test inject id cố định để assert được. */
  readonly generateRequestId?: () => string;
  /**
   * Thư mục chứa dashboard tĩnh. Bỏ trống thì API chỉ phục vụ JSON — dùng cho
   * test và cho trường hợp chạy API sau reverse proxy đã lo phần giao diện.
   */
  readonly webRoot?: string;
  /**
   * Cổng ra Arc. `null`/bỏ trống = chưa cấu hình ví trả tiền, và API phải nói đúng
   * như vậy thay vì giả định đã gửi được.
   */
  readonly chain?: ChainGateway | null;
}

const defaultRequestId = () => `req_${crypto.randomUUID()}`;

export function createApp(options: AppOptions): Hono<AppEnv> {
  const { db } = options;
  const newRequestId = options.generateRequestId ?? defaultRequestId;
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const requestId = newRequestId();
    c.set('requestId', requestId);
    c.header('x-request-id', requestId);
    await next();
  });

  app.onError((error, c) => {
    const appError = toAppError(error);
    const requestId = c.get('requestId') ?? 'req_unknown';

    // Lỗi 5xx là lỗi của chúng ta, phải thấy trong log. Lỗi 4xx là lỗi của client,
    // log lại chỉ làm nhiễu.
    if (appError.status >= 500) {
      process.stderr.write(
        `${JSON.stringify({
          level: 'error',
          requestId,
          code: appError.code,
          path: c.req.path,
          error: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
    }

    return c.json(appError.toBody(requestId), appError.status as 400);
  });

  app.notFound((c) => {
    const requestId = c.get('requestId') ?? 'req_unknown';
    return c.json(new AppError(ErrorCode.NOT_FOUND, 'Endpoint không tồn tại.').toBody(requestId), 404);
  });

  // Health là public: load balancer và monitoring cần gọi được mà không có key.
  // Không được lộ thông tin nội bộ (phiên bản DB, host, config).
  app.get('/health', async (c) => {
    let dbOk = true;
    try {
      await db.query('SELECT 1');
    } catch {
      dbOk = false;
    }
    return c.json(
      { status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'ok' : 'down', time: new Date().toISOString() },
      dbOk ? 200 : 503,
    );
  });

  // Biên nhận là route public **duy nhất** dưới `/v1`, nên nó phải được đăng ký TRƯỚC
  // middleware xác thực: Hono áp middleware theo thứ tự đăng ký, và đặt sau nghĩa là mọi
  // request của người lao động nhận 401 — đúng thứ route này sinh ra để tránh.
  //
  // Đổi lại, nó chỉ đọc dữ liệu của đúng người sở hữu token, không trả địa chỉ ví, và
  // không có cách nào liệt kê.
  app.route('/v1/receipts', createReceiptRoutes({ db }));

  // Ranh giới xác thực: mọi route /v1/* còn lại đều phải qua đây, kể cả route được mount
  // sau này. Middleware đặt trước khi mount nên không có đường vòng.
  app.use('/v1/*', async (c, next) => {
    const platform = await authenticate(db, c.req.header('authorization') ?? null);
    c.set('platform', platform);
    await next();
  });

  app.get('/v1/me', (c) => {
    const platform = c.get('platform');
    const chain = options.chain ?? null;
    return c.json({
      id: platform.id,
      name: platform.name,
      /** Nhãn demo đến từ DB (`platforms.is_demo`), không suy ra từ tên API key. */
      isDemo: platform.isDemo,
      batchSize: platform.batchSize,
      batchIntervalMs: platform.batchIntervalMs,
      gasBudget: platform.gasBudget.toString(),
      // Số payout tối đa mỗi lô với ngân sách gas hiện tại — client cần biết để
      // không phải đoán tại sao 400 payout thành 2 lô.
      maxPayoutsPerBatch: Number(platform.gasBudget / GAS_PER_PAYOUT_ESTIMATE),
      // Một nút "Gửi" sáng lên khi không có khoá là lỗi tệ nhất của màn hình này.
      chain: chain
        ? {
            configured: true,
            network: chain.network,
            chainId: chain.chainId,
            relayerAddress: chain.relayerAddress,
            usdcAddress: chain.usdcAddress,
          }
        : { configured: false },
    });
  });

  app.route('/v1/payouts', createPayoutRoutes({ db }));
  app.route('/v1/batches', createBatchRoutes({ db }));
  app.route('/v1/workers', createWorkerRoutes({ db }));
  app.route('/v1/overview', createOverviewRoutes({ db }));
  app.route('/v1/settlement', createSettlementRoutes({ db, chain: options.chain ?? null }));

  // Dashboard tĩnh phục vụ cùng origin với API: không CORS, không cookie chéo
  // site, và API key trong `localStorage` chỉ thuộc một origin.
  //
  // Đặt SAU route API là có chủ đích — Hono so khớp theo thứ tự đăng ký, nên một
  // request `/v1/payouts` không phải `stat()` một file chắc chắn không tồn tại.
  if (options.webRoot) {
    app.use('/*', serveStatic({ root: options.webRoot }));
  }

  return app;
}
