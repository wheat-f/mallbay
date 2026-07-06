CREATE TYPE "AfterSalePhotoStage" AS ENUM ('ISSUE', 'CONSTRUCTION_AFTER', 'SUPPLEMENT');

CREATE TABLE "AfterSalePhoto" (
  "id" TEXT NOT NULL,
  "afterSaleId" TEXT NOT NULL,
  "stage" "AfterSalePhotoStage" NOT NULL,
  "url" TEXT NOT NULL,
  "note" TEXT,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AfterSalePhoto_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AfterSalePhoto" ("id", "afterSaleId", "stage", "url", "note", "uploadedById", "createdAt")
SELECT
  'legacy_issue_' || "AfterSale"."id" || '_' || legacy_photos.ordinality::TEXT,
  "AfterSale"."id",
  'ISSUE'::"AfterSalePhotoStage",
  legacy_photos.url,
  '由历史问题照片字段迁移',
  "AfterSale"."createdById",
  "AfterSale"."createdAt"
FROM "AfterSale"
CROSS JOIN LATERAL unnest("AfterSale"."issuePhotoUrls") WITH ORDINALITY AS legacy_photos(url, ordinality)
WHERE btrim(legacy_photos.url) <> '';

INSERT INTO "AfterSalePhoto" ("id", "afterSaleId", "stage", "url", "note", "uploadedById", "createdAt")
SELECT
  'legacy_after_' || "AfterSale"."id" || '_' || legacy_photos.ordinality::TEXT,
  "AfterSale"."id",
  'CONSTRUCTION_AFTER'::"AfterSalePhotoStage",
  legacy_photos.url,
  '由历史施工后照片字段迁移',
  "AfterSale"."createdById",
  "AfterSale"."updatedAt"
FROM "AfterSale"
CROSS JOIN LATERAL unnest("AfterSale"."constructionPhotoUrls") WITH ORDINALITY AS legacy_photos(url, ordinality)
WHERE btrim(legacy_photos.url) <> '';

CREATE INDEX "AfterSalePhoto_afterSaleId_stage_createdAt_idx" ON "AfterSalePhoto"("afterSaleId", "stage", "createdAt");
CREATE INDEX "AfterSalePhoto_uploadedById_idx" ON "AfterSalePhoto"("uploadedById");

ALTER TABLE "AfterSalePhoto" ADD CONSTRAINT "AfterSalePhoto_afterSaleId_fkey" FOREIGN KEY ("afterSaleId") REFERENCES "AfterSale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AfterSalePhoto" ADD CONSTRAINT "AfterSalePhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
