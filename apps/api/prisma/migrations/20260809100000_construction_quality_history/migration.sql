CREATE TABLE "ConstructionQualityHistory" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "result" "QualityCheckResult" NOT NULL,
  "note" TEXT,
  "responsibilityType" TEXT,
  "checkedById" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  "revokedById" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConstructionQualityHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConstructionQualityHistory_recordId_checkedAt_idx"
  ON "ConstructionQualityHistory"("recordId", "checkedAt");
CREATE INDEX "ConstructionQualityHistory_storeId_checkedAt_idx"
  ON "ConstructionQualityHistory"("storeId", "checkedAt");
CREATE INDEX "ConstructionQualityHistory_orderId_checkedAt_idx"
  ON "ConstructionQualityHistory"("orderId", "checkedAt");

ALTER TABLE "ConstructionQualityHistory"
  ADD CONSTRAINT "ConstructionQualityHistory_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionQualityHistory"
  ADD CONSTRAINT "ConstructionQualityHistory_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "ConstructionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionQualityHistory"
  ADD CONSTRAINT "ConstructionQualityHistory_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConstructionQualityHistory"
  ADD CONSTRAINT "ConstructionQualityHistory_checkedById_fkey"
  FOREIGN KEY ("checkedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ConstructionQualityHistory"
  ADD CONSTRAINT "ConstructionQualityHistory_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
