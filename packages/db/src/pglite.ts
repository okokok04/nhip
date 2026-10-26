import { mkdir } from 'node:fs/promises';

import { PGlite } from '@electric-sql/pglite';

import { type Database, DatabaseError, type QueryResult } from './client.ts';

/**
 * PGlite là Postgres thật (biên dịch sang WASM) chạy trong process.
 * Dùng cho dev và test. Không dùng cho production: một process, không có
 * connection pool, không chịu được restart độc lập.
 */
export class PgliteDatabase implements Database {
  readonly #db: PGlite;
  /** Hàng đợi transaction — xem giải thích trong `transaction()`. */
  #txQueue: Promise<void> = Promise.resolve();

  private constructor(db: PGlite) {
    this.#db = db;
  }

  static async create(options: { dataDir?: string } = {}): Promise<PgliteDatabase> {
    // `memory://` = database trong RAM, mất khi process kết thúc. Đúng cho test.
    if (!options.dataDir || options.dataDir === 'memory://') {
      const db = new PGlite();
      await db.waitReady;
      return new PgliteDatabase(db);
    }

    // PGlite tự `mkdir` đúng thư mục lá, không tạo thư mục cha. Không tạo trước thì
    // `./.data/nhip` ném ENOENT trên máy sạch — và thông báo lỗi nói về `mkdir`,
    // không nói rằng chỉ cần tạo thư mục.
    await mkdir(options.dataDir, { recursive: true });
    const db = new PGlite(options.dataDir);
    await db.waitReady;
    return new PgliteDatabase(db);
  }

  async query<Row = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    try {
      const result = await this.#db.query<Row>(sql, params as unknown[]);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    } catch (error) {
      throw wrapError(error);
    }
  }

  async exec(sql: string): Promise<void> {
    try {
      await this.#db.exec(sql);
    } catch (error) {
      throw wrapError(error);
    }
  }

  async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
    // PGlite có đúng MỘT connection. Hai `BEGIN` chồng nhau trên cùng connection sẽ
    // làm transaction trong thấy dữ liệu chưa commit của transaction ngoài, hoặc
    // COMMIT của cái trong đóng luôn cả cái ngoài.
    //
    // Nên: xếp hàng. Đây không phải giới hạn của Postgres thật — adapter `pg` sau
    // này sẽ có pool và bỏ được hẳn cơ chế này. Nhưng che nó đi bằng cách cho phép
    // chạy song song sẽ tạo ra test xanh một cách tình cờ.
    const previous = this.#txQueue;
    let release!: () => void;
    this.#txQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      await this.#db.exec('BEGIN');
      try {
        const result = await fn(this);
        await this.#db.exec('COMMIT');
        return result;
      } catch (error) {
        await this.#db.exec('ROLLBACK');
        throw error;
      }
    } finally {
      release();
    }
  }

  async close(): Promise<void> {
    await this.#db.close();
  }
}

function wrapError(error: unknown): DatabaseError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return new DatabaseError(message, code);
}
