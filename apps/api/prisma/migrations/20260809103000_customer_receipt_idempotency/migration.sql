ALTER TABLE "CustomerReceipt" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "CustomerReceiptReversal" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "PaymentRecord" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "CustomerReceipt_storeId_idempotencyKey_key"
  ON "CustomerReceipt"("storeId", "idempotencyKey");
CREATE UNIQUE INDEX "CustomerReceiptReversal_receiptId_idempotencyKey_key"
  ON "CustomerReceiptReversal"("receiptId", "idempotencyKey");
CREATE UNIQUE INDEX "PaymentRecord_storeId_idempotencyKey_key"
  ON "PaymentRecord"("storeId", "idempotencyKey");
