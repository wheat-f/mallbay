-- 采购员是采购单的业务责任人；创建人继续保留为审计字段。
ALTER TABLE "PurchaseOrder" ADD COLUMN "purchaserId" TEXT;

-- 历史采购单由原创建人承接，避免迁移后出现无责任人的单据。
UPDATE "PurchaseOrder" SET "purchaserId" = "createdById" WHERE "purchaserId" IS NULL;

ALTER TABLE "PurchaseOrder" ALTER COLUMN "purchaserId" SET NOT NULL;

CREATE INDEX "PurchaseOrder_storeId_purchaserId_idx" ON "PurchaseOrder"("storeId", "purchaserId");

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_purchaserId_fkey"
  FOREIGN KEY ("purchaserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
