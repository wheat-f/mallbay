-- Phase 3 inventory purchase improvements.
-- Keep existing tables and legacy movement enum values; add the structures needed
-- for order allocation, purchase requirements, decimal stock quantities, and
-- traceable batch split operations.

ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'COUNT_IN';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'COUNT_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'DAMAGE_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RETURN_IN';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'RETURN_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'BATCH_SPLIT';

CREATE TYPE "InventoryAllocationStatus" AS ENUM ('LOCKED', 'OUTBOUND', 'RELEASED');
CREATE TYPE "PurchaseRequirementStatus" AS ENUM ('OPEN', 'PARTIAL_ORDERED', 'ORDERED', 'PARTIAL_RECEIVED', 'FULFILLED', 'CANCELLED');

ALTER TABLE "Product"
  ADD COLUMN "inventoryUnit" "ProductUnit" NOT NULL DEFAULT 'ROLL',
  ADD COLUMN "salesUnit" "ProductUnit" NOT NULL DEFAULT 'ROLL',
  ADD COLUMN "rollWidthMeters" DECIMAL(8,3),
  ADD COLUMN "rollLengthMeters" DECIMAL(8,3),
  ADD COLUMN "metersPerRoll" DECIMAL(10,3),
  ADD COLUMN "quantityPrecision" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "InventoryBatch"
  ADD COLUMN "unit" "ProductUnit" NOT NULL DEFAULT 'ROLL',
  ADD COLUMN "outboundQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN "parentBatchId" TEXT,
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ALTER COLUMN "totalQuantity" TYPE DECIMAL(12,3) USING "totalQuantity"::DECIMAL,
  ALTER COLUMN "availableQuantity" TYPE DECIMAL(12,3) USING "availableQuantity"::DECIMAL,
  ALTER COLUMN "lockedQuantity" TYPE DECIMAL(12,3) USING "lockedQuantity"::DECIMAL,
  ALTER COLUMN "lockedQuantity" SET DEFAULT 0;

ALTER TABLE "InventoryMovement"
  ADD COLUMN "unit" "ProductUnit",
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ALTER COLUMN "quantity" TYPE DECIMAL(12,3) USING "quantity"::DECIMAL;

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "purchaseRequirementId" TEXT;

ALTER TABLE "PurchaseOrderItem"
  ADD COLUMN "purchaseRequirementItemId" TEXT,
  ALTER COLUMN "quantity" TYPE DECIMAL(12,3) USING "quantity"::DECIMAL,
  ALTER COLUMN "receivedQuantity" TYPE DECIMAL(12,3) USING "receivedQuantity"::DECIMAL,
  ALTER COLUMN "receivedQuantity" SET DEFAULT 0;

CREATE TABLE "OrderInventoryAllocation" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "lockedQuantity" DECIMAL(12,3) NOT NULL,
  "outboundQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "status" "InventoryAllocationStatus" NOT NULL DEFAULT 'LOCKED',
  "lockedById" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "outboundById" TEXT,
  "outboundAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderInventoryAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseRequirement" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "sourceOrderId" TEXT,
  "status" "PurchaseRequirementStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseRequirementItem" (
  "id" TEXT NOT NULL,
  "purchaseRequirementId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "orderItemId" TEXT,
  "requiredQuantity" DECIMAL(12,3) NOT NULL,
  "requiredUnit" "ProductUnit" NOT NULL,
  "fulfilledQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseRequirementItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderInventoryAllocation_orderId_orderItemId_batchId_key" ON "OrderInventoryAllocation"("orderId", "orderItemId", "batchId");
CREATE INDEX "OrderInventoryAllocation_storeId_status_idx" ON "OrderInventoryAllocation"("storeId", "status");
CREATE INDEX "OrderInventoryAllocation_orderId_idx" ON "OrderInventoryAllocation"("orderId");
CREATE INDEX "OrderInventoryAllocation_batchId_idx" ON "OrderInventoryAllocation"("batchId");
CREATE INDEX "OrderInventoryAllocation_lockedById_idx" ON "OrderInventoryAllocation"("lockedById");
CREATE INDEX "OrderInventoryAllocation_outboundById_idx" ON "OrderInventoryAllocation"("outboundById");

CREATE INDEX "PurchaseRequirement_storeId_status_idx" ON "PurchaseRequirement"("storeId", "status");
CREATE INDEX "PurchaseRequirement_sourceOrderId_idx" ON "PurchaseRequirement"("sourceOrderId");
CREATE INDEX "PurchaseRequirement_createdById_idx" ON "PurchaseRequirement"("createdById");

CREATE INDEX "PurchaseRequirementItem_purchaseRequirementId_idx" ON "PurchaseRequirementItem"("purchaseRequirementId");
CREATE INDEX "PurchaseRequirementItem_productId_idx" ON "PurchaseRequirementItem"("productId");
CREATE INDEX "PurchaseRequirementItem_orderItemId_idx" ON "PurchaseRequirementItem"("orderItemId");

CREATE INDEX "InventoryBatch_parentBatchId_idx" ON "InventoryBatch"("parentBatchId");
CREATE INDEX "InventoryMovement_sourceType_sourceId_idx" ON "InventoryMovement"("sourceType", "sourceId");
CREATE INDEX "PurchaseOrder_purchaseRequirementId_idx" ON "PurchaseOrder"("purchaseRequirementId");
CREATE INDEX "PurchaseOrderItem_purchaseRequirementItemId_idx" ON "PurchaseOrderItem"("purchaseRequirementItemId");

ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_parentBatchId_fkey" FOREIGN KEY ("parentBatchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderInventoryAllocation" ADD CONSTRAINT "OrderInventoryAllocation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderInventoryAllocation" ADD CONSTRAINT "OrderInventoryAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderInventoryAllocation" ADD CONSTRAINT "OrderInventoryAllocation_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderInventoryAllocation" ADD CONSTRAINT "OrderInventoryAllocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderInventoryAllocation" ADD CONSTRAINT "OrderInventoryAllocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderInventoryAllocation" ADD CONSTRAINT "OrderInventoryAllocation_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderInventoryAllocation" ADD CONSTRAINT "OrderInventoryAllocation_outboundById_fkey" FOREIGN KEY ("outboundById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseRequirement" ADD CONSTRAINT "PurchaseRequirement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequirement" ADD CONSTRAINT "PurchaseRequirement_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequirement" ADD CONSTRAINT "PurchaseRequirement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PurchaseRequirementItem" ADD CONSTRAINT "PurchaseRequirementItem_purchaseRequirementId_fkey" FOREIGN KEY ("purchaseRequirementId") REFERENCES "PurchaseRequirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequirementItem" ADD CONSTRAINT "PurchaseRequirementItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseRequirementItem" ADD CONSTRAINT "PurchaseRequirementItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseRequirementId_fkey" FOREIGN KEY ("purchaseRequirementId") REFERENCES "PurchaseRequirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseRequirementItemId_fkey" FOREIGN KEY ("purchaseRequirementItemId") REFERENCES "PurchaseRequirementItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
