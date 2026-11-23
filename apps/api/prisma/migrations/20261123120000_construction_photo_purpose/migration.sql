ALTER TABLE "ConstructionPhoto" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "PurchaseReceiptCostRecord" ADD COLUMN "inspectionPhotoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
