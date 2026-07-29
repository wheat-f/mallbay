CREATE TABLE "DictionaryTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "status" "DictionaryStatus" NOT NULL DEFAULT 'ACTIVE',
  "allowCustomItems" BOOLEAN NOT NULL DEFAULT false,
  "allowDisableItems" BOOLEAN NOT NULL DEFAULT true,
  "allowHierarchy" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DictionaryTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DictionaryTemplate_code_key" ON "DictionaryTemplate"("code");
CREATE INDEX "DictionaryTemplate_status_updatedAt_idx" ON "DictionaryTemplate"("status", "updatedAt");

CREATE TABLE "DictionaryTemplateItem" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "DictionaryStatus" NOT NULL DEFAULT 'ACTIVE',
  "metadata" JSONB,
  "parentId" TEXT,
  "disabledReason" TEXT,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DictionaryTemplateItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DictionaryTemplateItem_templateId_code_key" ON "DictionaryTemplateItem"("templateId", "code");
CREATE INDEX "DictionaryTemplateItem_templateId_status_sortOrder_idx" ON "DictionaryTemplateItem"("templateId", "status", "sortOrder");
CREATE INDEX "DictionaryTemplateItem_templateId_parentId_status_sortOrder_idx" ON "DictionaryTemplateItem"("templateId", "parentId", "status", "sortOrder");
ALTER TABLE "DictionaryTemplateItem" ADD CONSTRAINT "DictionaryTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DictionaryTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DictionaryTemplateItem" ADD CONSTRAINT "DictionaryTemplateItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DictionaryTemplateItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;