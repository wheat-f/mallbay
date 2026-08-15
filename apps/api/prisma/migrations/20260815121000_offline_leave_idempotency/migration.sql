ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "clientOperationId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveRequest_clientOperationId_key"
  ON "LeaveRequest"("clientOperationId");
