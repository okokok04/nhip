/**
 * Một interface duy nhất cho Postgres, hai implementation.
 *
 * - Dev / test: PGlite — Postgres thật biên dịch sang WASM, chạy in-process.
 *   Không cần Docker, không cần service, khởi động ~200ms.
 * - Production: `pg` — cùng SQL, cùng hành vi.
 *
 * Vì sao không dùng ORM: schema này có ràng buộc là **hợp đồng** (unique index,
 * CHECK constraint). ORM thường giấu chúng sau một lớp abstraction, và khi cần
 * chứng minh "DB từ chối bản ghi trùng" thì phải chứng minh qua ORM — không còn
 * là chứng minh trên DB nữa.
 */

export interface QueryResult<Row> {
  readonly rows: Row[];
  readonly rowCount: number;
}

export interface Database {
  query<Row = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<Row>>;
  /** Chạy SQL nhiều câu, không tham số. Chỉ dùng cho DDL (file migration). */
  exec(sql: string): Promise<void>;
  /** Chạy nhiều câu trong một transaction. Throw = rollback toàn bộ. */
  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Mã lỗi Postgres mà code được phép bắt. Đừng so sánh message — nó phụ thuộc locale. */
export const PgErrorCode = {
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
} as const;

export type PgErrorCode = (typeof PgErrorCode)[keyof typeof PgErrorCode];

export class DatabaseError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
  }
}

export function isPgError(error: unknown, code: PgErrorCode): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
