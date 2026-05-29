import assert from "node:assert/strict";
import { test } from "node:test";
import { StructuredLoggerService } from "./structured-logger.service";

test("StructuredLoggerService writes JSON-safe structured log entries", () => {
  const entries: unknown[] = [];
  const logger = new StructuredLoggerService((entry) => entries.push(entry));

  logger.info("auth.login_failed", {
    requestId: "req_1",
    userId: "user-1",
    password: "secret",
    refreshToken: "token",
    nested: { accessToken: "access", keep: "value" }
  });

  assert.deepEqual(entries, [
    {
      level: "info",
      event: "auth.login_failed",
      requestId: "req_1",
      userId: "user-1",
      password: "[REDACTED]",
      refreshToken: "[REDACTED]",
      nested: { accessToken: "[REDACTED]", keep: "value" }
    }
  ]);
});
