CREATE TYPE "OrderAmendmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "OrderAmount"
  ADD COLUMN "settlementDifferenceCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "OrderAmendmentRequest" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderAmendmentStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderAmendmentRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderAmendmentRequest_orderId_status_idx" ON "OrderAmendmentRequest"("orderId", "status");
CREATE INDEX "OrderAmendmentRequest_storeId_status_idx" ON "OrderAmendmentRequest"("storeId", "status");
CREATE INDEX "OrderAmendmentRequest_requestedById_idx" ON "OrderAmendmentRequest"("requestedById");

ALTER TABLE "OrderAmendmentRequest" ADD CONSTRAINT "OrderAmendmentRequest_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderAmendmentRequest" ADD CONSTRAINT "OrderAmendmentRequest_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderAmendmentRequest" ADD CONSTRAINT "OrderAmendmentRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderAmendmentRequest" ADD CONSTRAINT "OrderAmendmentRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
