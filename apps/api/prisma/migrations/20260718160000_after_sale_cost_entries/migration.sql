-- Immutable after-sales cost ledger. Corrections are represented by a linked
-- reversal entry rather than deletes or in-place amount changes.
CREATE TYPE "AfterSaleCostCategory" AS ENUM ('MATERIAL', 'CONSTRUCTION_LABOR', 'REFUND_COMPENSATION', 'OUTSOURCE', 'SUPPLIER_RECOVERY');
CREATE TYPE "AfterSaleCostDirection" AS ENUM ('EXPENSE', 'RECOVERY');
CREATE TYPE "AfterSaleCostStatus" AS ENUM ('CONFIRMED', 'REVERSED');

CREATE TABLE "AfterSaleCostEntry" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "afterSaleId" TEXT NOT NULL,
  "category" "AfterSaleCostCategory" NOT NULL,
  "direction" "AfterSaleCostDirection" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "paymentRecordId" TEXT,
  "status" "AfterSaleCostStatus" NOT NULL DEFAULT 'CONFIRMED',
  "reversalOfId" TEXT,
  "reversalReason" TEXT,
  "recordedById" TEXT NOT NULL,
  "reversedById" TEXT,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AfterSaleCostEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AfterSaleCostEntry_storeId_category_confirmedAt_idx" ON "AfterSaleCostEntry"("storeId", "category", "confirmedAt");
CREATE INDEX "AfterSaleCostEntry_afterSaleId_status_idx" ON "AfterSaleCostEntry"("afterSaleId", "status");
CREATE INDEX "AfterSaleCostEntry_reversalOfId_idx" ON "AfterSaleCostEntry"("reversalOfId");

ALTER TABLE "AfterSaleCostEntry" ADD CONSTRAINT "AfterSaleCostEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AfterSaleCostEntry" ADD CONSTRAINT "AfterSaleCostEntry_afterSaleId_fkey" FOREIGN KEY ("afterSaleId") REFERENCES "AfterSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AfterSaleCostEntry" ADD CONSTRAINT "AfterSaleCostEntry_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AfterSaleCostEntry" ADD CONSTRAINT "AfterSaleCostEntry_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
