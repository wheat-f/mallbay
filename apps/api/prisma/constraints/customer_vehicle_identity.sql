-- 客户车辆身份唯一约束（二阶段）。
-- 执行前必须先运行：pnpm --filter @mallbay/api db:preflight
-- 仅在所有 customer_vehicle_* 阻断项清零后执行本文件。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CustomerVehicle" vehicle
    GROUP BY vehicle."storeId", vehicle."carPlateNormalized"
    HAVING vehicle."carPlateNormalized" IS NOT NULL AND COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '存在同门店重复标准化车牌，禁止创建车辆唯一约束';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "CustomerVehicle" vehicle
    GROUP BY vehicle."storeId", vehicle."vinHash"
    HAVING vehicle."vinHash" IS NOT NULL AND COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '存在同门店重复 VIN，禁止创建车辆唯一约束';
  END IF;
END $$;

DROP INDEX IF EXISTS "CustomerVehicle_storeId_carPlateNormalized_idx";
DROP INDEX IF EXISTS "CustomerVehicle_storeId_vinHash_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerVehicle_storeId_carPlateNormalized_key"
  ON "CustomerVehicle"("storeId", "carPlateNormalized");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerVehicle_storeId_vinHash_key"
  ON "CustomerVehicle"("storeId", "vinHash");
