CREATE TABLE "PurchaseReceiptCostRecord" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "purchaseOrderItemId" TEXT NOT NULL,
  "inventoryBatchId" TEXT NOT NULL,
  "receivedQuantity" DECIMAL(12,3) NOT NULL,
  "purchaseUnit" "ProductUnit" NOT NULL,
  "baseUnit" "ProductUnit" NOT NULL,
  "baseQuantity" DECIMAL(12,3) NOT NULL,
  "plannedUnitCostCents" INTEGER,
  "actualUnitCostCents" INTEGER,
  "baseUnitCostCents" INTEGER,
  "differenceCents" INTEGER,
  "differenceReason" TEXT,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseReceiptCostRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseReceiptCostRecord_storeId_createdAt_idx" ON "PurchaseReceiptCostRecord"("storeId", "createdAt");
CREATE INDEX "PurchaseReceiptCostRecord_purchaseOrderItemId_idx" ON "PurchaseReceiptCostRecord"("purchaseOrderItemId");
CREATE INDEX "PurchaseReceiptCostRecord_inventoryBatchId_idx" ON "PurchaseReceiptCostRecord"("inventoryBatchId");

ALTER TABLE "PurchaseReceiptCostRecord"
  ADD CONSTRAINT "PurchaseReceiptCostRecord_purchaseOrderItemId_fkey"
  FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseReceiptCostRecord"
  ADD CONSTRAINT "PurchaseReceiptCostRecord_inventoryBatchId_fkey"
  FOREIGN KEY ("inventoryBatchId") REFERENCES "InventoryBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
