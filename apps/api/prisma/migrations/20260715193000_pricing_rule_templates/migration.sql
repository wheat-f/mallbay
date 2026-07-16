-- Headquarters pricing templates and immutable template versions.
CREATE TYPE "PricingTemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

CREATE TABLE "PricingRuleTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "PricingTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingRuleTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PricingRuleTemplate_code_key" ON "PricingRuleTemplate"("code");
CREATE INDEX "PricingRuleTemplate_status_updatedAt_idx" ON "PricingRuleTemplate"("status", "updatedAt");

CREATE TABLE "PricingRuleTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "protectionPolicy" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PricingRuleTemplateVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PricingRuleTemplateVersion_templateId_version_key" ON "PricingRuleTemplateVersion"("templateId", "version");
CREATE INDEX "PricingRuleTemplateVersion_templateId_publishedAt_idx" ON "PricingRuleTemplateVersion"("templateId", "publishedAt");
ALTER TABLE "PricingRuleTemplate" ADD CONSTRAINT "PricingRuleTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingRuleTemplateVersion" ADD CONSTRAINT "PricingRuleTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PricingRuleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PricingRuleTemplateVersion" ADD CONSTRAINT "PricingRuleTemplateVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PricingRuleTemplateVersion" ADD CONSTRAINT "PricingRuleTemplateVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
