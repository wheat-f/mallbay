-- Preserve an exceptional, manager-entered total separately from normal,
-- service-side estimates. Existing quotes and orders are unaffected.
ALTER TABLE "SalesQuote"
  ADD COLUMN "temporaryCostCents" INTEGER,
  ADD COLUMN "temporaryCostReason" TEXT;

ALTER TABLE "OrderAmount"
  ADD COLUMN "temporaryCostCents" INTEGER,
  ADD COLUMN "temporaryCostReason" TEXT;
