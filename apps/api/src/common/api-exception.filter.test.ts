import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ApiExceptionFilter } from "./api-exception.filter";

test("ApiExceptionFilter formats Nest exceptions with code, message, details, and requestId", () => {
  const payload: Record<string, unknown> = {};
  const response = {
    statusCode: 0,
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: Record<string, unknown>) {
      Object.assign(payload, body);
      return this;
    }
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: "POST",
        url: "/stores",
        requestId: "req_test_123"
      }),
      getResponse: () => response
    })
  };
  const filter = new ApiExceptionFilter();

  filter.catch(new BadRequestException("门店名称不能为空"), host as never);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(payload, {
    code: "BAD_REQUEST",
    message: "门店名称不能为空",
    details: undefined,
    requestId: "req_test_123"
  });
});

test("ApiExceptionFilter preserves module business error codes", () => {
  const payload: Record<string, unknown> = {};
  const response = {
    statusCode: 0,
    status(statusCode: number) { this.statusCode = statusCode; return this; },
    json(body: Record<string, unknown>) { Object.assign(payload, body); return this; }
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: "GET", url: "/reports", requestId: "req_access" }),
      getResponse: () => response
    })
  };

  new ApiExceptionFilter().catch(
    new ForbiddenException({ code: "ACCESS_DENIED", message: "无权限" }),
    host as never
  );

  assert.equal(payload.code, "ACCESS_DENIED");
});

