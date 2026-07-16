-- Foundation for versioned construction charge/cost standards and the
-- manager-confirmed actual cost settlement workflow. All structures are
-- additive and have no effect until a store publishes a complete version.

CREATE TYPE "PositionCostRateVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');
CREATE TYPE "ConstructionCostSettlementStatus" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'SETTLED');
CREATE TYPE "ConstructionCostAdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SETTLED');

CREATE TABLE "ConstructionServiceItem" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "constructionTypeCode" TEXT NOT NULL,
  "serviceGroupCode" TEXT NOT NULL,
  "defaultProductCategoryCode" TEXT,
  "status" "DictionaryStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionServiceItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConstructionServiceItem_storeId_code_key" ON "ConstructionServiceItem"("storeId", "code");
CREATE INDEX "ConstructionServiceItem_storeId_status_serviceGroupCode_idx" ON "ConstructionServiceItem"("storeId", "status", "serviceGroupCode");

CREATE TABLE "PositionCostRateVersion" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "PositionCostRateVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PositionCostRateVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PositionCostRateVersion_storeId_version_key" ON "PositionCostRateVersion"("storeId", "version");
CREATE INDEX "PositionCostRateVersion_storeId_status_effectiveFrom_idx" ON "PositionCostRateVersion"("storeId", "status", "effectiveFrom");

CREATE TABLE "PositionCostRate" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "positionTypeCode" TEXT NOT NULL,
  "hourlyCostCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PositionCostRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PositionCostRate_versionId_positionTypeCode_key" ON "PositionCostRate"("versionId", "positionTypeCode");

ALTER TABLE "PricingRuleSet" ADD COLUMN "positionCostRateVersionId" TEXT;
CREATE INDEX "PricingRuleSet_positionCostRateVersionId_idx" ON "PricingRuleSet"("positionCostRateVersionId");

