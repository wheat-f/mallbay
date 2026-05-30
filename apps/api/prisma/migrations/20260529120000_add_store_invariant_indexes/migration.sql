-- Run `pnpm --filter @mallbay/api db:preflight` before deploying this migration.
-- These partial unique indexes move critical store workflow invariants from application comments
-- into PostgreSQL-enforced constraints.

CREATE UNIQUE INDEX "StorePhoto_one_cover_per_store_uidx"
  ON "StorePhoto"("storeId")
  WHERE "isCover" = true;

CREATE UNIQUE INDEX "StoreAuditSubmission_one_pending_per_store_uidx"
  ON "StoreAuditSubmission"("storeId")
  WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "StoreSubmissionPhoto_one_cover_per_submission_uidx"
  ON "StoreSubmissionPhoto"("submissionId")
  WHERE "isCover" = true;
