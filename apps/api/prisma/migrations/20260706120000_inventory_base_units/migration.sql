ALTER TYPE "ProductUnit" ADD VALUE IF NOT EXISTS 'SQUARE_METER';
ALTER TYPE "ProductUnit" ADD VALUE IF NOT EXISTS 'SQUARE_CENTIMETER';

ALTER TABLE "InventoryBatch"
  ADD COLUMN "packageUnit" "ProductUnit",
  ADD COLUMN "packageQuantity" DECIMAL(12,3),
  ADD COLUMN "baseUnit" "ProductUnit" NOT NULL DEFAULT 'PIECE',
  ADD COLUMN "baseQuantityPerPackage" DECIMAL(12,3);

ALTER TABLE "OrderItem"
  ADD COLUMN "salesUnit" "ProductUnit",
  ADD COLUMN "baseUnit" "ProductUnit",
  ADD COLUMN "baseQuantityPerSalesUnit" DECIMAL(12,3),
  ADD COLUMN "requiredBaseQuantity" DECIMAL(12,3);

UPDATE "InventoryBatch" b
SET
  "packageUnit" = b."unit",
  "packageQuantity" = b."totalQuantity",
  "baseUnit" = CASE
    WHEN b."unit" = 'ROLL' AND p."metersPerRoll" IS NOT NULL AND p."metersPerRoll" > 0 THEN 'METER'::"ProductUnit"
    ELSE b."unit"
  END,
  "baseQuantityPerPackage" = CASE
    WHEN b."unit" = 'ROLL' AND p."metersPerRoll" IS NOT NULL AND p."metersPerRoll" > 0 THEN p."metersPerRoll"
    ELSE 1
  END
FROM "Product" p
WHERE b."productId" = p."id";

UPDATE "InventoryBatch" b
SET
  "totalQuantity" = b."totalQuantity" * b."baseQuantityPerPackage",
  "availableQuantity" = b."availableQuantity" * b."baseQuantityPerPackage",
  "lockedQuantity" = b."lockedQuantity" * b."baseQuantityPerPackage",
  "outboundQuantity" = b."outboundQuantity" * b."baseQuantityPerPackage",
  "unit" = b."baseUnit"
WHERE b."packageUnit" = 'ROLL' AND b."baseUnit" = 'METER';

UPDATE "OrderItem" oi
SET
  "salesUnit" = COALESCE(p."salesUnit", p."unit"),
  "baseUnit" = COALESCE(p."inventoryUnit", COALESCE(p."salesUnit", p."unit")),
  "baseQuantityPerSalesUnit" = CASE
    WHEN COALESCE(p."salesUnit", p."unit") = 'ROLL' AND p."metersPerRoll" IS NOT NULL AND p."metersPerRoll" > 0 THEN p."metersPerRoll"
    ELSE 1
  END,
  "requiredBaseQuantity" = oi."quantity" * CASE
    WHEN COALESCE(p."salesUnit", p."unit") = 'ROLL' AND p."metersPerRoll" IS NOT NULL AND p."metersPerRoll" > 0 THEN p."metersPerRoll"
    ELSE 1
  END
FROM "Product" p
WHERE oi."productId" = p."id";
