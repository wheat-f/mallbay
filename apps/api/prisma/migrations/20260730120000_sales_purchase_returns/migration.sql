ALTER TYPE "PaymentRecordType" ADD VALUE IF NOT EXISTS 'SUPPLIER_REFUND_OUT';
ALTER TYPE "PaymentRecordType" ADD VALUE IF NOT EXISTS 'SUPPLIER_REFUND_REVERSAL';
ALTER TYPE "PaymentDirection" ADD VALUE IF NOT EXISTS 'OUTFLOW';
ALTER TYPE "PaymentDirection" ADD VALUE IF NOT EXISTS 'INFLOW';

CREATE TYPE "SalesReturnStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'WAITING_RECEIPT', 'PARTIAL_RECEIVED', 'WAITING_REFUND', 'PARTIAL_REFUND', 'REFUNDED', 'CANCELLED', 'PARTIAL_CANCELLED', 'CLOSED', 'REJECTED');
CREATE TYPE "PurchaseReturnStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'WAITING_OUTBOUND', 'PARTIAL_OUTBOUND', 'WAITING_SETTLEMENT', 'PARTIAL_SETTLEMENT', 'SETTLED', 'CANCELLED', 'PARTIAL_CANCELLED', 'CLOSED', 'REJECTED');
CREATE TYPE "ReturnMode" AS ENUM ('PHYSICAL_RETURN', 'REFUND_ONLY');
CREATE TYPE "SettlementAdjustmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REVERSED');

CREATE TABLE "SalesReturn" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "returnNo" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "SalesReturnStatus" NOT NULL DEFAULT 'DRAFT',
  "returnMode" "ReturnMode" NOT NULL DEFAULT 'PHYSICAL_RETURN',
  "reason" TEXT NOT NULL,
  "totalRefundCents" INTEGER NOT NULL DEFAULT 0,
  "actualRefundCents" INTEGER,
  "refundMethod" TEXT,
  "voucherId" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SalesReturn_returnNo_key" ON "SalesReturn"("returnNo");
CREATE INDEX "SalesReturn_storeId_status_createdAt_idx" ON "SalesReturn"("storeId", "status", "createdAt");
CREATE INDEX "SalesReturn_orderId_idx" ON "SalesReturn"("orderId");

CREATE TABLE "SalesReturnDetail" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "receivedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "unitPriceCents" INTEGER NOT NULL,
  "refundAmountCents" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'WAITING_INSPECTION',
  "inventoryBatchId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesReturnDetail_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesReturnDetail_returnId_idx" ON "SalesReturnDetail"("returnId");
CREATE INDEX "SalesReturnDetail_orderItemId_idx" ON "SalesReturnDetail"("orderItemId");

CREATE TABLE "PurchaseReturn" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "returnNo" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "supplierId" TEXT,
  "supplierName" TEXT,
  "status" "PurchaseReturnStatus" NOT NULL DEFAULT 'DRAFT',
  "returnMode" "ReturnMode" NOT NULL DEFAULT 'PHYSICAL_RETURN',
  "reason" TEXT NOT NULL,
  "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
  "refundAmountCents" INTEGER NOT NULL DEFAULT 0,
  "payableOffsetCents" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "financeApprovedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseReturn_returnNo_key" ON "PurchaseReturn"("returnNo");
CREATE INDEX "PurchaseReturn_storeId_status_createdAt_idx" ON "PurchaseReturn"("storeId", "status", "createdAt");
CREATE INDEX "PurchaseReturn_purchaseOrderId_idx" ON "PurchaseReturn"("purchaseOrderId");

CREATE TABLE "PurchaseReturnDetail" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "purchaseOrderItemId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "outboundQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "unitCostCents" INTEGER NOT NULL,
  "refundAmountCents" INTEGER NOT NULL,
  "payableOffsetCents" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchaseReturnDetail_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PurchaseReturnDetail_returnId_idx" ON "PurchaseReturnDetail"("returnId");
CREATE INDEX "PurchaseReturnDetail_batchId_idx" ON "PurchaseReturnDetail"("batchId");
CREATE INDEX "PurchaseReturnDetail_purchaseOrderItemId_idx" ON "PurchaseReturnDetail"("purchaseOrderItemId");

