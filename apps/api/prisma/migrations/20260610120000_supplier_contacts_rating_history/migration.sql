-- Supplier contacts and rating history for V1.7 supplier archive requirements.
CREATE TABLE "SupplierContact" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierRatingHistory" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierRatingHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierContact_supplierId_isActive_idx" ON "SupplierContact"("supplierId", "isActive");
CREATE INDEX "SupplierContact_createdById_idx" ON "SupplierContact"("createdById");
CREATE INDEX "SupplierRatingHistory_supplierId_createdAt_idx" ON "SupplierRatingHistory"("supplierId", "createdAt");
CREATE INDEX "SupplierRatingHistory_createdById_idx" ON "SupplierRatingHistory"("createdById");

ALTER TABLE "SupplierContact"
  ADD CONSTRAINT "SupplierContact_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierContact"
  ADD CONSTRAINT "SupplierContact_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierRatingHistory"
  ADD CONSTRAINT "SupplierRatingHistory_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierRatingHistory"
  ADD CONSTRAINT "SupplierRatingHistory_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
