ALTER TABLE "InventoryMovement" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "InventoryMovement_storeId_sourceType_sourceId_idempotencyKey_key"
  ON "InventoryMovement"("storeId", "sourceType", "sourceId", "idempotencyKey");
