CREATE TABLE "Warehouse" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "area" TEXT,
  "address" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Warehouse_storeId_name_key" ON "Warehouse"("storeId", "name");
CREATE INDEX "Warehouse_storeId_isActive_idx" ON "Warehouse"("storeId", "isActive");
CREATE INDEX "Warehouse_createdById_idx" ON "Warehouse"("createdById");

ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryBatch"
  ADD COLUMN "warehouseId" TEXT,
  ADD COLUMN "warehouseName" TEXT;

CREATE INDEX "InventoryBatch_warehouseId_idx" ON "InventoryBatch"("warehouseId");

ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD COLUMN "warehouseId" TEXT,
  ADD COLUMN "warehouseName" TEXT;

CREATE INDEX "InventoryMovement_warehouseId_idx" ON "InventoryMovement"("warehouseId");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
