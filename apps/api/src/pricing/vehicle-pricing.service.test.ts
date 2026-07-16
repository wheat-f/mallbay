import assert from "node:assert/strict";
import { test } from "node:test";
import { DictionaryStatus, StorePosition } from "@prisma/client";
import { VehiclePricingService } from "./vehicle-pricing.service";

test("车辆映射在同门店同优先级和重叠年份下拒绝冲突", async () => {
  const prisma = {
    vehiclePriceClass: {
      findFirst: async () => ({ id: "class-2", storeId: "store-1", status: DictionaryStatus.ACTIVE })
    },
    vehicleModelMapping: {
      findMany: async () => [{ brand: "bmw", modelKeyword: "x5", yearFrom: 2020, yearTo: null, priority: 1 }],
      create: async () => undefined
    }
  };
  const service = new VehiclePricingService(prisma as never);
  await assert.rejects(
    service.createMapping({ id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } }, {
      storeId: "store-1", brand: "BMW", modelKeyword: "X5", yearFrom: 2022, vehiclePriceClassId: "class-2", priority: 1
    }),
    /车型映射冲突/
  );
});
