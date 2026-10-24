export class ServiceError extends Error {
  readonly status: 400 | 401 | 402 | 403 | 404 | 409 | 413 | 415 | 429 | 503;
  readonly code: string;
  constructor(status: ServiceError['status'], code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
