export type AppErrorCode =
  | 'voyage.not_found'
  | 'hold.not_found'
  | 'ogv.insufficient_cargo'
  | 'voyage.closed'
  | 'voyage.closed_reason_required'
  | 'protein.invalid'
  | 'backup.failed'
  | 'batch.stale';

/** Service-layer error with a stable code; the UI renders it via i18n, never via `message`. */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    readonly params: Record<string, string | number> = {},
  ) {
    super(`${code} ${JSON.stringify(params)}`);
    this.name = 'AppError';
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