CREATE TABLE "SupplierReturnSettlementAdjustment" (
  "id" TEXT NOT NULL,
  "purchaseReturnId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "refundAmountCents" INTEGER NOT NULL DEFAULT 0,
  "payableOffsetCents" INTEGER NOT NULL DEFAULT 0,
  "status" "SettlementAdjustmentStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "createdById" TEXT NOT NULL,
  "confirmedById" TEXT,
  "reversedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  CONSTRAINT "SupplierReturnSettlementAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierReturnSettlementAdjustment_purchaseReturnId_status_idx" ON "SupplierReturnSettlementAdjustment"("purchaseReturnId", "status");

CREATE TABLE "ReturnAction" (
  "id" TEXT NOT NULL,
  "returnType" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
  "actorId" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnAction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReturnAction_returnType_action_idempotencyKey_key" ON "ReturnAction"("returnType", "action", "idempotencyKey");
CREATE INDEX "ReturnAction_returnType_returnId_createdAt_idx" ON "ReturnAction"("returnType", "returnId", "createdAt");

CREATE TYPE "InventoryStatus" AS ENUM ('AVAILABLE', 'INSPECTION', 'DAMAGED');
CREATE TYPE "InspectionApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'EXECUTED', 'REJECTED');
CREATE TYPE "CostVerificationStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'REJECTED');
CREATE TYPE "ReturnFinancialAdjustmentType" AS ENUM ('REVENUE_REVERSAL', 'MATERIAL_COST_REVERSAL', 'COMMISSION_REVERSAL', 'RECEIPT_REVERSAL', 'COST_DIFFERENCE');

ALTER TABLE "InventoryBatch" ADD COLUMN "inventoryStatus" "InventoryStatus" NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE "InventoryMovement" ADD COLUMN "returnId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "sourceDetailId" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN "executionStoreId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalesReturn" ADD COLUMN "afterSaleId" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN "requestedRefundCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesReturn" ADD COLUMN "approvedRefundCents" INTEGER;
ALTER TABLE "SalesReturn" ADD COLUMN "refundedAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesReturn" ADD COLUMN "waivedRefundCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesReturn" ADD COLUMN "remainingRefundCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesReturn" ADD COLUMN "waiverReason" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN "costAdjustmentId" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN "refundedById" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "SalesReturn" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN "closedAt" TIMESTAMP(3);
CREATE INDEX "SalesReturn_executionStoreId_status_createdAt_idx" ON "SalesReturn"("executionStoreId", "status", "createdAt");

ALTER TABLE "SalesReturnDetail" ADD COLUMN "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SalesReturnDetail" ADD COLUMN "approvedQuantity" DECIMAL(12,3);
ALTER TABLE "SalesReturnDetail" ADD COLUMN "refundEligibleQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "SalesReturnDetail" ADD COLUMN "refundedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "SalesReturnDetail" ADD COLUMN "salesUnit" "ProductUnit";
ALTER TABLE "SalesReturnDetail" ADD COLUMN "costAdjustmentCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesReturnDetail" ADD COLUMN "inspectionStatus" "InventoryStatus";
ALTER TABLE "SalesReturnDetail" ADD COLUMN "inspectionApprovalStatus" "InspectionApprovalStatus";
ALTER TABLE "SalesReturnDetail" ADD COLUMN "inspectionApprovedQuantity" DECIMAL(12,3);
ALTER TABLE "SalesReturnDetail" ADD COLUMN "inspectionApprovedById" TEXT;
ALTER TABLE "SalesReturnDetail" ADD COLUMN "inspectionApprovedAt" TIMESTAMP(3);
ALTER TABLE "SalesReturnDetail" ADD COLUMN "sourceOutboundBatchId" TEXT;
ALTER TABLE "SalesReturnDetail" ADD COLUMN "costStatus" "CostVerificationStatus";
ALTER TABLE "SalesReturnDetail" ADD COLUMN "verifiedUnitCostCents" INTEGER;
ALTER TABLE "SalesReturnDetail" ADD COLUMN "costVerificationReason" TEXT;
CREATE INDEX "SalesReturnDetail_productId_idx" ON "SalesReturnDetail"("productId");
CREATE INDEX "SalesReturnDetail_sourceOutboundBatchId_idx" ON "SalesReturnDetail"("sourceOutboundBatchId");

ALTER TABLE "PurchaseReturn" ADD COLUMN "executionStoreId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseReturn" ADD COLUMN "settlementMode" TEXT NOT NULL DEFAULT 'PAYABLE_OFFSET';
ALTER TABLE "PurchaseReturn" ADD COLUMN "requestedAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseReturn" ADD COLUMN "confirmedAmountCents" INTEGER;
ALTER TABLE "PurchaseReturn" ADD COLUMN "settledAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseReturn" ADD COLUMN "businessApprovedById" TEXT;
ALTER TABLE "PurchaseReturn" ADD COLUMN "financialApprovedById" TEXT;
ALTER TABLE "PurchaseReturn" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "PurchaseReturn" ADD COLUMN "closedAt" TIMESTAMP(3);
CREATE INDEX "PurchaseReturn_executionStoreId_status_createdAt_idx" ON "PurchaseReturn"("executionStoreId", "status", "createdAt");

ALTER TABLE "PurchaseReturnDetail" ADD COLUMN "productId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PurchaseReturnDetail" ADD COLUMN "approvedQuantity" DECIMAL(12,3);

CREATE INDEX "PurchaseReturnDetail_productId_idx" ON "PurchaseReturnDetail"("productId");

ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "sequenceNo" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "settlementMode" TEXT NOT NULL DEFAULT 'PAYABLE_OFFSET';
ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "payableOffsetAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "exchangeQuantity" DECIMAL(12,3);
ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "exchangeAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "supplierDocumentNo" TEXT;
ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "differenceReason" TEXT;
ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "paymentRecordId" TEXT;
ALTER TABLE "SupplierReturnSettlementAdjustment" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "SupplierReturnSettlementAdjustment_purchaseReturnId_sequenceNo_key" ON "SupplierReturnSettlementAdjustment"("purchaseReturnId", "sequenceNo");

ALTER TABLE "ReturnAction" ADD COLUMN "actionType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ReturnAction" ADD COLUMN "returnDetailId" TEXT;
ALTER TABLE "ReturnAction" ADD COLUMN "batchId" TEXT;
ALTER TABLE "ReturnAction" ADD COLUMN "targetStatus" TEXT;
ALTER TABLE "ReturnAction" ADD COLUMN "approvedQuantity" DECIMAL(12,3);
ALTER TABLE "ReturnAction" ADD COLUMN "approvalType" TEXT;
ALTER TABLE "ReturnAction" ADD COLUMN "settlementAdjustmentId" TEXT;
ALTER TABLE "ReturnAction" ADD COLUMN "requestSummary" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ReturnAction" ADD COLUMN "resultSummary" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ReturnAction" ALTER COLUMN "idempotencyKey" SET DEFAULT '';
ALTER TABLE "ReturnAction" ALTER COLUMN "idempotencyKey" SET NOT NULL;
CREATE UNIQUE INDEX "ReturnAction_returnType_returnId_actionType_idempotencyKey_key" ON "ReturnAction"("returnType", "returnId", "actionType", "idempotencyKey");

ALTER TABLE "PaymentRecord" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "PaymentRecord" ADD COLUMN "reversalOfId" TEXT;
ALTER TABLE "PaymentRecord" ADD COLUMN "reversedById" TEXT;
CREATE UNIQUE INDEX "PaymentRecord_reversalOfId_key" ON "PaymentRecord"("reversalOfId");
CREATE UNIQUE INDEX "PaymentRecord_reversedById_key" ON "PaymentRecord"("reversedById");
CREATE INDEX "PaymentRecord_sourceType_sourceId_idx" ON "PaymentRecord"("sourceType", "sourceId");

CREATE TABLE "ReturnFinancialAdjustment" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "returnType" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "returnDetailId" TEXT,
  "type" "ReturnFinancialAdjustmentType" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "originalValue" JSONB NOT NULL DEFAULT '{}',
  "newValue" JSONB NOT NULL DEFAULT '{}',
  "calculationBasis" JSONB NOT NULL DEFAULT '{}',
  "idempotencyKey" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnFinancialAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReturnFinancialAdjustment_returnType_returnId_type_idempotencyKey_key" ON "ReturnFinancialAdjustment"("returnType", "returnId", "type", "idempotencyKey");
CREATE INDEX "ReturnFinancialAdjustment_returnType_returnId_createdAt_idx" ON "ReturnFinancialAdjustment"("returnType", "returnId", "createdAt");
CREATE UNIQUE INDEX "SupplierReturnSettlementAdjustment_purchaseReturnId_idempotencyKey_key" ON "SupplierReturnSettlementAdjustment"("purchaseReturnId", "idempotencyKey");

ALTER TABLE "ReturnAction" ALTER COLUMN "action" SET DEFAULT '';
ALTER TABLE "SupplierReturnSettlementAdjustment" ALTER COLUMN "mode" SET DEFAULT 'PAYABLE_OFFSET';
