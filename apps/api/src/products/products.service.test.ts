import assert from "node:assert/strict";
import { test } from "node:test";
import { ProductCategory, ProductStatus, ProductUnit, StorePosition } from "@prisma/client";
import { ProductsService } from "./products.service";

test("ProductsService creates active products for store managers", async () => {
  const prisma = {
    product: {
      create: async (args: unknown) => {
        assert.deepEqual(args, {
          data: {
            storeId: "store-1",
            brand: "3M",
            name: "漆面保护膜",
            model: "PPF-100",
            category: ProductCategory.PPF,
            specification: "1.52*15m",
            unit: ProductUnit.ROLL,
            warrantyYears: 10,
            basePriceCents: 5000000,
            status: ProductStatus.ACTIVE
          }
        });
        return { id: "product-1" };
      }
    }
  };
  const service = new ProductsService(prisma as never);

  const result = await service.create(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    {
      storeId: "store-1",
      brand: "3M",
      name: "漆面保护膜",
      model: "PPF-100",
      category: ProductCategory.PPF,
      specification: "1.52*15m",
      unit: ProductUnit.ROLL,
      warrantyYears: 10,
      basePriceCents: 5000000
    }
  );

  assert.deepEqual(result, { id: "product-1" });
});

test("ProductsService rejects product updates from sales", async () => {
  const service = new ProductsService({
    product: {
      findUnique: async () => ({ id: "product-1", storeId: "store-1" })
    }
  } as never);

  await assert.rejects(
    () =>
      service.update(
        {
          id: "sales-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.SALES }
        },
        "product-1",
        { name: "新名称" }
      ),
    { name: "ForbiddenException" }
  );
});
