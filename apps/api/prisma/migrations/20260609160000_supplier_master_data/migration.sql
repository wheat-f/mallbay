-- Add supplier master data without removing supplier snapshots on purchase orders or batches.

CREATE TABLE "Supplier" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "rating" INTEGER,
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Supplier_storeId_name_key" ON "Supplier"("storeId", "name");
CREATE INDEX "Supplier_storeId_isActive_idx" ON "Supplier"("storeId", "isActive");
CREATE INDEX "Supplier_createdById_idx" ON "Supplier"("createdById");

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
