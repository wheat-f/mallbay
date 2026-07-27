-- 企业统一收款红冲：现金流水与订单分摊分离，支持部分红冲和逐单追溯。
ALTER TYPE "PaymentRecordType" ADD VALUE IF NOT EXISTS 'CUSTOMER_RECEIPT';
ALTER TYPE "PaymentRecordType" ADD VALUE IF NOT EXISTS 'CUSTOMER_RECEIPT_REVERSAL';

CREATE TABLE "CustomerReceiptReversal" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerReceiptReversal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerReceiptReversalAllocation" (
  "id" TEXT NOT NULL,
  "reversalId" TEXT NOT NULL,
  "orderPaymentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerReceiptReversalAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerReceiptReversal_receiptId_createdAt_idx" ON "CustomerReceiptReversal"("receiptId", "createdAt");
CREATE INDEX "CustomerReceiptReversal_createdById_idx" ON "CustomerReceiptReversal"("createdById");
CREATE UNIQUE INDEX "CustomerReceiptReversalAllocation_reversalId_orderPaymentId_key" ON "CustomerReceiptReversalAllocation"("reversalId", "orderPaymentId");
CREATE INDEX "CustomerReceiptReversalAllocation_orderPaymentId_idx" ON "CustomerReceiptReversalAllocation"("orderPaymentId");
CREATE INDEX "CustomerReceiptReversalAllocation_orderId_idx" ON "CustomerReceiptReversalAllocation"("orderId");

ALTER TABLE "CustomerReceiptReversal"
  ADD CONSTRAINT "CustomerReceiptReversal_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "CustomerReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerReceiptReversal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerReceiptReversalAllocation"
  ADD CONSTRAINT "CustomerReceiptReversalAllocation_reversalId_fkey" FOREIGN KEY ("reversalId") REFERENCES "CustomerReceiptReversal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerReceiptReversalAllocation_orderPaymentId_fkey" FOREIGN KEY ("orderPaymentId") REFERENCES "OrderPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CustomerReceiptReversalAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

