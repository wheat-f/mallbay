ALTER TABLE "CustomerStatement" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "CustomerStatement_storeId_idempotencyKey_key"
ON "CustomerStatement"("storeId", "idempotencyKey");

