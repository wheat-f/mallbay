-- Do not let a newly created or historically unconfigured store enter the
-- formal pricing/cost path merely because the rollout column was introduced.
-- Existing stores with a usable published price version keep comparison data in
-- SHADOW; stores with no usable version fall back to LEGACY.  This migration
-- only changes the rollout switch and never deletes business snapshots.

ALTER TABLE "Store"
  ALTER COLUMN "pricingRolloutMode" SET DEFAULT 'LEGACY';

UPDATE "Store" AS store
SET "pricingRolloutMode" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "PricingRuleSet" AS rule_set
    WHERE rule_set."storeId" = store."id"
      AND rule_set."status" = 'PUBLISHED'
      AND rule_set."effectiveFrom" <= CURRENT_TIMESTAMP
      AND (rule_set."effectiveTo" IS NULL OR rule_set."effectiveTo" > CURRENT_TIMESTAMP)
  ) THEN 'SHADOW'::"PricingRolloutMode"
  ELSE 'LEGACY'::"PricingRolloutMode"
END
WHERE store."pricingRolloutMode" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1
    FROM "PricingRuleSet" AS rule_set
    WHERE rule_set."storeId" = store."id"
      AND rule_set."status" = 'PUBLISHED'
      AND rule_set."effectiveFrom" <= CURRENT_TIMESTAMP
      AND (rule_set."effectiveTo" IS NULL OR rule_set."effectiveTo" > CURRENT_TIMESTAMP)
      AND rule_set."positionCostRateVersionId" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "ConstructionStandardLine" AS standard
        WHERE standard."ruleSetId" = rule_set."id"
          AND standard."enabled" = true
      )
      AND EXISTS (
        SELECT 1
        FROM "PositionCostRateVersion" AS rate_version
        WHERE rate_version."id" = rule_set."positionCostRateVersionId"
          AND rate_version."status" = 'PUBLISHED'
          AND EXISTS (
            SELECT 1
            FROM "PositionCostRate" AS rate
            WHERE rate."versionId" = rate_version."id"
          )
      )
  );
