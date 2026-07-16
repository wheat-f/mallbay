-- Pricing engine foundation: vehicle classification, immutable rule snapshots
-- and deterministic calculation metadata.

CREATE TYPE "PricingRuleSetStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE "PricingRuleGroup" AS ENUM ('PRODUCT', 'VEHICLE', 'CONSTRUCTION', 'SURCHARGE', 'BUNDLE');
CREATE TYPE "PricingRuleTarget" AS ENUM ('PRODUCT_LINE', 'LABOR', 'ORDER');
CREATE TYPE "PricingRuleActionType" AS ENUM ('ADD_CENTS', 'SUBTRACT_CENTS', 'MULTIPLY_BPS', 'DISCOUNT_BPS');
CREATE TYPE "PricingCalculationDecision" AS ENUM ('NORMAL', 'APPROVAL_REQUIRED', 'BLOCKED');

ALTER TABLE "CustomerVehicle" ADD COLUMN "vehiclePriceClassId" TEXT;
CREATE INDEX "CustomerVehicle_vehiclePriceClassId_idx" ON "CustomerVehicle"("vehiclePriceClassId");

CREATE TABLE "VehiclePriceClass" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "DictionaryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VehiclePriceClass_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VehiclePriceClass_storeId_code_key" ON "VehiclePriceClass"("storeId", "code");
CREATE INDEX "VehiclePriceClass_storeId_status_idx" ON "VehiclePriceClass"("storeId", "status");

CREATE TABLE "VehicleModelMapping" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "brand" TEXT,
    "modelKeyword" TEXT NOT NULL,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "vehiclePriceClassId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "DictionaryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VehicleModelMapping_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VehicleModelMapping_storeId_status_priority_idx" ON "VehicleModelMapping"("storeId", "status", "priority");
CREATE INDEX "VehicleModelMapping_vehiclePriceClassId_idx" ON "VehicleModelMapping"("vehiclePriceClassId");

CREATE TABLE "PricingRuleSet" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PricingRuleSetStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "sourceTemplateVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingRuleSet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PricingRuleSet_storeId_version_key" ON "PricingRuleSet"("storeId", "version");
CREATE INDEX "PricingRuleSet_storeId_status_effectiveFrom_idx" ON "PricingRuleSet"("storeId", "status", "effectiveFrom");

CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "group" "PricingRuleGroup" NOT NULL,
    "target" "PricingRuleTarget" NOT NULL,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actionType" "PricingRuleActionType" NOT NULL,
    "actionValue" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PricingRule_ruleSetId_group_target_enabled_idx" ON "PricingRule"("ruleSetId", "group", "target", "enabled");

