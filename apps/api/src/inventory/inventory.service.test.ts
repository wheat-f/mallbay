import assert from "node:assert/strict";
import { test } from "node:test";
import { InventoryMovementType, ProductUnit, PurchaseOrderStatus, StorePosition } from "@prisma/client";
import { InventoryService } from "./inventory.service";

test("InventoryService creates a batch and purchase-in movement", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    inventoryBatch: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "batch-1", storeId: "store-1", productId: "product-1", batchNo: "B20260601" };
      }
    },
    inventoryMovement: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "movement-1" };
      }
    }
  };
  const service = new InventoryService(prisma as never);

  const result = await service.createBatch(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    {
      storeId: "store-1",
      productId: "product-1",
      batchNo: "B20260601",
      supplierName: "3M",
      totalQuantity: 10,
      unitCostCents: 120000
    }
  );

  assert.equal(result.id, "batch-1");
  assert.equal(JSON.stringify(writes).includes(InventoryMovementType.PURCHASE_IN), true);
  assert.equal(JSON.stringify(writes).includes("\"quantity\":10"), true);
});

test("InventoryService locks stock for order items and creates purchase demand for missing quantity", async () => {
  const updates: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    purchaseOrder: {
      create: async (args: unknown) => {
        updates.push(args);
        return { id: "po-1", status: PurchaseOrderStatus.DRAFT };
      }
    }
  };
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        orderNo: "ORD-1",
        items: [{ productId: "product-1", quantity: 6 }]
      })
    },
    inventoryMovement: {
      create: async (args: unknown) => updates.push(args)
    },
    inventoryBatch: {
      findMany: async () => [{ id: "batch-1", productId: "product-1", availableQuantity: 4, lockedQuantity: 0 }],
      update: async (args: unknown) => updates.push(args)
    },
    purchaseOrder: {
      create: async (args: unknown) => {
        updates.push(args);
        return { id: "po-1", status: PurchaseOrderStatus.DRAFT };
      }
    }
  };
  const service = new InventoryService(prisma as never);

  const result = await service.lockOrderInventory(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "order-1"
  );

  assert.equal(result.locked.length, 1);
  assert.equal(result.purchaseOrder?.id, "po-1");
  assert.equal(JSON.stringify(updates).includes(InventoryMovementType.ORDER_LOCK), true);
});

test("InventoryService records roll to meter conversion as inventory movement metadata", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    inventoryBatch: {
      findUnique: async () => ({ id: "batch-1", storeId: "store-1", productId: "product-1", availableQuantity: 1 }),
      update: async (args: unknown) => writes.push(args)
    },
    inventoryMovement: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "movement-1" };
      }
    }
  };
  const service = new InventoryService(prisma as never);

  await service.convertBatchUnit(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "batch-1",
    { fromUnit: ProductUnit.ROLL, toUnit: ProductUnit.METER, quantity: 1, convertedQuantity: 15 }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes(InventoryMovementType.UNIT_CONVERSION), true);
  assert.equal(serialized.includes("\"conversionRate\":15"), true);
});
