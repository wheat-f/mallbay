ALTER TABLE "AfterSale" ADD COLUMN "issuePhotoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AfterSale" ADD COLUMN "constructionPhotoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "AfterSale" ADD COLUMN "constructionIssueCategory" TEXT;
ALTER TABLE "AfterSale" ADD COLUMN "closedAt" TIMESTAMP(3);
