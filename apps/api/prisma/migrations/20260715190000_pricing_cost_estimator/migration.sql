-- Pricing cost estimator: standard cost is an optional fallback only.
ALTER TABLE "Product" ADD COLUMN "standardCostCents" INTEGER;
