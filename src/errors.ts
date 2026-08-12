export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'ambiguous_match'
  | 'unsupported_operation'
  | 'provider_authentication'
  | 'provider_rate_limited'
  | 'provider_timeout'
  | 'provider_response_invalid'
  | 'batch_too_large'
  | 'rate_limited'
  | 'upstream_error'
  | 'internal_error';

const statusByCode: Readonly<Record<ErrorCode, number>> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  ambiguous_match: 409,
  unsupported_operation: 501,
  provider_authentication: 502,
  provider_rate_limited: 503,
  provider_timeout: 504,
  provider_response_invalid: 502,
  batch_too_large: 400,
  rate_limited: 429,
  upstream_error: 502,
  internal_error: 500,
};

export class AppError extends Error {
  public override readonly name = 'AppError';
  public readonly statusCode: number;

  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
    public readonly retryable = false,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.statusCode = statusByCode[code];
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError('bad_request', message, details);
export const unauthorized = (message: string): AppError => new AppError('unauthorized', message);
export const forbidden = (message: string): AppError => new AppError('forbidden', message);
export const notFound = (message: string, details?: unknown): AppError =>
  new AppError('not_found', message, details);

export const toAppError = (error: unknown): AppError =>
  error instanceof AppError
    ? error
    : new AppError(
        'internal_error',
        'The tool server failed to complete the request',
        undefined,
        false,
        error,
      );
