/**
 * Lỗi có cấu trúc. Mọi lỗi trả ra HTTP đều đi qua đây.
 *
 * Vì sao không throw Error thường: người dùng API cần biết **làm gì tiếp**.
 * `code` để máy xử lý, `message` để người đọc, `details` để debug.
 * "Something went wrong" là lỗi của người viết API, không phải của người dùng.
 */

export const ErrorCode = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DUPLICATE_IDEMPOTENCY: 'DUPLICATE_IDEMPOTENCY',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  WORKER_NOT_FOUND: 'WORKER_NOT_FOUND',
  INVALID_ADDRESS: 'INVALID_ADDRESS',
  BATCH_PARTIAL: 'BATCH_PARTIAL',
  CHAIN_UNAVAILABLE: 'CHAIN_UNAVAILABLE',
  BATCH_UNKNOWN: 'BATCH_UNKNOWN',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  // 400 chứ không 422: spec `docs/specs/nhip-mvp.md` chốt 400 cho input sai, và
  // người tích hợp đã viết code bắt 400. Đổi thành 422 là breaking change không có lý do.
  VALIDATION_FAILED: 400,
  DUPLICATE_IDEMPOTENCY: 409,
  INSUFFICIENT_BALANCE: 409,
  WORKER_NOT_FOUND: 404,
  INVALID_ADDRESS: 400,
  BATCH_PARTIAL: 207,
  CHAIN_UNAVAILABLE: 503,
  BATCH_UNKNOWN: 500,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  toBody(requestId: string): ErrorBody {
    const body: ErrorBody = {
      error: {
        code: this.code,
        message: this.message,
        requestId,
      },
    };
    if (this.details) body.error.details = this.details;
    return body;
  }
}

/**
 * Chuẩn hoá bất kỳ thứ gì thành AppError.
 *
 * Nguyên tắc: **không bao giờ để lộ stack trace hay message nội bộ ra client.**
 * Lỗi lạ → `INTERNAL` với message chung; chi tiết thật vào log.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // Lỗi validate mang theo danh sách trường sai. Mất danh sách đó thì client biết
  // "payload sai" nhưng không biết sai ở đâu — phải gửi lại mò từng trường.
  if (error instanceof Error && error.name === 'ValidationError' && 'fields' in error) {
    const fields = (error as { fields: unknown }).fields;
    return new AppError(ErrorCode.VALIDATION_FAILED, error.message, {
      fields: Array.isArray(fields) ? fields : [],
    });
  }

  // Dùng lại Idempotency-Key cho payload khác: 409, message nói cách sửa.
  if (error instanceof Error && error.name === 'RequestKeyConflictError') {
    return new AppError(ErrorCode.DUPLICATE_IDEMPOTENCY, error.message);
  }

  // Lỗi từ packages/core có message hữu ích cho người dùng (ví dụ: số tiền sai định dạng).
  // Chuyển thành VALIDATION_FAILED thay vì INTERNAL để client biết là lỗi của họ.
  if (error instanceof Error && isUserFacingError(error)) {
    return new AppError(ErrorCode.VALIDATION_FAILED, error.message);
  }

  return new AppError(ErrorCode.INTERNAL, 'Lỗi hệ thống. Vui lòng thử lại; nếu vẫn lỗi, liên hệ hỗ trợ.');
}

function isUserFacingError(error: Error): boolean {
  const name = error.name;
  return (
    name === 'MoneyFormatError' ||
    name === 'AddressError' ||
    name === 'BatchPlanError' ||
    name === 'CursorError'
  );
}
