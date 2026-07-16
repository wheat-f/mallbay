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

test("修改车辆价格级别时维持门店唯一默认级别", async () => {
  const updates: unknown[] = [];
  const prisma = {
    vehiclePriceClass: {
      findFirst: async () => ({ id: "class-1", storeId: "store-1", code: "A", name: "A级", description: null, sortOrder: 0, isDefault: false, status: DictionaryStatus.ACTIVE }),
      updateMany: async (args: unknown) => { updates.push(args); return { count: 1 }; },
      update: async (args: unknown) => { updates.push(args); return { id: "class-1", isDefault: true }; }
    }
  };
  const service = new VehiclePricingService(prisma as never);
  const result = await service.updateClass({ id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } }, "class-1", { storeId: "store-1", name: "高级", isDefault: true });
  assert.equal(result.isDefault, true);
  assert.equal(updates.length, 2);
});

test("修改车型映射会排除自身后重新执行冲突校验", async () => {
  let updatedData: Record<string, unknown> | undefined;
  const prisma = {
    vehiclePriceClass: { findFirst: async () => ({ id: "class-1", status: DictionaryStatus.ACTIVE }) },
    vehicleModelMapping: {
      findFirst: async () => ({ id: "mapping-1", storeId: "store-1", brand: "BMW", modelKeyword: "X5", yearFrom: 2020, yearTo: null, vehiclePriceClassId: "class-1", priority: 1, status: DictionaryStatus.ACTIVE }),
      findMany: async () => [],
      update: async ({ data }: { data: Record<string, unknown> }) => { updatedData = data; return { id: "mapping-1", ...data }; }
    }
  };
  const service = new VehiclePricingService(prisma as never);
  await service.updateMapping({ id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } }, "mapping-1", { storeId: "store-1", modelKeyword: "X5L", priority: 2 });
  assert.equal(updatedData?.modelKeyword, "x5l");
  assert.equal(updatedData?.priority, 2);
});
