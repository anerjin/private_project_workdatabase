export class ApiError extends Error {
  constructor(
    message: string,
    readonly code = 'error',
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
