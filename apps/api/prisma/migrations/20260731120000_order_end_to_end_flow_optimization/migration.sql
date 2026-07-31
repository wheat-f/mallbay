-- Order end-to-end flow optimization: warranty activation, rework snapshot and balance todos.
ALTER TYPE "WarrantyStatus" ADD VALUE IF NOT EXISTS 'PENDING_ACTIVATION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ORDER_BALANCE_DUE';

ALTER TABLE "Warranty"
  ALTER COLUMN "startDate" DROP NOT NULL,
  ALTER COLUMN "endDate" DROP NOT NULL;

ALTER TABLE "ConstructionRecord"
  ADD COLUMN "reworkCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "currentReworkReason" TEXT,
  ADD COLUMN "currentResponsibilityType" TEXT;

ALTER TABLE "Notification"
  ADD COLUMN "todoKey" TEXT,
  ADD COLUMN "handledAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Notification_todoKey_key" ON "Notification"("todoKey");

ALTER TABLE "OrderPayment" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "OrderPayment_orderId_idempotencyKey_key" ON "OrderPayment"("orderId", "idempotencyKey");
