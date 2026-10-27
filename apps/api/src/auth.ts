import { createHash, timingSafeEqual } from 'node:crypto';

import type { Database } from '../../../packages/db/src/client.ts';
import { AppError, ErrorCode } from './errors.ts';

export interface Platform {
  readonly id: string;
  readonly name: string;
  readonly batchSize: number;
  readonly batchIntervalMs: number;
  readonly gasBudget: bigint;
  /**
   * `true` = nền tảng demo: dữ liệu mẫu, không phải khách thật.
   *
   * Đọc từ DB chứ không suy ra từ tên API key. Cách cũ (`key.includes('seed')`) có hai
   * lỗi: một khách thật đặt key chứa "seed" bị gắn nhãn demo, và một bản sao của môi
   * trường demo không có nhãn nào — cả hai đều khiến màn hình nói sai sự thật.
   */
  readonly isDemo: boolean;
}

interface PlatformRow {
  id: string;
  name: string;
  batch_size: number;
  batch_interval_ms: number;
  gas_budget: string;
  is_demo: boolean;
}

/**
 * API key **không bao giờ** lưu dạng thô. Chỉ lưu sha256.
 *
 * Vì sao sha256 chứ không bcrypt/argon2: API key là chuỗi 32+ byte ngẫu nhiên,
 * không phải mật khẩu người chọn. Không có không gian từ điển để brute force,
 * nên hash chậm chỉ làm mỗi request chậm hơn mà không thêm bảo mật.
 * (Nếu sau này cho phép người dùng tự đặt key, phải đổi sang argon2.)
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** So sánh constant-time để không lộ độ dài/thời điểm. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

export function extractApiKey(header: string | null | undefined): string {
  if (!header) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, 'Thiếu header Authorization. Dùng: Bearer <api_key>.');
  }
  const match = BEARER_PATTERN.exec(header.trim());
  if (!match?.[1]) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, 'Header Authorization phải có dạng: Bearer <api_key>.');
  }
  return match[1].trim();
}

export async function authenticate(db: Database, authorizationHeader: string | null): Promise<Platform> {
  const key = extractApiKey(authorizationHeader);
  if (key.length < 16) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, 'API key không hợp lệ.');
  }

  const result = await db.query<PlatformRow>(
    `SELECT id, name, batch_size, batch_interval_ms, gas_budget, is_demo
       FROM platforms WHERE api_key_hash = $1`,
    [hashApiKey(key)],
  );

  const row = result.rows[0];
  if (!row) {
    // Thông báo giống hệt trường hợp sai định dạng: không xác nhận key có tồn tại hay không.
    throw new AppError(ErrorCode.UNAUTHENTICATED, 'API key không hợp lệ.');
  }

  return {
    id: row.id,
    name: row.name,
    batchSize: row.batch_size,
    batchIntervalMs: row.batch_interval_ms,
    gasBudget: BigInt(row.gas_budget),
    isDemo: row.is_demo,
  };
}
