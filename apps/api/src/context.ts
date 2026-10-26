/**
 * Kiểu "biến" của Hono — thứ middleware đặt vào context để route đọc lại.
 *
 * Tách khỏi `app.ts` vì route module cần nó, mà `app.ts` lại cần route module.
 * Một file chỉ chứa type thì không tạo vòng import.
 */

import type { Platform } from './auth.ts';

export type AppEnv = {
  Variables: {
    /** Nền tảng đã xác thực. Chỉ có sau middleware `/v1/*`. */
    platform: Platform;
    requestId: string;
  };
};
