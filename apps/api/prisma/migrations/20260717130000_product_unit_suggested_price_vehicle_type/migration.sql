ALTER TABLE "CustomerVehicle"
  ADD COLUMN "vehicleTypeCode" TEXT;

CREATE INDEX "CustomerVehicle_vehicleTypeCode_idx"
  ON "CustomerVehicle"("vehicleTypeCode");

CREATE TABLE "ProductUnitSuggestedPrice" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "salesUnit" "ProductUnit" NOT NULL,
  "suggestedPriceCents" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductUnitSuggestedPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductUnitSuggestedPrice_productId_salesUnit_key"
  ON "ProductUnitSuggestedPrice"("productId", "salesUnit");
CREATE INDEX "ProductUnitSuggestedPrice_productId_isActive_idx"
  ON "ProductUnitSuggestedPrice"("productId", "isActive");

ALTER TABLE "ProductUnitSuggestedPrice"
  ADD CONSTRAINT "ProductUnitSuggestedPrice_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
