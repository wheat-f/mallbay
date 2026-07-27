-- 客户多车辆、企业对账、统一收款与合并开票的加法迁移。
CREATE TYPE "CustomerVehicleStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "VehicleChangeAction" AS ENUM ('CREATE', 'UPDATE', 'DISABLE', 'ENABLE', 'TRANSFER');
CREATE TYPE "CustomerContactRole" AS ENUM ('PRIMARY', 'SETTLEMENT', 'DRIVER', 'OTHER');
CREATE TYPE "CustomerStatementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'VOIDED');
CREATE TYPE "CustomerReceiptStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');

ALTER TABLE "CustomerUser"
  ADD COLUMN "role" "CustomerContactRole" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "department" TEXT,
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CustomerVehicle"
  ADD COLUMN "storeId" TEXT,
  ADD COLUMN "carPlateNormalized" TEXT,
  ADD COLUMN "status" "CustomerVehicleStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "defaultContactId" TEXT,
  ADD COLUMN "department" TEXT,
  ADD COLUMN "disabledAt" TIMESTAMP(3),
  ADD COLUMN "disabledById" TEXT,
  ADD COLUMN "disabledReason" TEXT;

UPDATE "CustomerVehicle" vehicle
SET "storeId" = customer."storeId",
    "carPlateNormalized" = NULLIF(REGEXP_REPLACE(UPPER(TRIM(vehicle."carPlate")), '\s+', '', 'g'), '')
FROM "Customer" customer
WHERE customer."id" = vehicle."customerId";

ALTER TABLE "CustomerVehicle" ALTER COLUMN "storeId" SET NOT NULL;

-- 第一阶段仅建立查询索引。历史重复车牌/VIN 必须先通过 db:preflight
-- 审计并清理，唯一约束由 prisma/constraints/customer_vehicle_identity.sql
-- 在第二阶段人工确认后执行，避免加法迁移因存量脏数据整体失败。
CREATE INDEX "CustomerVehicle_storeId_carPlateNormalized_idx"
  ON "CustomerVehicle"("storeId", "carPlateNormalized");
CREATE INDEX "CustomerVehicle_storeId_vinHash_idx"
  ON "CustomerVehicle"("storeId", "vinHash");
CREATE INDEX "CustomerVehicle_customerId_status_idx" ON "CustomerVehicle"("customerId", "status");
CREATE INDEX "CustomerVehicle_defaultContactId_idx" ON "CustomerVehicle"("defaultContactId");
CREATE INDEX "CustomerVehicle_disabledById_idx" ON "CustomerVehicle"("disabledById");

