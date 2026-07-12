-- Customer archive enhancements: structured notes and custom tags.
CREATE TYPE "CustomerNoteType" AS ENUM ('PREFERENCE', 'REQUIREMENT', 'COMMUNICATION');

ALTER TABLE "CustomerNote"
  ADD COLUMN "noteType" "CustomerNoteType" NOT NULL DEFAULT 'COMMUNICATION';

DROP INDEX IF EXISTS "CustomerNote_customerId_createdAt_idx";

CREATE TABLE "CustomerTag" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerTag_customerId_label_key" ON "CustomerTag"("customerId", "label");
CREATE INDEX "CustomerTag_customerId_idx" ON "CustomerTag"("customerId");
CREATE INDEX "CustomerNote_customerId_noteType_createdAt_idx" ON "CustomerNote"("customerId", "noteType", "createdAt");

ALTER TABLE "CustomerTag"
  ADD CONSTRAINT "CustomerTag_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerTag"
  ADD CONSTRAINT "CustomerTag_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
