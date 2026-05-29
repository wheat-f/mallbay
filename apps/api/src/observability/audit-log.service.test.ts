import assert from "node:assert/strict";
import { test } from "node:test";
import { AuditLogService } from "./audit-log.service";
import { StructuredLoggerService } from "./structured-logger.service";

test("AuditLogService emits sanitized audit events", () => {
  const entries: unknown[] = [];
  const logger = new StructuredLoggerService((entry) => entries.push(entry));
  const audit = new AuditLogService(logger);

  audit.record({
    action: "STORE_REVIEW_APPROVED",
    actorId: "auditor-1",
    targetType: "storeSubmission",
    targetId: "submission-1",
    metadata: { storeId: "store-1", password: "secret" }
  });

  assert.deepEqual(entries, [
    {
      level: "info",
      event: "audit.STORE_REVIEW_APPROVED",
      actorId: "auditor-1",
      targetType: "storeSubmission",
      targetId: "submission-1",
      metadata: { storeId: "store-1", password: "[REDACTED]" }
    }
  ]);
});
