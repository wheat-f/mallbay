import { HttpStatus } from "@nestjs/common";

export const API_ERROR_CODE_BY_STATUS: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
  [HttpStatus.FORBIDDEN]: "ACCESS_DENIED",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.INTERNAL_SERVER_ERROR]: "INTERNAL_SERVER_ERROR"
};

export function apiErrorCodeForStatus(status: number) {
  return API_ERROR_CODE_BY_STATUS[status] ?? `HTTP_${status}`;
}