ALTER TABLE "CustomerVehicle"
  ADD CONSTRAINT "CustomerVehicle_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerVehicle_defaultContactId_fkey"
  FOREIGN KEY ("defaultContactId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerVehicle_disabledById_fkey"
  FOREIGN KEY ("disabledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VehicleOwnershipHistory" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "fromCustomerId" TEXT,
  "toCustomerId" TEXT NOT NULL,
  "action" "VehicleChangeAction" NOT NULL,
  "beforeSnapshot" JSONB,
  "afterSnapshot" JSONB,
  "reason" TEXT,
  "operatedById" TEXT NOT NULL,
  "operatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleOwnershipHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VehicleOwnershipHistory_vehicleId_operatedAt_idx" ON "VehicleOwnershipHistory"("vehicleId", "operatedAt");
CREATE INDEX "VehicleOwnershipHistory_storeId_operatedAt_idx" ON "VehicleOwnershipHistory"("storeId", "operatedAt");
CREATE INDEX "VehicleOwnershipHistory_fromCustomerId_idx" ON "VehicleOwnershipHistory"("fromCustomerId");
CREATE INDEX "VehicleOwnershipHistory_toCustomerId_idx" ON "VehicleOwnershipHistory"("toCustomerId");
ALTER TABLE "VehicleOwnershipHistory"
  ADD CONSTRAINT "VehicleOwnershipHistory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "VehicleOwnershipHistory_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "CustomerVehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "VehicleOwnershipHistory_fromCustomerId_fkey" FOREIGN KEY ("fromCustomerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "VehicleOwnershipHistory_toCustomerId_fkey" FOREIGN KEY ("toCustomerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "VehicleOwnershipHistory_operatedById_fkey" FOREIGN KEY ("operatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrderContactSnapshot" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sourceContactId" TEXT,
  "contactName" TEXT NOT NULL,
  "contactPhoneEncrypted" TEXT,
  "contactPhoneHash" TEXT,
  "role" "CustomerContactRole",
  "department" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderContactSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrderContactSnapshot_orderId_key" ON "OrderContactSnapshot"("orderId");
CREATE INDEX "OrderContactSnapshot_sourceContactId_idx" ON "OrderContactSnapshot"("sourceContactId");
ALTER TABLE "OrderContactSnapshot"
  ADD CONSTRAINT "OrderContactSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OrderContactSnapshot_sourceContactId_fkey" FOREIGN KEY ("sourceContactId") REFERENCES "CustomerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CustomerStatement" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "statementNo" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "receivableCents" INTEGER NOT NULL,
  "receivedCents" INTEGER NOT NULL,
  "outstandingCents" INTEGER NOT NULL,
  "status" "CustomerStatementStatus" NOT NULL DEFAULT 'DRAFT',
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerStatement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerStatement_statementNo_key" ON "CustomerStatement"("statementNo");
CREATE INDEX "CustomerStatement_storeId_customerId_periodStart_periodEnd_idx" ON "CustomerStatement"("storeId", "customerId", "periodStart", "periodEnd");
CREATE INDEX "CustomerStatement_storeId_status_idx" ON "CustomerStatement"("storeId", "status");
ALTER TABLE "CustomerStatement"
  ADD CONSTRAINT "CustomerStatement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerStatement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerStatement_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CustomerStatementItem" (
  "id" TEXT NOT NULL,
  "statementId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderAmountCents" INTEGER NOT NULL,
  "paidAmountCents" INTEGER NOT NULL,
  "outstandingCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerStatementItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerStatementItem_statementId_orderId_key" ON "CustomerStatementItem"("statementId", "orderId");
CREATE INDEX "CustomerStatementItem_orderId_idx" ON "CustomerStatementItem"("orderId");
ALTER TABLE "CustomerStatementItem"
  ADD CONSTRAINT "CustomerStatementItem_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CustomerStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerStatementItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CustomerReceipt" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "receiptNo" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "payerName" TEXT,
  "bankSerialNo" TEXT,
  "note" TEXT,
  "status" "CustomerReceiptStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "postedById" TEXT,
  "postedAt" TIMESTAMP(3),
  "reversedById" TEXT,
  "reversedAt" TIMESTAMP(3),
  "reversedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerReceipt_receiptNo_key" ON "CustomerReceipt"("receiptNo");
CREATE INDEX "CustomerReceipt_storeId_customerId_receivedAt_idx" ON "CustomerReceipt"("storeId", "customerId", "receivedAt");
CREATE INDEX "CustomerReceipt_storeId_status_idx" ON "CustomerReceipt"("storeId", "status");
CREATE INDEX "CustomerReceipt_accountId_idx" ON "CustomerReceipt"("accountId");
ALTER TABLE "CustomerReceipt"
  ADD CONSTRAINT "CustomerReceipt_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerReceipt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaymentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerReceipt_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerReceipt_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerReceipt_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderPayment" ADD COLUMN "customerReceiptId" TEXT;
CREATE INDEX "OrderPayment_customerReceiptId_idx" ON "OrderPayment"("customerReceiptId");
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_customerReceiptId_fkey"
  FOREIGN KEY ("customerReceiptId") REFERENCES "CustomerReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Invoice" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Invoice" ALTER COLUMN "orderId" DROP NOT NULL;
UPDATE "Invoice" invoice SET "customerId" = orders."customerId" FROM "Order" orders WHERE orders."id" = invoice."orderId";
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InvoiceOrderAllocation" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoiceOrderAllocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InvoiceOrderAllocation_invoiceId_orderId_key" ON "InvoiceOrderAllocation"("invoiceId", "orderId");
CREATE INDEX "InvoiceOrderAllocation_orderId_idx" ON "InvoiceOrderAllocation"("orderId");
ALTER TABLE "InvoiceOrderAllocation"
  ADD CONSTRAINT "InvoiceOrderAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "InvoiceOrderAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "InvoiceOrderAllocation" ("id", "invoiceId", "orderId", "amountCents", "createdAt")
SELECT 'legacy-invoice-allocation-' || "id", "id", "orderId", "amountCents", "createdAt"
FROM "Invoice"
WHERE "orderId" IS NOT NULL;
