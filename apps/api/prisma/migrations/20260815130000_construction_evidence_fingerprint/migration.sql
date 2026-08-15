-- Persist the evidence command's normalized input and lifecycle status so
-- retries can distinguish a replay from a conflicting business intent.
DO $$
BEGIN
  CREATE TYPE "ConstructionEvidenceStatus" AS ENUM ('APPLIED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ConstructionPhoto"
  ADD COLUMN IF NOT EXISTS "requestFingerprint" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "status" "ConstructionEvidenceStatus" NOT NULL DEFAULT 'APPLIED';
