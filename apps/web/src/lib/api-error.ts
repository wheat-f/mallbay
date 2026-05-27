type ApiErrorBody = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  requestId?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApiError(status: number, body: ApiErrorBody): ApiError {
  const message = typeof body.message === "string" ? body.message : "请求失败";
  const code = typeof body.code === "string" ? body.code : undefined;
  const requestId = typeof body.requestId === "string" ? body.requestId : undefined;

  return new ApiError(message, status, code, body.details, requestId);
}

