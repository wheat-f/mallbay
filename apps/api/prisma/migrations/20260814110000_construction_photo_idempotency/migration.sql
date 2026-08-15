ALTER TABLE "ConstructionPhoto" ADD COLUMN "clientOperationId" TEXT;

CREATE UNIQUE INDEX "ConstructionPhoto_clientOperationId_key"
  ON "ConstructionPhoto"("clientOperationId");
