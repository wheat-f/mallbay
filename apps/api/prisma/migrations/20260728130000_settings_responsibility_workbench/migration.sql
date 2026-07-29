CREATE TYPE "SettingsConfigDomain" AS ENUM ('HQ', 'STORE', 'FINANCE', 'OWN');
CREATE TYPE "SettingsConfigStatus" AS ENUM ('DRAFT', 'VALIDATING', 'VALIDATION_FAILED', 'PUBLISHED', 'EXPIRED', 'WITHDRAWN');
CREATE TABLE "SettingsConfigVersion" (
  "id" TEXT NOT NULL,
  "domain" "SettingsConfigDomain" NOT NULL,
  "capabilityCode" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "SettingsConfigStatus" NOT NULL DEFAULT 'DRAFT',
  "effectiveAt" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "validationErrors" JSONB,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,
  "publishedById" TEXT,
  "publishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SettingsConfigVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SettingsConfigVersion_domain_scopeId_status_idx" ON "SettingsConfigVersion"("domain", "scopeId", "status");
CREATE INDEX "SettingsConfigVersion_capabilityCode_scopeId_version_idx" ON "SettingsConfigVersion"("capabilityCode", "scopeId", "version");
CREATE INDEX "SettingsConfigVersion_createdById_createdAt_idx" ON "SettingsConfigVersion"("createdById", "createdAt" DESC);