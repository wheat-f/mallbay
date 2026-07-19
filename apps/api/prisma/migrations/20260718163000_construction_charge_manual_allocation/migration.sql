-- 店长可在确认施工成本时按人员直接分配对客施工收费；空值表示按确认工时比例分配。
ALTER TABLE "ConstructionCostWorkerLine"
ADD COLUMN "manualConstructionChargeCents" INTEGER;
