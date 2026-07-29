CREATE TYPE "SettingsMigrationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');
CREATE TYPE "SettingsMigrationReviewStatus" AS ENUM ('PENDING', 'RESOLVED', 'IGNORED');

CREATE TABLE "SettingsMigrationRun" (
  "id" TEXT NOT NULL,
  "runKey" TEXT NOT NULL,
  "status" "SettingsMigrationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "backupFile" TEXT,
  "featureFlag" TEXT NOT NULL,
  "checkpoint" JSONB NOT NULL DEFAULT '{}',
  "summary" JSONB,
  "errorMessage" TEXT,
  "createdById" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "rolledBackAt" TIMESTAMP(3),
  CONSTRAINT "SettingsMigrationRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SettingsMigrationRun_runKey_key" ON "SettingsMigrationRun"("runKey");
CREATE INDEX "SettingsMigrationRun_status_startedAt_idx" ON "SettingsMigrationRun"("status", "startedAt" DESC);

CREATE TABLE "SettingsMigrationReview" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" "SettingsMigrationReviewStatus" NOT NULL DEFAULT 'PENDING',
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SettingsMigrationReview_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SettingsMigrationReview_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SettingsMigrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SettingsMigrationReview_runId_sourceType_sourceId_key" ON "SettingsMigrationReview"("runId", "sourceType", "sourceId");
CREATE INDEX "SettingsMigrationReview_status_createdAt_idx" ON "SettingsMigrationReview"("status", "createdAt" DESC);