-- Cross-store construction foundation.
-- Existing stores are backfilled into independent financial entities. Administrators
-- can later merge A/B/C by assigning the same FinancialEntity id.
CREATE TYPE "CrossStoreTaskStatus" AS ENUM (
  'PENDING_ACCEPTANCE',
  'REJECTED',
  'ACCEPTED',
  'READY_TO_DISPATCH',
  'DISPATCHED',
  'IN_CONSTRUCTION',
  'PENDING_SOURCE_ACCEPTANCE',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "CrossStoreMaterialSupplyMode" AS ENUM ('EXECUTION_STORE');

CREATE TABLE "FinancialEntity" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "DictionaryStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinancialEntity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialEntity_code_key" ON "FinancialEntity"("code");
CREATE INDEX "FinancialEntity_status_idx" ON "FinancialEntity"("status");

ALTER TABLE "Store"
  ADD COLUMN "financialEntityId" TEXT,
  ADD COLUMN "crossStoreConstructionEnabled" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "FinancialEntity" ("id", "code", "name", "status", "createdAt", "updatedAt")
SELECT
  'fe_' || md5("id"),
  'STORE_' || substr(md5("id"), 1, 16),
  "name" || '财务主体',
  'ACTIVE'::"DictionaryStatus",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Store";

UPDATE "Store"
SET "financialEntityId" = 'fe_' || md5("id")
WHERE "financialEntityId" IS NULL;

ALTER TABLE "Store" ALTER COLUMN "financialEntityId" SET NOT NULL;
ALTER TABLE "Store" ADD CONSTRAINT "Store_financialEntityId_fkey"
  FOREIGN KEY ("financialEntityId") REFERENCES "FinancialEntity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Store_financialEntityId_crossStoreConstructionEnabled_idx"
  ON "Store"("financialEntityId", "crossStoreConstructionEnabled");

ALTER TABLE "SalesQuote" ADD COLUMN "executionStoreId" TEXT;
UPDATE "SalesQuote" SET "executionStoreId" = "storeId" WHERE "executionStoreId" IS NULL;
ALTER TABLE "SalesQuote" ALTER COLUMN "executionStoreId" SET NOT NULL;
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_executionStoreId_fkey"
  FOREIGN KEY ("executionStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SalesQuote_executionStoreId_status_createdAt_idx"
  ON "SalesQuote"("executionStoreId", "status", "createdAt");

ALTER TABLE "Order" ADD COLUMN "executionStoreId" TEXT;
UPDATE "Order" SET "executionStoreId" = "storeId" WHERE "executionStoreId" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "executionStoreId" SET NOT NULL;
ALTER TABLE "Order" ADD CONSTRAINT "Order_executionStoreId_fkey"
  FOREIGN KEY ("executionStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Order_executionStoreId_status_idx" ON "Order"("executionStoreId", "status");
CREATE INDEX "Order_storeId_executionStoreId_appointmentDate_idx"
  ON "Order"("storeId", "executionStoreId", "appointmentDate");

CREATE TABLE "CrossStoreProductMapping" (
  "id" TEXT NOT NULL,
  "financialEntityId" TEXT NOT NULL,
  "sourceProductId" TEXT NOT NULL,
  "executionStoreId" TEXT NOT NULL,
  "executionProductId" TEXT NOT NULL,
  "sourceSalesUnit" "ProductUnit" NOT NULL,
  "executionInventoryUnit" "ProductUnit" NOT NULL,
  "conversionSnapshot" JSONB,
  "status" "DictionaryStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrossStoreProductMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrossStoreProductMapping_sourceProductId_executionStoreId_key"
  ON "CrossStoreProductMapping"("sourceProductId", "executionStoreId");
CREATE INDEX "CrossStoreProductMapping_financialEntityId_status_idx"
  ON "CrossStoreProductMapping"("financialEntityId", "status");
CREATE INDEX "CrossStoreProductMapping_executionStoreId_status_idx"
  ON "CrossStoreProductMapping"("executionStoreId", "status");
CREATE INDEX "CrossStoreProductMapping_executionProductId_idx"
  ON "CrossStoreProductMapping"("executionProductId");
ALTER TABLE "CrossStoreProductMapping" ADD CONSTRAINT "CrossStoreProductMapping_financialEntityId_fkey"
  FOREIGN KEY ("financialEntityId") REFERENCES "FinancialEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossStoreProductMapping" ADD CONSTRAINT "CrossStoreProductMapping_sourceProductId_fkey"
  FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossStoreProductMapping" ADD CONSTRAINT "CrossStoreProductMapping_executionStoreId_fkey"
  FOREIGN KEY ("executionStoreId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossStoreProductMapping" ADD CONSTRAINT "CrossStoreProductMapping_executionProductId_fkey"
  FOREIGN KEY ("executionProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CrossStoreConstructionTask" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sourceStoreId" TEXT NOT NULL,
  "executionStoreId" TEXT NOT NULL,
  "status" "CrossStoreTaskStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
  "materialSupplyMode" "CrossStoreMaterialSupplyMode" NOT NULL DEFAULT 'EXECUTION_STORE',
  "requirementsSnapshot" JSONB NOT NULL,
  "sourceContactSnapshot" JSONB,
  "rejectionReason" TEXT,
  "cancellationReason" TEXT,
  "createdById" TEXT NOT NULL,
  "acceptedById" TEXT,
  "sourceAcceptedById" TEXT,
  "cancelledById" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "dispatchedAt" TIMESTAMP(3),
  "constructionStartedAt" TIMESTAMP(3),
  "submittedForAcceptanceAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrossStoreConstructionTask_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CrossStoreConstructionTask_orderId_key" ON "CrossStoreConstructionTask"("orderId");
CREATE INDEX "CrossStoreConstructionTask_sourceStoreId_status_createdAt_idx"
  ON "CrossStoreConstructionTask"("sourceStoreId", "status", "createdAt");
CREATE INDEX "CrossStoreConstructionTask_executionStoreId_status_createdAt_idx"
  ON "CrossStoreConstructionTask"("executionStoreId", "status", "createdAt");
ALTER TABLE "CrossStoreConstructionTask" ADD CONSTRAINT "CrossStoreConstructionTask_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrossStoreConstructionTask" ADD CONSTRAINT "CrossStoreConstructionTask_sourceStoreId_fkey"
  FOREIGN KEY ("sourceStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrossStoreConstructionTask" ADD CONSTRAINT "CrossStoreConstructionTask_executionStoreId_fkey"
  FOREIGN KEY ("executionStoreId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD COLUMN "crossStoreTaskId" TEXT;
ALTER TABLE "OrderInventoryAllocation" ADD COLUMN "crossStoreTaskId" TEXT;
ALTER TABLE "PurchaseRequirement" ADD COLUMN "crossStoreTaskId" TEXT;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_crossStoreTaskId_fkey"
  FOREIGN KEY ("crossStoreTaskId") REFERENCES "CrossStoreConstructionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderInventoryAllocation" ADD CONSTRAINT "OrderInventoryAllocation_crossStoreTaskId_fkey"
  FOREIGN KEY ("crossStoreTaskId") REFERENCES "CrossStoreConstructionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequirement" ADD CONSTRAINT "PurchaseRequirement_crossStoreTaskId_fkey"
  FOREIGN KEY ("crossStoreTaskId") REFERENCES "CrossStoreConstructionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "InventoryMovement_crossStoreTaskId_idx" ON "InventoryMovement"("crossStoreTaskId");
CREATE INDEX "OrderInventoryAllocation_crossStoreTaskId_idx" ON "OrderInventoryAllocation"("crossStoreTaskId");
CREATE INDEX "PurchaseRequirement_crossStoreTaskId_idx" ON "PurchaseRequirement"("crossStoreTaskId");

ALTER TYPE "NotificationType" ADD VALUE 'CROSS_STORE_TASK_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'CROSS_STORE_TASK_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'CROSS_STORE_TASK_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE 'CROSS_STORE_TASK_READY';
ALTER TYPE "NotificationType" ADD VALUE 'CROSS_STORE_TASK_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'CROSS_STORE_TASK_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'CROSS_STORE_TASK_CANCELLED';