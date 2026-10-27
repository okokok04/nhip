/**
 * Adapter Postgres thật (`pg`), cho production.
 *
 * Vì sao cần: PGlite là Postgres biên dịch sang WASM chạy trong process. Nó đúng về
 * SQL và ràng buộc, nhưng sai về vận hành — một process, dữ liệu nằm trên đĩa cục bộ
 * của function serverless, và trên Vercel mỗi lần cold start là một database mới.
 * Một sản phẩm giữ sổ tiền không thể để sổ reset mỗi lần deploy.
 *
 * File này cố tình **không** thêm hành vi nào ngoài interface `Database`. Mọi logic
 * (idempotency, khoá hàng đợi, ràng buộc trạng thái) nằm ở SQL và ở tầng route, nên
 * dev chạy PGlite và production chạy `pg` cho cùng kết quả — hoặc test sẽ đỏ.
 */

import { Pool, type PoolClient } from 'pg';

import { type Database, DatabaseError, type QueryResult } from './client.ts';

export class PgDatabase implements Database {
  readonly #pool: Pool;

  private constructor(pool: Pool) {
    this.#pool = pool;
  }

  /**
   * `connectionString` lấy từ `DATABASE_URL`. Không đặt giá trị mặc định: một chuỗi
   * kết nối sai phải làm app không khởi động được, chứ không được lặng lẽ rơi về
   * database trong RAM và nhận payout của khách vào đó.
   */
  static create(options: { connectionString: string; max?: number }): PgDatabase {
    const pool = new Pool({
      connectionString: options.connectionString,
      max: options.max ?? 10,
      // Serverless + pooler (Neon/Supabase) không chịu được SSL không xác thực chứng
      // chỉ ở một số cấu hình; đây là mức mà cả hai bên chấp nhận.
      ssl: options.connectionString.includes('sslmode=disable') ? undefined : { rejectUnauthorized: false },
      // Mặc định của `pg` là treo vô hạn khi mạng im. Với API thanh toán, treo lâu hơn
      // một request timeout chỉ làm client retry và nhân đôi tải.
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    });
    return new PgDatabase(pool);
  }

  async query<Row = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    try {
      const result = await this.#pool.query(sql, params as unknown[]);
      return { rows: result.rows as Row[], rowCount: result.rowCount ?? result.rows.length };
    } catch (error) {
      throw wrapError(error);
    }
  }

  /** DDL nhiều câu, không tham số. Đây là đường duy nhất chạy được file migration. */
  async exec(sql: string): Promise<void> {
    const client = await this.#pool.connect();
    try {
      await client.query(sql);
    } catch (error) {
      throw wrapError(error);
    } finally {
      client.release();
    }
  }

  /**
   * Transaction trên **một** connection riêng.
   *
   * Không dùng `pool.query('BEGIN')`: mỗi `pool.query` có thể lấy một connection khác
   * nhau, nên `BEGIN` và `COMMIT` sẽ rơi vào hai phiên khác nhau — transaction không
   * bao giờ đóng, và connection bị giữ lock cho tới khi timeout.
   */
  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      try {
        const result = await fn(new ScopedDatabase(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        // ROLLBACK có thể hỏng nếu connection đã chết; lỗi gốc mới là thứ cần thấy.
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}

/**
 * Handle bên trong transaction.
 *
 * `transaction()` lồng nhau **không** mở transaction thứ hai: nó chỉ chạy tiếp trên
 * cùng connection. Postgres không có transaction lồng thật; giả lập bằng SAVEPOINT là
 * thêm phức tạp mà chưa có chỗ nào cần.
 */
class ScopedDatabase implements Database {
  readonly #client: PoolClient;

  constructor(client: PoolClient) {
    this.#client = client;
  }

  async query<Row = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    try {
      const result = await this.#client.query(sql, params as unknown[]);
      return { rows: result.rows as Row[], rowCount: result.rowCount ?? result.rows.length };
    } catch (error) {
      throw wrapError(error);
    }
  }

  async exec(sql: string): Promise<void> {
    try {
      await this.#client.query(sql);
    } catch (error) {
      throw wrapError(error);
    }
  }

  transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    return fn(this);
  }

  async close(): Promise<void> {
    // Connection do transaction sở hữu; đóng nó ở đây sẽ làm COMMIT của caller hỏng.
  }
}

/**
 * Giữ `code` của Postgres (`23505`, `23514`, …) — tầng trên bắt lỗi bằng mã, không
 * bằng chuỗi message, vì message phụ thuộc locale của server.
 */
function wrapError(error: unknown): DatabaseError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return new DatabaseError(message, code);
}
