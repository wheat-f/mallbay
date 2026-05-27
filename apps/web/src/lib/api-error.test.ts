import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createApiError } from "./api-error";

test("createApiError preserves backend error code and requestId", () => {
  const error = createApiError(403, {
    code: "STORE_FORBIDDEN",
    message: "无权限",
    requestId: "req_test_123",
    details: { storeId: "store-1" }
  });

  assert.equal(error instanceof ApiError, true);
  assert.equal(error.status, 403);
  assert.equal(error.code, "STORE_FORBIDDEN");
  assert.equal(error.message, "无权限");
  assert.equal(error.requestId, "req_test_123");
  assert.deepEqual(error.details, { storeId: "store-1" });
});

