import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import type { Response } from "express";
import { apiErrorCodeForStatus } from "./api-error-code";
import type { RequestWithId } from "./request-id.middleware";

type ErrorBody = {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
};

type ErrorResponse = { code?: string; message?: string | string[]; details?: unknown };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error("Unhandled API exception", {
        requestId: request.requestId,
        method: request.method,
        route: request.originalUrl,
        exception
      });
    }

    response.status(status).json(this.toBody(exception, status, request.requestId));
  }

  private toBody(exception: unknown, status: number, requestId?: string): ErrorBody {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message = this.extractMessage(response, exception.message);

      return {
        code: this.extractCode(response) ?? apiErrorCodeForStatus(status),
        message,
        details: this.extractDetails(response),
        requestId
      };
    }

    return {
      code: apiErrorCodeForStatus(status),
      message: "服务器内部错误",
      details: undefined,
      requestId
    };
  }

  private extractMessage(response: string | object, fallback: string) {
    if (typeof response === "string") return response;
    if ("message" in response) {
      const message = response.message;
      if (Array.isArray(message)) return message.join("; ");
      if (typeof message === "string") return message;
    }
    return fallback;
  }

  private extractDetails(response: string | object) {
    if (typeof response === "string") return undefined;
    if ("message" in response && Array.isArray(response.message)) {
      return { validation: response.message };
    }
    return undefined;
  }

  private extractCode(response: string | object) {
    if (typeof response === "string") return undefined;
    const code = (response as ErrorResponse).code;
    return typeof code === "string" ? code : undefined;
  }

}
