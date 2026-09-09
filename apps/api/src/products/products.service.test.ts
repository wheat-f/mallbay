import assert from "node:assert/strict";
import { test } from "node:test";
import { ProductCategory, ProductStatus, ProductUnit } from "@prisma/client";
import { ProductsService } from "./products.service";

const productAccess = {
  can: async (actor: { userId: string }, capability: string, action: string) => {
    const actorId = actor.userId;
    if (capability === "products" && action === "suggested-price-write") return actorId.startsWith("manager");
    if (capability === "products") return action === "read" || actorId.startsWith("manager") || actorId.startsWith("purchasing");
    if (capability === "finance") return actorId.startsWith("manager") || actorId.startsWith("finance");
    return true;
  }
};

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
  const service = new ProductsService(prisma as never, productAccess as never);

  const result = await service.create(
    { id: "manager-1" },
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

test("ProductsService persists structured inventory conversion fields", async () => {
  const writes: unknown[] = [];
  const prisma = {
    product: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "product-1" };
      }
    }
  };
  const service = new ProductsService(prisma as never, productAccess as never);

  await service.create(
    { id: "manager-1" },
    {
      storeId: "store-1",
      brand: "3M",
      name: "漆面保护膜",
      model: "PPF-100",
      category: ProductCategory.PPF,
      specification: "1.52*15m",
      unit: ProductUnit.ROLL,
      inventoryUnit: ProductUnit.ROLL,
      salesUnit: ProductUnit.METER,
      rollWidthMeters: 1.52,
      rollLengthMeters: 15,
      metersPerRoll: 15,
      quantityPrecision: 3,
      warrantyYears: 10,
      basePriceCents: 5000000
    }
  );

  assert.deepEqual((writes[0] as { data: Record<string, unknown> }).data, {
    storeId: "store-1",
    brand: "3M",
    name: "漆面保护膜",
    model: "PPF-100",
    category: ProductCategory.PPF,
    specification: "1.52*15m",
    unit: ProductUnit.ROLL,
    inventoryUnit: ProductUnit.ROLL,
    salesUnit: ProductUnit.METER,
    rollWidthMeters: 1.52,
    rollLengthMeters: 15,
    metersPerRoll: 15,
    quantityPrecision: 3,
    warrantyYears: 10,
    basePriceCents: 5000000,
    status: ProductStatus.ACTIVE
  });
});

test("ProductsService prevents purchasing from creating a product with a suggested price", async () => {
  const writes: unknown[] = [];
  const service = new ProductsService({
    product: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "product-1" };
      }
    }
  } as never, productAccess as never);

  await assert.rejects(
    () => service.create(
        { id: "purchasing-1" },
      {
        storeId: "store-1",
        brand: "龙膜",
        name: "漆面保护膜",
        model: "L-100",
        category: ProductCategory.PPF,
        unit: ProductUnit.ROLL,
        basePriceCents: 4200000
      }
    ),
    { name: "ForbiddenException" }
  );
  assert.equal(writes.length, 0);
});

test("ProductsService rejects product updates from sales", async () => {
  const service = new ProductsService({
    product: {
      findUnique: async () => ({ id: "product-1", storeId: "store-1" })
    }
  } as never, productAccess as never);

  await assert.rejects(
    () =>
      service.update(
        { id: "sales-1" },
        "product-1",
        { name: "新名称" }
      ),
    { name: "ForbiddenException" }
  );
});

test("ProductsService allows purchasing to update product details without changing suggested price", async () => {
  const writes: unknown[] = [];
  const service = new ProductsService({
    product: {
      findUnique: async () => ({
        id: "product-1",
        storeId: "store-1",
        basePriceCents: 5000000,
        salesUnit: ProductUnit.ROLL,
        unit: ProductUnit.ROLL,
        metersPerRoll: null,
        standardCostCents: null
      }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "product-1" };
      }
    }
  } as never, productAccess as never);

  const result = await service.update(
    { id: "purchasing-1" },
    "product-1",
    { name: "漆面保护膜（采购资料更新）" }
  );

  assert.deepEqual(result, { id: "product-1" });
  assert.deepEqual(writes, [{
    where: { id: "product-1" },
    data: { name: "漆面保护膜（采购资料更新）" }
  }]);
});

test("ProductsService rejects customer service product mutations", async () => {
  const service = new ProductsService({
    product: {
      findUnique: async () => ({ id: "product-1", storeId: "store-1" }),
      create: async () => {
        throw new Error("customer service should not create products");
      },
      update: async () => {
        throw new Error("customer service should not update products");
      }
    }
  } as never, productAccess as never);
  const user = {
    id: "customer-service-1"
  };

  await assert.rejects(
    () =>
      service.create(user, {
        storeId: "store-1",
        brand: "3M",
        name: "漆面保护膜",
        model: "PPF-100",
        category: ProductCategory.PPF,
        unit: ProductUnit.ROLL,
        basePriceCents: 5000000
      }),
    { name: "ForbiddenException" }
  );
  await assert.rejects(
    () => service.update(user, "product-1", { name: "新名称" }),
    { name: "ForbiddenException" }
  );
});
