CREATE TYPE "PricingRolloutMode" AS ENUM ('LEGACY', 'SHADOW', 'ACTIVE');
ALTER TABLE "Store" ADD COLUMN "pricingRolloutMode" "PricingRolloutMode" NOT NULL DEFAULT 'ACTIVE';
