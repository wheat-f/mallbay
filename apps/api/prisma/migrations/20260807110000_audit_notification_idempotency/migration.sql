ALTER TABLE "AuditEvent" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "AuditEvent_action_targetType_targetId_idempotencyKey_key"
  ON "AuditEvent"("action", "targetType", "targetId", "idempotencyKey");
