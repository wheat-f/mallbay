-- CreateEnum
CREATE TYPE "AfterSaleStatus" AS ENUM ('OPEN', 'ASSIGNED', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AfterSaleResponsibility" AS ENUM ('PENDING', 'CUSTOMER', 'CONSTRUCTION', 'MATERIAL', 'STORE');

-- CreateEnum
CREATE TYPE "CommissionRuleType" AS ENUM ('FIXED_RATE', 'FIXED_AMOUNT', 'SALES_TIER', 'CONSTRUCTION_TYPE');

-- CreateTable
CREATE TABLE "AfterSale" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "warrantyId" TEXT,
    "customerId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "AfterSaleStatus" NOT NULL DEFAULT 'OPEN',
    "responsibility" "AfterSaleResponsibility" NOT NULL DEFAULT 'PENDING',
    "resolutionNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AfterSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfterSaleAssignment" (
    "id" TEXT NOT NULL,
    "afterSaleId" TEXT NOT NULL,
    "workerUserId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfterSaleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL,
    "afterSaleId" TEXT NOT NULL,
    "workerUserId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCommissionRule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" "CommissionRuleType" NOT NULL,
    "rateBasisPoints" INTEGER,
    "fixedAmountCents" INTEGER,
    "minSalesCents" INTEGER,
    "maxSalesCents" INTEGER,
    "constructionType" "ConstructionType",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesCommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesCommissionLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "salesUserId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "calculationNote" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesCommissionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerCommission" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "recordId" TEXT,
    "orderId" TEXT NOT NULL,
    "workerUserId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "adjustmentCents" INTEGER NOT NULL DEFAULT 0,
    "finalAmountCents" INTEGER NOT NULL,
    "calculationNote" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerCommission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AfterSale_storeId_status_idx" ON "AfterSale"("storeId", "status");

-- CreateIndex
CREATE INDEX "AfterSale_orderId_idx" ON "AfterSale"("orderId");

-- CreateIndex
CREATE INDEX "AfterSale_warrantyId_idx" ON "AfterSale"("warrantyId");

-- CreateIndex
CREATE INDEX "AfterSaleAssignment_workerUserId_idx" ON "AfterSaleAssignment"("workerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AfterSaleAssignment_afterSaleId_workerUserId_key" ON "AfterSaleAssignment"("afterSaleId", "workerUserId");

-- CreateIndex
CREATE INDEX "Penalty_afterSaleId_idx" ON "Penalty"("afterSaleId");

-- CreateIndex
CREATE INDEX "Penalty_workerUserId_idx" ON "Penalty"("workerUserId");

-- CreateIndex
CREATE INDEX "SalesCommissionRule_storeId_isActive_idx" ON "SalesCommissionRule"("storeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SalesCommissionLog_orderId_key" ON "SalesCommissionLog"("orderId");

-- CreateIndex
CREATE INDEX "SalesCommissionLog_storeId_idx" ON "SalesCommissionLog"("storeId");

-- CreateIndex
CREATE INDEX "SalesCommissionLog_salesUserId_idx" ON "SalesCommissionLog"("salesUserId");

-- CreateIndex
CREATE INDEX "WorkerCommission_storeId_idx" ON "WorkerCommission"("storeId");

-- CreateIndex
CREATE INDEX "WorkerCommission_recordId_idx" ON "WorkerCommission"("recordId");

-- CreateIndex
CREATE INDEX "WorkerCommission_workerUserId_idx" ON "WorkerCommission"("workerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCommission_orderId_workerUserId_key" ON "WorkerCommission"("orderId", "workerUserId");

-- AddForeignKey
ALTER TABLE "AfterSale" ADD CONSTRAINT "AfterSale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSale" ADD CONSTRAINT "AfterSale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSale" ADD CONSTRAINT "AfterSale_warrantyId_fkey" FOREIGN KEY ("warrantyId") REFERENCES "Warranty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSale" ADD CONSTRAINT "AfterSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSale" ADD CONSTRAINT "AfterSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSaleAssignment" ADD CONSTRAINT "AfterSaleAssignment_afterSaleId_fkey" FOREIGN KEY ("afterSaleId") REFERENCES "AfterSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSaleAssignment" ADD CONSTRAINT "AfterSaleAssignment_workerUserId_fkey" FOREIGN KEY ("workerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSaleAssignment" ADD CONSTRAINT "AfterSaleAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_afterSaleId_fkey" FOREIGN KEY ("afterSaleId") REFERENCES "AfterSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_workerUserId_fkey" FOREIGN KEY ("workerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommissionRule" ADD CONSTRAINT "SalesCommissionRule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommissionRule" ADD CONSTRAINT "SalesCommissionRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommissionLog" ADD CONSTRAINT "SalesCommissionLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommissionLog" ADD CONSTRAINT "SalesCommissionLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommissionLog" ADD CONSTRAINT "SalesCommissionLog_salesUserId_fkey" FOREIGN KEY ("salesUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesCommissionLog" ADD CONSTRAINT "SalesCommissionLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCommission" ADD CONSTRAINT "WorkerCommission_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCommission" ADD CONSTRAINT "WorkerCommission_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ConstructionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCommission" ADD CONSTRAINT "WorkerCommission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCommission" ADD CONSTRAINT "WorkerCommission_workerUserId_fkey" FOREIGN KEY ("workerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCommission" ADD CONSTRAINT "WorkerCommission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
