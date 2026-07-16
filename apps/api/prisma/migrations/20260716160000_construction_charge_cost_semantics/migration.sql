-- Separate customer-facing construction charges from internal cost snapshots.
-- This migration is intentionally additive: historic *LaborCost* columns stay
-- readable until all API consumers, exports and reports have migrated.

CREATE TYPE "CostCompleteness" AS ENUM ('COMPLETE', 'TEMPORARY', 'MISSING');

ALTER TABLE "PricingCalculation"
  ADD COLUMN "estimatedMaterialCostCents" INTEGER,
  ADD COLUMN "estimatedConstructionCostCents" INTEGER,
  ADD COLUMN "estimatedTotalCostCents" INTEGER,
  ADD COLUMN "costCompleteness" "CostCompleteness";

ALTER TABLE "SalesQuote"
  ADD COLUMN "suggestedConstructionChargeCents" INTEGER,
  ADD COLUMN "finalConstructionChargeCents" INTEGER,
  ADD COLUMN "estimatedMaterialCostCents" INTEGER,
  ADD COLUMN "estimatedConstructionCostCents" INTEGER,
  ADD COLUMN "estimatedTotalCostCents" INTEGER,
  ADD COLUMN "costCompleteness" "CostCompleteness";

ALTER TABLE "OrderAmount"
  ADD COLUMN "constructionChargeCents" INTEGER,
  ADD COLUMN "suggestedConstructionChargeCents" INTEGER,
  ADD COLUMN "constructionChargeAdjustmentReason" TEXT,
  ADD COLUMN "estimatedMaterialCostCents" INTEGER,
  ADD COLUMN "estimatedConstructionCostCents" INTEGER,
  ADD COLUMN "estimatedTotalCostCents" INTEGER,
  ADD COLUMN "costCompleteness" "CostCompleteness";

-- Historic labor fields have always represented amounts charged to the
-- customer. Backfill only that unambiguous revenue fact; never fabricate
-- material or internal construction costs for history.
UPDATE "SalesQuote"
SET
  "suggestedConstructionChargeCents" = "suggestedLaborCostCents",
  "finalConstructionChargeCents" = "finalLaborCostCents"
WHERE "suggestedConstructionChargeCents" IS NULL
   OR "finalConstructionChargeCents" IS NULL;

UPDATE "OrderAmount"
SET
  "constructionChargeCents" = "laborCostCents",
  "suggestedConstructionChargeCents" = "suggestedLaborCostCents",
  "constructionChargeAdjustmentReason" = "laborCostAdjustmentReason"
WHERE "constructionChargeCents" IS NULL;

CREATE INDEX "SalesQuote_storeId_costCompleteness_idx"
  ON "SalesQuote"("storeId", "costCompleteness");
CREATE INDEX "OrderAmount_costCompleteness_idx"
  ON "OrderAmount"("costCompleteness");