CREATE TABLE "ConstructionStandardLine" (
  "id" TEXT NOT NULL,
  "ruleSetId" TEXT NOT NULL,
  "serviceItemId" TEXT NOT NULL,
  "vehiclePriceClassId" TEXT,
  "constructionLocationCode" TEXT NOT NULL,
  "productCategoryCode" TEXT,
  "salesUnitCode" TEXT,
  "quantityFrom" DECIMAL(12,3),
  "quantityTo" DECIMAL(12,3),
  "baseConstructionChargeCents" INTEGER NOT NULL,
  "standardWorkMinutes" INTEGER NOT NULL,
  "addonChargeCents" INTEGER NOT NULL DEFAULT 0,
  "addonWorkMinutes" INTEGER NOT NULL DEFAULT 0,
  "standardCommissionCents" INTEGER NOT NULL DEFAULT 0,
  "standardAllowanceCents" INTEGER NOT NULL DEFAULT 0,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionStandardLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConstructionStandardLine_ruleSetId_enabled_priority_idx" ON "ConstructionStandardLine"("ruleSetId", "enabled", "priority");
CREATE INDEX "ConstructionStandardLine_serviceItemId_idx" ON "ConstructionStandardLine"("serviceItemId");

CREATE TABLE "ConstructionStandardCrewRole" (
  "id" TEXT NOT NULL,
  "standardLineId" TEXT NOT NULL,
  "positionTypeCode" TEXT NOT NULL,
  "workerCount" INTEGER NOT NULL,
  "workMinutes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionStandardCrewRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConstructionStandardCrewRole_standardLineId_positionTypeCode_key" ON "ConstructionStandardCrewRole"("standardLineId", "positionTypeCode");

CREATE TABLE "ConstructionCostSettlement" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "constructionRecordId" TEXT NOT NULL,
  "status" "ConstructionCostSettlementStatus" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  "standardWorkMinutes" INTEGER NOT NULL,
  "declaredWorkMinutes" INTEGER,
  "confirmedWorkMinutes" INTEGER NOT NULL,
  "estimatedMaterialCostCents" INTEGER,
  "estimatedConstructionCostCents" INTEGER,
  "actualMaterialCostCents" INTEGER NOT NULL DEFAULT 0,
  "actualConstructionCostCents" INTEGER NOT NULL DEFAULT 0,
  "actualTotalCostCents" INTEGER NOT NULL DEFAULT 0,
  "actualGrossProfitCents" INTEGER,
  "actualGrossMarginBps" INTEGER,
  "sourceSnapshot" JSONB NOT NULL,
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "settledById" TEXT,
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionCostSettlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConstructionCostSettlement_orderId_key" ON "ConstructionCostSettlement"("orderId");
CREATE UNIQUE INDEX "ConstructionCostSettlement_constructionRecordId_key" ON "ConstructionCostSettlement"("constructionRecordId");
CREATE INDEX "ConstructionCostSettlement_storeId_status_updatedAt_idx" ON "ConstructionCostSettlement"("storeId", "status", "updatedAt");

CREATE TABLE "ConstructionCostWorkerLine" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "workerUserId" TEXT NOT NULL,
  "positionTypeCode" TEXT NOT NULL,
  "standardMinutes" INTEGER NOT NULL,
  "declaredMinutes" INTEGER,
  "confirmedMinutes" INTEGER NOT NULL,
  "hourlyCostCentsSnapshot" INTEGER NOT NULL,
  "baseCostCents" INTEGER NOT NULL,
  "commissionCents" INTEGER NOT NULL DEFAULT 0,
  "allowanceCents" INTEGER NOT NULL DEFAULT 0,
  "varianceReasonCode" TEXT,
  "varianceReasonText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionCostWorkerLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConstructionCostWorkerLine_settlementId_workerUserId_key" ON "ConstructionCostWorkerLine"("settlementId", "workerUserId");
CREATE INDEX "ConstructionCostWorkerLine_workerUserId_idx" ON "ConstructionCostWorkerLine"("workerUserId");

CREATE TABLE "ConstructionCostAdjustment" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "adjustmentType" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "reasonText" TEXT,
  "status" "ConstructionCostAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConstructionCostAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ConstructionCostAdjustment_settlementId_status_idx" ON "ConstructionCostAdjustment"("settlementId", "status");

CREATE TABLE "OrderCostException" (
  "id" TEXT NOT NULL,
  "settlementId" TEXT NOT NULL,
  "exceptionType" TEXT NOT NULL,
  "expectedCents" INTEGER NOT NULL,
  "actualCents" INTEGER NOT NULL,
  "varianceCents" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "ownerId" TEXT,
  "resolution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderCostException_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderCostException_settlementId_status_idx" ON "OrderCostException"("settlementId", "status");

ALTER TABLE "ConstructionServiceItem" ADD CONSTRAINT "ConstructionServiceItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PositionCostRateVersion" ADD CONSTRAINT "PositionCostRateVersion_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PositionCostRate" ADD CONSTRAINT "PositionCostRate_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PositionCostRateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingRuleSet" ADD CONSTRAINT "PricingRuleSet_positionCostRateVersionId_fkey" FOREIGN KEY ("positionCostRateVersionId") REFERENCES "PositionCostRateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionStandardLine" ADD CONSTRAINT "ConstructionStandardLine_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "PricingRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionStandardLine" ADD CONSTRAINT "ConstructionStandardLine_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ConstructionServiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionStandardLine" ADD CONSTRAINT "ConstructionStandardLine_vehiclePriceClassId_fkey" FOREIGN KEY ("vehiclePriceClassId") REFERENCES "VehiclePriceClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConstructionStandardCrewRole" ADD CONSTRAINT "ConstructionStandardCrewRole_standardLineId_fkey" FOREIGN KEY ("standardLineId") REFERENCES "ConstructionStandardLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCostSettlement" ADD CONSTRAINT "ConstructionCostSettlement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCostSettlement" ADD CONSTRAINT "ConstructionCostSettlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCostSettlement" ADD CONSTRAINT "ConstructionCostSettlement_constructionRecordId_fkey" FOREIGN KEY ("constructionRecordId") REFERENCES "ConstructionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCostWorkerLine" ADD CONSTRAINT "ConstructionCostWorkerLine_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ConstructionCostSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionCostWorkerLine" ADD CONSTRAINT "ConstructionCostWorkerLine_workerUserId_fkey" FOREIGN KEY ("workerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionCostAdjustment" ADD CONSTRAINT "ConstructionCostAdjustment_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ConstructionCostSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderCostException" ADD CONSTRAINT "OrderCostException_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ConstructionCostSettlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
