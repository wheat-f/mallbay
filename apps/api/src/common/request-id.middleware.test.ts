import assert from "node:assert/strict";
import { test } from "node:test";
import { requestIdMiddleware } from "./request-id.middleware";

test("requestIdMiddleware preserves incoming request id and writes it to the response header", () => {
  const req = {
    headers: { "x-request-id": "req_client_123" }
  };
  const headers: Record<string, string> = {};
  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    }
  };
  let nextCalled = false;

  requestIdMiddleware(req as never, res as never, () => {
    nextCalled = true;
  });

  assert.equal(req["requestId"], "req_client_123");
  assert.equal(headers["x-request-id"], "req_client_123");
  assert.equal(nextCalled, true);
});

