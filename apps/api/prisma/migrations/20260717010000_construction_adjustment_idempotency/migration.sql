-- Prevent browser retries from creating duplicate post-confirmation cost adjustments.
ALTER TABLE "ConstructionCostAdjustment"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "ConstructionCostAdjustment_settlementId_idempotencyKey_key"
  ON "ConstructionCostAdjustment"("settlementId", "idempotencyKey");
