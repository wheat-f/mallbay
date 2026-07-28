-- Dictionary configuration v2: source, hierarchy and item-level lifecycle controls.
CREATE TYPE "DictionarySource" AS ENUM ('SYSTEM', 'HQ_TEMPLATE', 'STORE');
ALTER TABLE "Dictionary" ADD COLUMN "source" "DictionarySource" NOT NULL DEFAULT 'STORE';
ALTER TABLE "Dictionary" ADD COLUMN "allowCustomItems" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Dictionary" ADD COLUMN "allowDisableItems" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Dictionary" ADD COLUMN "allowHierarchy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Dictionary" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Dictionary" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "DictionaryItem" ADD COLUMN "parentId" TEXT;
ALTER TABLE "DictionaryItem" ADD COLUMN "source" "DictionarySource" NOT NULL DEFAULT 'STORE';
ALTER TABLE "DictionaryItem" ADD COLUMN "disabledReason" TEXT;
ALTER TABLE "DictionaryItem" ADD COLUMN "usageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DictionaryItem" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "DictionaryItem" ADD CONSTRAINT "DictionaryItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DictionaryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DictionaryItem_dictionaryId_parentId_status_sortOrder_idx" ON "DictionaryItem"("dictionaryId", "parentId", "status", "sortOrder");
UPDATE "Dictionary" SET "source" = 'SYSTEM', "allowCustomItems" = false, "allowDisableItems" = true WHERE "code" IN ('CONSTRUCTION_TYPE','CONSTRUCTION_LOCATION','CONSTRUCTION_POSITION_TYPE','CONSTRUCTION_TIME_VARIANCE_REASON','CONSTRUCTION_COST_ADJUSTMENT_REASON','CONSTRUCTION_COST_EXCEPTION_REASON','CONSTRUCTION_ALLOWANCE_TYPE','PRODUCT_CATEGORY','PRODUCT_UNIT','VEHICLE_TYPE');
UPDATE "DictionaryItem" item SET "source" = 'SYSTEM' FROM "Dictionary" d WHERE item."dictionaryId" = d."id" AND d."source" = 'SYSTEM';