CREATE TABLE "PricingProtectionPolicy" (
    "id" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "normalDeviationBps" INTEGER NOT NULL,
    "approvalDeviationBps" INTEGER NOT NULL,
    "minimumMarginBps" INTEGER NOT NULL,
    "blockBelowMarginBps" INTEGER,
    "softHoldHours" INTEGER NOT NULL DEFAULT 24,
    "allowSpecialApproval" BOOLEAN NOT NULL DEFAULT false,
    "internalLaborCostConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingProtectionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PricingProtectionPolicy_ruleSetId_key" ON "PricingProtectionPolicy"("ruleSetId");

CREATE TABLE "PricingCalculation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ruleSetId" TEXT NOT NULL,
    "ruleSetVersion" INTEGER NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "outputSnapshot" JSONB NOT NULL,
    "appliedRules" JSONB NOT NULL,
    "decision" "PricingCalculationDecision" NOT NULL DEFAULT 'NORMAL',
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PricingCalculation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PricingCalculation_storeId_createdAt_idx" ON "PricingCalculation"("storeId", "createdAt");
CREATE INDEX "PricingCalculation_ruleSetId_inputHash_idx" ON "PricingCalculation"("ruleSetId", "inputHash");

ALTER TABLE "CustomerVehicle" ADD CONSTRAINT "CustomerVehicle_vehiclePriceClassId_fkey" FOREIGN KEY ("vehiclePriceClassId") REFERENCES "VehiclePriceClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehiclePriceClass" ADD CONSTRAINT "VehiclePriceClass_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehiclePriceClass" ADD CONSTRAINT "VehiclePriceClass_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VehicleModelMapping" ADD CONSTRAINT "VehicleModelMapping_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleModelMapping" ADD CONSTRAINT "VehicleModelMapping_vehiclePriceClassId_fkey" FOREIGN KEY ("vehiclePriceClassId") REFERENCES "VehiclePriceClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VehicleModelMapping" ADD CONSTRAINT "VehicleModelMapping_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PricingRuleSet" ADD CONSTRAINT "PricingRuleSet_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingRuleSet" ADD CONSTRAINT "PricingRuleSet_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "PricingRuleSet" ADD CONSTRAINT "PricingRuleSet_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PricingRule" ADD CONSTRAINT "PricingRule_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "PricingRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingProtectionPolicy" ADD CONSTRAINT "PricingProtectionPolicy_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "PricingRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingCalculation" ADD CONSTRAINT "PricingCalculation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingCalculation" ADD CONSTRAINT "PricingCalculation_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "PricingRuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingCalculation" ADD CONSTRAINT "PricingCalculation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON UPDATE CASCADE;

ALTER TABLE "OrderAmount" ADD COLUMN "pricingCalculationId" TEXT;
ALTER TABLE "OrderAmount" ADD COLUMN "pricingRuleSetVersion" INTEGER;
ALTER TABLE "OrderAmount" ADD COLUMN "pricingInputHash" TEXT;
ALTER TABLE "OrderAmount" ADD COLUMN "pricingOutputSnapshot" JSONB;
CREATE INDEX "OrderAmount_pricingCalculationId_idx" ON "OrderAmount"("pricingCalculationId");

CREATE TYPE "SalesQuoteStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'WITHDRAWN');
CREATE TYPE "PricingApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "PricingApprovalType" AS ENUM ('DEVIATION', 'MARGIN', 'MINIMUM_PRICE', 'SPECIAL_APPROVAL');

CREATE TABLE "SalesQuote" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "quoteNo" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "salesPersonId" TEXT NOT NULL,
    "pricingCalculationId" TEXT NOT NULL,
    "status" "SalesQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "vehicleClassSnapshot" JSONB,
    "suggestedProductAmountCents" INTEGER NOT NULL,
    "suggestedLaborCostCents" INTEGER NOT NULL,
    "suggestedTotalCents" INTEGER NOT NULL,
    "finalProductAmountCents" INTEGER NOT NULL,
    "finalLaborCostCents" INTEGER NOT NULL,
    "finalTotalCents" INTEGER NOT NULL,
    "estimatedCostCents" INTEGER,
    "estimatedMarginBps" INTEGER,
    "adjustmentReasonCode" TEXT,
    "adjustmentReasonText" TEXT,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "convertedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesQuote_quoteNo_key" ON "SalesQuote"("quoteNo");
CREATE UNIQUE INDEX "SalesQuote_convertedOrderId_key" ON "SalesQuote"("convertedOrderId");
CREATE INDEX "SalesQuote_storeId_status_createdAt_idx" ON "SalesQuote"("storeId", "status", "createdAt");
CREATE INDEX "SalesQuote_customerId_createdAt_idx" ON "SalesQuote"("customerId", "createdAt");
CREATE INDEX "SalesQuote_pricingCalculationId_idx" ON "SalesQuote"("pricingCalculationId");

CREATE TABLE "SalesQuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "salesUnit" "ProductUnit" NOT NULL,
    "basePriceCents" INTEGER NOT NULL,
    "suggestedUnitPriceCents" INTEGER NOT NULL,
    "finalUnitPriceCents" INTEGER NOT NULL,
    "suggestedAmountCents" INTEGER NOT NULL,
    "finalAmountCents" INTEGER NOT NULL,
    "minimumPriceCents" INTEGER,
    "calculationSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesQuoteItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesQuoteItem_quoteId_idx" ON "SalesQuoteItem"("quoteId");
CREATE INDEX "SalesQuoteItem_productId_idx" ON "SalesQuoteItem"("productId");

CREATE TABLE "PricingApproval" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "status" "PricingApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvalType" "PricingApprovalType" NOT NULL,
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "PricingApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PricingApproval_quoteId_status_idx" ON "PricingApproval"("quoteId", "status");
CREATE INDEX "PricingApproval_submittedById_submittedAt_idx" ON "PricingApproval"("submittedById", "submittedAt");

ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON UPDATE CASCADE;
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "CustomerVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_salesPersonId_fkey" FOREIGN KEY ("salesPersonId") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_pricingCalculationId_fkey" FOREIGN KEY ("pricingCalculationId") REFERENCES "PricingCalculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesQuoteItem" ADD CONSTRAINT "SalesQuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SalesQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesQuoteItem" ADD CONSTRAINT "SalesQuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON UPDATE CASCADE;
ALTER TABLE "PricingApproval" ADD CONSTRAINT "PricingApproval_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SalesQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingApproval" ADD CONSTRAINT "PricingApproval_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "PricingApproval" ADD CONSTRAINT "PricingApproval_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "CapacityReservationSourceType" AS ENUM ('QUOTE', 'ORDER');
CREATE TYPE "CapacityReservationStatus" AS ENUM ('HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED');

ALTER TABLE "SalesQuote" ADD COLUMN "appointmentDate" TIMESTAMP(3);
ALTER TABLE "SalesQuote" ADD COLUMN "appointmentTimeSlot" TEXT;
ALTER TABLE "SalesQuote" ADD COLUMN "constructionAddress" TEXT;

CREATE TABLE "CapacityReservation" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "dailyCapacityId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "constructionLocation" "ConstructionLocation" NOT NULL,
    "constructionType" "ConstructionType" NOT NULL,
    "sourceType" "CapacityReservationSourceType" NOT NULL,
    "quoteId" TEXT,
    "orderId" TEXT,
    "status" "CapacityReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3),
    "releasedReasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CapacityReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CapacityReservation_quoteId_key" ON "CapacityReservation"("quoteId");
CREATE UNIQUE INDEX "CapacityReservation_orderId_key" ON "CapacityReservation"("orderId");
CREATE INDEX "CapacityReservation_storeId_date_status_idx" ON "CapacityReservation"("storeId", "date", "status");
CREATE INDEX "CapacityReservation_expiresAt_status_idx" ON "CapacityReservation"("expiresAt", "status");

ALTER TABLE "CapacityReservation" ADD CONSTRAINT "CapacityReservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityReservation" ADD CONSTRAINT "CapacityReservation_dailyCapacityId_fkey" FOREIGN KEY ("dailyCapacityId") REFERENCES "DailyCapacity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityReservation" ADD CONSTRAINT "CapacityReservation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SalesQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapacityReservation" ADD CONSTRAINT "CapacityReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "DictionaryMode" AS ENUM ('LEGACY', 'NORMALIZED');
ALTER TABLE "Dictionary" ADD COLUMN "mode" "DictionaryMode" NOT NULL DEFAULT 'LEGACY';

CREATE TABLE "DictionaryItem" (
    "id" TEXT NOT NULL,
    "dictionaryId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "DictionaryStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DictionaryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DictionaryItem_dictionaryId_code_key" ON "DictionaryItem"("dictionaryId", "code");
CREATE INDEX "DictionaryItem_dictionaryId_status_sortOrder_idx" ON "DictionaryItem"("dictionaryId", "status", "sortOrder");
ALTER TABLE "DictionaryItem" ADD CONSTRAINT "DictionaryItem_dictionaryId_fkey" FOREIGN KEY ("dictionaryId") REFERENCES "Dictionary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
