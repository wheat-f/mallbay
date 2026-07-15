import assert from "node:assert/strict";
import { test } from "node:test";
import { InventoryMovementType, ProductUnit, StorePosition } from "@prisma/client";
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

test("InventoryService receives one roll as base meter stock with package snapshot", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    inventoryBatch: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "batch-1", storeId: "store-1", productId: "product-1", batchNo: "ROLL-001" };
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

  await service.createBatch(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    {
      storeId: "store-1",
      productId: "product-1",
      batchNo: "ROLL-001",
      totalQuantity: 1,
      unit: ProductUnit.ROLL,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 18
    } as never
  );

  const serialized = JSON.stringify(writes);
  assert.match(serialized, /"packageUnit":"ROLL"/);
  assert.match(serialized, /"packageQuantity":1/);
  assert.match(serialized, /"unit":"METER"/);
  assert.match(serialized, /"totalQuantity":18/);
  assert.match(serialized, /"availableQuantity":18/);
  assert.match(serialized, /"quantity":18/);
});

test("InventoryService manages store warehouses as inventory master data", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    warehouse: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [{ id: "warehouse-1", storeId: "store-1", name: "主仓库", isActive: true }];
      },
      create: async (args: unknown) => {
        calls.push(args);
        return { id: "warehouse-2", storeId: "store-1", name: "贴膜仓", isActive: true };
      },
      findUnique: async () => ({ id: "warehouse-1", storeId: "store-1", name: "主仓库", isActive: true }),
      update: async (args: unknown) => {
        calls.push(args);
        return { id: "warehouse-1", storeId: "store-1", name: "主仓库 A 区", isActive: true };
      }
    }
  };
  const service = new InventoryService(prisma as never);
  const user = {
    id: "purchasing-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
  };

  await service.listWarehouses(user, "store-1");
  await service.createWarehouse(user, { storeId: "store-1", name: "贴膜仓", code: "PPF-A", area: "A 区" });
  await service.updateWarehouse(user, "warehouse-1", { name: "主仓库 A 区", isActive: true });

  const serialized = JSON.stringify(calls);
  assert.equal(serialized.includes("\"storeId\":\"store-1\""), true);
  assert.equal(serialized.includes("\"name\":\"贴膜仓\""), true);
  assert.equal(serialized.includes("\"createdById\":\"purchasing-1\""), true);
  assert.equal(serialized.includes("\"name\":\"主仓库 A 区\""), true);
});

test("InventoryService filters inventory movements by product batch order type and operator", async () => {
  const calls: unknown[] = [];
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    inventoryMovement: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  } as never);

  await service.listMovements(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    {
      storeId: "store-1",
      productId: "product-1",
      batchId: "batch-1",
      orderId: "order-1",
      movementType: InventoryMovementType.ORDER_LOCK,
      createdById: "user-1",
      createdFrom: "2026-06-01",
      createdTo: "2026-06-10"
    } as never
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    productId: "product-1",
    batchId: "batch-1",
    orderId: "order-1",
    movementType: InventoryMovementType.ORDER_LOCK,
    createdById: "user-1",
    createdAt: {
      gte: new Date("2026-06-01T00:00:00.000Z"),
      lte: new Date("2026-06-10T23:59:59.999Z")
    }
  });
});

test("InventoryService excludes fully outbound orders from pending inventory matching", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    order: {
      findMany: async () => [
        {
          id: "order-outbound",
          items: [
            {
              quantity: 2,
              inventoryAllocations: [
                { status: "OUTBOUND", outboundQuantity: 2, lockedQuantity: 2 }
              ]
            }
          ]
        },
        {
          id: "order-locked",
          items: [
            {
              quantity: 2,
              inventoryAllocations: [
                { status: "LOCKED", outboundQuantity: 0, lockedQuantity: 2 }
              ]
            }
          ]
        },
        {
          id: "order-partial-outbound",
          items: [
            {
              quantity: 3,
              inventoryAllocations: [
                { status: "OUTBOUND", outboundQuantity: 1, lockedQuantity: 1 }
              ]
            }
          ]
        }
      ]
    }
  } as never);

  const result = await service.listPendingMatchOrders(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "store-1"
  );

  assert.deepEqual(result.map((order) => order.id), ["order-locked", "order-partial-outbound"]);
});

test("InventoryService locks stock through allocations and creates purchase requirement for missing quantity", async () => {
  const updates: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)
  };
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        orderNo: "ORD-1",
        items: [{ id: "item-1", productId: "product-1", quantity: 6, product: { unit: ProductUnit.ROLL } }]
      })
    },
    orderInventoryAllocation: {
      create: async (args: unknown) => updates.push(args)
    },
    inventoryMovement: {
      create: async (args: unknown) => updates.push(args)
    },
    inventoryBatch: {
      findMany: async () => [{ id: "batch-1", productId: "product-1", availableQuantity: 4, lockedQuantity: 0 }],
      update: async (args: unknown) => updates.push(args)
    },
    purchaseRequirement: {
      create: async (args: unknown) => {
        updates.push(args);
        return { id: "pr-1", status: "OPEN" };
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
  assert.equal(result.purchaseRequirement?.id, "pr-1");
  const serialized = JSON.stringify(updates);
  assert.equal(serialized.includes("orderInventoryAllocation"), false);
  assert.equal(serialized.includes("\"orderItemId\":\"item-1\""), true);
  assert.equal(serialized.includes(InventoryMovementType.ORDER_LOCK), true);
  assert.equal(serialized.includes("PurchaseOrder"), false);
});

test("InventoryService auto locks using order item required base quantity", async () => {
  const writes: unknown[] = [];
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        orderNo: "ORD-1",
        items: [
          {
            id: "item-1",
            productId: "product-1",
            quantity: 1,
            requiredBaseQuantity: 18,
            baseUnit: ProductUnit.METER,
            product: { unit: ProductUnit.ROLL },
            inventoryAllocations: []
          }
        ]
      })
    },
    orderInventoryAllocation: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "allocation-1" };
      }
    },
    inventoryMovement: {
      create: async (args: unknown) => writes.push(args)
    },
    inventoryBatch: {
      findMany: async () => [
        {
          id: "batch-1",
          productId: "product-1",
          unit: ProductUnit.METER,
          availableQuantity: 18,
          lockedQuantity: 0
        }
      ],
      update: async (args: unknown) => writes.push(args)
    },
    purchaseRequirement: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "pr-1" };
      }
    }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  const result = await service.lockOrderInventory(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "order-1"
  );

  assert.equal(result.locked[0].quantity, 18);
  assert.equal(result.purchaseRequirement, undefined);
  const serialized = JSON.stringify(writes);
  assert.match(serialized, /"availableQuantity":\{"decrement":18\}/);
  assert.match(serialized, /"lockedQuantity":18/);
  assert.match(serialized, /"unit":"METER"/);
});

test("InventoryService reuses released allocation when locking the same order batch again", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)
  };
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        orderNo: "ORD-1",
        items: [
          {
            id: "item-1",
            productId: "product-1",
            quantity: 1,
            product: { unit: ProductUnit.ROLL },
            inventoryAllocations: [
              {
                id: "allocation-released",
                batchId: "batch-1",
                status: "RELEASED",
                lockedQuantity: 1,
                outboundQuantity: 0
              }
            ]
          }
        ]
      })
    },
    orderInventoryAllocation: {
      create: async (args: unknown) => {
        writes.push({ kind: "create-allocation", args });
        throw new Error("should not create a duplicate allocation");
      },
      update: async (args: unknown) => {
        writes.push({ kind: "update-allocation", args });
        return { id: "allocation-released" };
      }
    },
    inventoryMovement: {
      create: async (args: unknown) => writes.push({ kind: "create-movement", args })
    },
    inventoryBatch: {
      findMany: async () => [{ id: "batch-1", productId: "product-1", availableQuantity: 1, lockedQuantity: 0 }],
      update: async (args: unknown) => writes.push({ kind: "update-batch", args })
    },
    purchaseRequirement: {
      create: async (args: unknown) => {
        writes.push({ kind: "create-requirement", args });
        return { id: "pr-1", status: "OPEN" };
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
  assert.equal(result.purchaseRequirement, undefined);
  assert.equal(writes.some((write) => (write as { kind: string }).kind === "create-allocation"), false);
  assert.equal(
    JSON.stringify(writes).includes('"sourceId":"allocation-released"'),
    true
  );
  assert.equal(
    JSON.stringify(writes).includes('"status":"LOCKED"'),
    true
  );
});

test("InventoryService locks selected batch by base unit quantity", async () => {
  const writes: unknown[] = [];
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        items: [
          {
            id: "item-1",
            productId: "product-1",
            quantity: 1,
            product: { unit: ProductUnit.ROLL }
          }
        ]
      })
    },
    inventoryBatch: {
      findUnique: async () => ({
        id: "batch-1",
        storeId: "store-1",
        productId: "product-1",
        unit: ProductUnit.METER,
        packageUnit: ProductUnit.ROLL,
        baseQuantityPerPackage: 18,
        availableQuantity: 18,
        lockedQuantity: 0
      }),
      update: async (args: unknown) => writes.push(args)
    },
    orderInventoryAllocation: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "allocation-1" };
      }
    },
    inventoryMovement: {
      create: async (args: unknown) => writes.push(args)
    }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  await service.createOrderInventoryAllocations(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "order-1",
    {
      allocations: [{ orderItemId: "item-1", batchId: "batch-1", quantity: 12, unit: ProductUnit.METER }]
    } as never
  );

  const serialized = JSON.stringify(writes);
  assert.match(serialized, /"availableQuantity":\{"decrement":12\}/);
  assert.match(serialized, /"lockedQuantity":\{"increment":12\}/);
  assert.match(serialized, /"lockedQuantity":12/);
  assert.match(serialized, /"unit":"METER"/);
});

test("InventoryService creates purchase order from purchase requirement items", async () => {
  const writes: unknown[] = [];
  const tx = {
    purchaseRequirement: {
      findUnique: async () => ({
        id: "pr-1",
        storeId: "store-1",
        items: [
          {
            id: "pri-1",
            productId: "product-1",
            requiredQuantity: 2,
            fulfilledQuantity: 0
          }
        ]
      }),
      update: async (args: unknown) => writes.push(args)
    },
    purchaseOrder: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "po-1", items: [{ id: "poi-1" }] };
      }
    }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  const result = await service.createPurchaseOrderFromRequirement(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "pr-1",
    { supplierName: "3M", expectedAt: "2026-06-10" }
  );

  assert.equal((result as { id: string }).id, "po-1");
  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("\"purchaseRequirementId\":\"pr-1\""), true);
  assert.equal(serialized.includes("\"purchaseRequirementItemId\":\"pri-1\""), true);
  assert.equal(serialized.includes("\"status\":\"ORDERED\""), true);
});

test("InventoryService returns related purchase orders with purchase requirements", async () => {
  let findManyArgs: unknown;
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    purchaseRequirement: {
      findMany: async (args: unknown) => {
        findManyArgs = args;
        return [
          {
            id: "pr-1",
            purchaseOrders: [{ id: "po-1", orderNo: "PO-1", status: "ORDERED" }]
          }
        ];
      }
    }
  } as never);

  const result = await service.listPurchaseRequirements(
    {
      id: "cs-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.CUSTOMER_SERVICE }
    },
    "store-1"
  );

  assert.equal((result[0] as { purchaseOrders: unknown[] }).purchaseOrders.length, 1);
  assert.match(JSON.stringify(findManyArgs), /purchaseOrders/);
  assert.match(JSON.stringify(findManyArgs), /orderNo/);
});

test("InventoryService creates purchase orders only for un-ordered requirement quantities", async () => {
  const writes: unknown[] = [];
  const tx = {
    purchaseRequirement: {
      findUnique: async () => ({
        id: "pr-1",
        storeId: "store-1",
        items: [
          {
            id: "pri-1",
            productId: "product-1",
            requiredQuantity: 10,
            fulfilledQuantity: 2,
            purchaseOrderItems: [
              { quantity: 7, purchaseOrder: { status: "ORDERED" } },
              { quantity: 3, purchaseOrder: { status: "CANCELLED" } }
            ]
          }
        ]
      }),
      update: async (args: unknown) => writes.push(args)
    },
    purchaseOrder: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "po-1", items: [{ id: "poi-1" }] };
      }
    }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  await service.createPurchaseOrderFromRequirement(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "pr-1",
    { supplierName: "3M" }
  );

  const serialized = JSON.stringify(writes);
  assert.match(serialized, /"quantity":3/);
  assert.doesNotMatch(serialized, /"quantity":8/);
});

test("InventoryService splits a purchase requirement across multiple suppliers", async () => {
  const writes: unknown[] = [];
  const tx = {
    purchaseRequirement: {
      findUnique: async () => ({
        id: "pr-1",
        storeId: "store-1",
        items: [
          {
            id: "pri-1",
            productId: "product-1",
            requiredQuantity: 10,
            purchaseOrderItems: [
              { quantity: 2, purchaseOrder: { status: "ORDERED" } }
            ]
          }
        ]
      }),
      update: async (args: unknown) => writes.push(args)
    },
    purchaseOrder: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: `po-${writes.length}`, items: [] };
      }
    }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  const result = await service.createPurchaseOrderFromRequirement(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "pr-1",
    {
      expectedAt: "2026-06-10",
      supplierAllocations: [
        { supplierName: "供应商A", expectedAt: "2026-06-10", items: [{ purchaseRequirementItemId: "pri-1", quantity: 3 }] },
        { supplierName: "供应商B", expectedAt: "2026-06-15", items: [{ purchaseRequirementItemId: "pri-1", quantity: 5 }] }
      ]
    }
  );

  assert.equal((result as { purchaseOrders: unknown[] }).purchaseOrders.length, 2);
  const serialized = JSON.stringify(writes);
  assert.match(serialized, /"supplierName":"供应商A"/);
  assert.match(serialized, /"supplierName":"供应商B"/);
  assert.match(serialized, /"quantity":3/);
  assert.match(serialized, /"quantity":5/);
  assert.match(serialized, /2026-06-10/);
  assert.match(serialized, /2026-06-15/);
  assert.match(serialized, /"status":"ORDERED"/);
});

test("InventoryService rejects supplier allocations above remaining requirement quantity", async () => {
  const tx = {
    purchaseRequirement: {
      findUnique: async () => ({
        id: "pr-1",
        storeId: "store-1",
        items: [
          {
            id: "pri-1",
            productId: "product-1",
            requiredQuantity: 4,
            purchaseOrderItems: []
          }
        ]
      })
    },
    purchaseOrder: {
      create: async () => {
        throw new Error("should not create purchase order");
      }
    }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  await assert.rejects(
    () =>
      service.createPurchaseOrderFromRequirement(
        {
          id: "purchasing-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
        },
        "pr-1",
        {
          supplierAllocations: [
            { supplierName: "供应商A", items: [{ purchaseRequirementItemId: "pri-1", quantity: 3 }] },
            { supplierName: "供应商B", items: [{ purchaseRequirementItemId: "pri-1", quantity: 2 }] }
          ]
        }
      ),
    /采购数量不能超过需求剩余数量/
  );
});

test("InventoryService rejects sales viewing purchase orders", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    purchaseOrder: {
      findMany: async () => {
        throw new Error("sales should not read purchase orders");
      }
    }
  } as never);

  await assert.rejects(
    () =>
      service.listPurchaseOrders(
        {
          id: "sales-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.SALES }
        },
        "store-1"
      ),
    /无权限/
  );
});

test("InventoryService rejects sales viewing purchase requirements", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    purchaseRequirement: {
      findMany: async () => {
        throw new Error("sales should not read purchase requirements");
      }
    }
  } as never);

  await assert.rejects(
    () =>
      service.listPurchaseRequirements(
        {
          id: "sales-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.SALES }
        },
        "store-1"
      ),
    /无权限/
  );
});

test("InventoryService rejects sales viewing supplier backoffice list", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    supplier: {
      findMany: async () => {
        throw new Error("sales should not read supplier backoffice data");
      }
    },
    purchaseOrder: {
      findMany: async () => {
        throw new Error("sales should not read purchase supplier snapshots");
      }
    },
    inventoryBatch: {
      findMany: async () => {
        throw new Error("sales should not read batch supplier snapshots");
      }
    }
  } as never);

  await assert.rejects(
    () =>
      service.listSuppliers(
        {
          id: "sales-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.SALES }
        },
        "store-1"
      ),
    /无权限/
  );
});

test("InventoryService allows customer service to view purchase orders and suppliers", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    purchaseOrder: {
      findMany: async () => []
    },
    supplier: {
      findMany: async () => []
    },
    inventoryBatch: {
      findMany: async () => []
    }
  } as never);
  const user = {
    id: "customer-service-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: "CUSTOMER_SERVICE" as StorePosition }
  };

  await assert.doesNotReject(() => service.listPurchaseOrders(user, "store-1"));
  await assert.doesNotReject(() => service.listSuppliers(user, "store-1"));
});

test("InventoryService rejects customer service purchase and supplier mutations", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    supplier: {
      findUnique: async () => ({ id: "supplier-1", storeId: "store-1" })
    },
    purchaseOrder: {
      findUnique: async () => ({ id: "po-1", storeId: "store-1", status: "DRAFT", orderNo: "PO1" })
    }
  } as never);
  const user = {
    id: "customer-service-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: "CUSTOMER_SERVICE" as StorePosition }
  };

  await assert.rejects(
    () => service.createPurchaseOrder(user, { storeId: "store-1", items: [] }),
    /无权限/
  );
  await assert.rejects(
    () => service.approvePurchaseOrder(user, "po-1"),
    /无权限/
  );
  await assert.rejects(
    () => service.createSupplier(user, { storeId: "store-1", name: "3M" }),
    /无权限/
  );
  await assert.rejects(
    () => service.updateSupplier(user, "supplier-1", { note: "仅查看" }),
    /无权限/
  );
});

test("InventoryService approves draft purchase orders before inbound", async () => {
  const writes: unknown[] = [];
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    purchaseOrder: {
      findUnique: async () => ({ id: "po-1", storeId: "store-1", status: "DRAFT" }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "po-1", status: "ORDERED" };
      }
    }
  } as never);

  const result = await service.approvePurchaseOrder(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "po-1"
  );

  assert.equal((result as { status: string }).status, "ORDERED");
  assert.equal(JSON.stringify(writes).includes("\"status\":\"ORDERED\""), true);
});

test("InventoryService rejects receiving draft purchase orders", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) =>
      fn({
        purchaseOrderItem: {
          findUnique: async () => ({
            id: "poi-1",
            purchaseOrderId: "po-1",
            productId: "product-1",
            quantity: 2,
            receivedQuantity: 0,
            purchaseOrder: { id: "po-1", storeId: "store-1", status: "DRAFT", orderNo: "PO1" }
          })
        }
      })
  } as never);

  await assert.rejects(
    () =>
      service.receivePurchaseItem(
        {
          id: "purchasing-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
        },
        "poi-1",
        { quantity: 1, batchNo: "B20260604", supplierName: "3M" }
      ),
    /采购订单审批通过后才能入库/
  );
});

test("InventoryService cancels purchase orders with audit reason", async () => {
  const writes: unknown[] = [];
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    purchaseOrder: {
      findUnique: async () => ({ id: "po-1", storeId: "store-1", status: "DRAFT", orderNo: "PO1" }),
      update: async (args: unknown) => {
        writes.push({ update: args });
        return { id: "po-1", status: "CANCELLED" };
      }
    },
    auditEvent: {
      create: async (args: unknown) => writes.push({ audit: args })
    }
  } as never);

  const result = await service.cancelPurchaseOrder(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "po-1",
    { reason: "供应商无法按期交付" }
  );

  const serialized = JSON.stringify(writes);
  assert.equal((result as { status: string }).status, "CANCELLED");
  assert.equal(serialized.includes("\"status\":\"CANCELLED\""), true);
  assert.equal(serialized.includes("PURCHASE_ORDER_CANCELLED"), true);
  assert.equal(serialized.includes("供应商无法按期交付"), true);
});

test("InventoryService requires a reason when cancelling purchase orders", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null }
  } as never);

  await assert.rejects(
    () =>
      service.cancelPurchaseOrder(
        {
          id: "manager-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
        },
        "po-1",
        { reason: " " }
      ),
    /取消原因不能为空/
  );
});

test("InventoryService rejects receiving cancelled purchase orders", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) =>
      fn({
        purchaseOrderItem: {
          findUnique: async () => ({
            id: "poi-1",
            purchaseOrderId: "po-1",
            productId: "product-1",
            quantity: 2,
            receivedQuantity: 0,
            purchaseOrder: { id: "po-1", storeId: "store-1", status: "CANCELLED", orderNo: "PO1" }
          })
        }
      })
  } as never);

  await assert.rejects(
    () =>
      service.receivePurchaseItem(
        {
          id: "purchasing-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
        },
        "poi-1",
        { quantity: 1, batchNo: "B20260604", supplierName: "3M" }
      ),
    /采购订单已取消，不能入库/
  );
});

test("InventoryService list purchase orders includes product details and received batch trace", async () => {
  const findManyCalls: unknown[] = [];
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    purchaseOrder: {
      findMany: async (args: unknown) => {
        findManyCalls.push(args);
        return [
          {
            id: "po-1",
            storeId: "store-1",
            orderNo: "PO1",
            items: [
              {
                id: "poi-1",
                productId: "product-1",
                quantity: 2,
                receivedQuantity: 1,
                product: { brand: "品牌1", name: "漆面保护膜", model: "PPF-100" }
              }
            ]
          }
        ];
      }
    },
    inventoryMovement: {
      findMany: async (args: unknown) => {
        findManyCalls.push(args);
        return [
          {
            id: "movement-1",
            sourceId: "poi-1",
            quantity: 1,
            createdAt: new Date("2026-06-06T08:00:00.000Z"),
            batch: { id: "batch-1", batchNo: "B20260606", receivedAt: new Date("2026-06-06T08:00:00.000Z") }
          }
        ];
      }
    }
  } as never);

  const result = await service.listPurchaseOrders(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "store-1"
  );

  assert.deepEqual(
    (findManyCalls[0] as { include: { items: { include: { product: boolean } } } }).include.items.include,
    { product: true }
  );
  assert.equal(
    (findManyCalls[1] as { where: { sourceType: string; sourceId: { in: string[] } } }).where.sourceType,
    "PURCHASE_ORDER_ITEM"
  );
  const item = result[0].items[0] as { product: { model: string }; receivedBatches: Array<{ batchNo: string }> };
  assert.equal(item.product.model, "PPF-100");
  assert.equal(item.receivedBatches[0].batchNo, "B20260606");
});

test("InventoryService lists supplier master data merged with purchase and batch snapshots", async () => {
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    supplier: {
      findMany: async () => [
        {
          id: "supplier-1",
          storeId: "store-1",
          name: "3M",
          contactName: "王采购",
          contactPhone: "13800000000",
          settlementCycle: "月结（Net 30）",
          rating: 4,
          note: "常用供应商",
          isActive: true,
          updatedAt: new Date("2026-06-09T00:00:00.000Z"),
          contacts: [
            {
              id: "contact-1",
              name: "王采购",
              phone: "13800000000",
              role: "采购",
              isPrimary: true,
              isActive: true
            }
          ],
          ratingHistory: [
            {
              id: "rating-1",
              rating: 4,
              note: "到货稳定",
              createdAt: new Date("2026-06-09T00:00:00.000Z"),
              createdById: "purchasing-1"
            }
          ]
        }
      ]
    },
    purchaseOrder: {
      findMany: async () => [{ supplierName: "龙膜", updatedAt: new Date("2026-06-08T00:00:00.000Z") }]
    },
    inventoryBatch: {
      findMany: async () => [{ supplierName: "3M", updatedAt: new Date("2026-06-07T00:00:00.000Z") }]
    }
  } as never);

  const result = await service.listSuppliers(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "store-1"
  );

  assert.equal(result.length, 2);
  assert.equal(result[0].name, "3M");
  assert.equal(result[0].contactName, "王采购");
  assert.equal(result[0].settlementCycle, "月结（Net 30）");
  assert.equal(result[0].contacts?.[0].role, "采购");
  assert.equal(result[0].ratingHistory?.[0].note, "到货稳定");
  assert.equal(result[0].purchaseOrderCount, 0);
  assert.equal(result[0].batchCount, 1);
  assert.equal(result[1].name, "龙膜");
  assert.equal(result[1].id, undefined);
});

test("InventoryService creates and updates supplier master data within the same store", async () => {
  const writes: unknown[] = [];
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    supplier: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "supplier-1", name: "3M" };
      },
      findUnique: async () => ({ id: "supplier-1", storeId: "store-1" }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "supplier-1", name: "3M", contactName: "王采购" };
      }
    }
  } as never);

  await service.createSupplier(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    {
      storeId: "store-1",
      name: "3M",
      contactName: "王采购",
      contactPhone: "13800000000",
      settlementCycle: "月结（Net 30）",
      rating: 4,
      note: "常用供应商"
    }
  );
  const updated = await service.updateSupplier(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "supplier-1",
    { contactName: "王采购", settlementCycle: "现结", isActive: true }
  );

  assert.equal((updated as { contactName: string }).contactName, "王采购");
  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("\"createdById\":\"purchasing-1\""), true);
  assert.equal(serialized.includes("\"settlementCycle\":\"月结（Net 30）\""), true);
  assert.equal(serialized.includes("\"settlementCycle\":\"现结\""), true);
  assert.equal(serialized.includes("\"isActive\":true"), true);
});

test("InventoryService exports every purchase product row without pagination", async () => {
  let findManyArgs: Record<string, unknown> | undefined;
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    purchaseOrder: {
      findMany: async (args: Record<string, unknown>) => {
        findManyArgs = args;
        return [
          {
            id: "po-1",
            orderNo: "PO-001",
            supplierName: "供应商甲",
            status: "ORDERED",
            expectedAt: new Date("2026-07-20T00:00:00.000Z"),
            createdAt: new Date("2026-07-15T00:00:00.000Z"),
            items: [
              {
                productId: "product-b",
                quantity: 2,
                receivedQuantity: 0.5,
                unitCostCents: 12000,
                product: {
                  brand: "3M",
                  name: "B膜",
                  model: "B",
                  specification: "B规格",
                  inventoryUnit: ProductUnit.ROLL
                }
              },
              {
                productId: "product-a",
                quantity: 3,
                receivedQuantity: 1,
                unitCostCents: 10000,
                product: {
                  brand: "3M",
                  name: "A膜",
                  model: "A",
                  specification: "A规格",
                  inventoryUnit: ProductUnit.METER
                }
              }
            ]
          }
        ];
      }
    }
  } as never);

  const result = await service.exportPurchaseOrderDetails(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    { storeId: "store-1", exportDimension: "product" }
  );

  assert.equal("skip" in (findManyArgs ?? {}), false);
  assert.equal("take" in (findManyArgs ?? {}), false);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((row) => row.productName), ["A膜", "B膜"]);
  assert.equal(result[0].pendingQuantity, 2);
  assert.equal(result[0].itemAmountCents, 30000);
});

test("InventoryService creates supplier contacts and rating history", async () => {
  const writes: unknown[] = [];
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    supplier: {
      findUnique: async () => ({ id: "supplier-1", storeId: "store-1" }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "supplier-1", rating: 5 };
      }
    },
    supplierContact: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "contact-1", name: "李采购" };
      }
    },
    supplierRatingHistory: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "rating-1", rating: 5 };
      }
    }
  } as never);

  await service.createSupplierContact(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "supplier-1",
    { name: "李采购", phone: "13900000000", role: "售后", isPrimary: false }
  );
  await service.createSupplierRatingHistory(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "supplier-1",
    { rating: 5, note: "交付及时" }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("\"supplierId\":\"supplier-1\""), true);
  assert.equal(serialized.includes("\"name\":\"李采购\""), true);
  assert.equal(serialized.includes("\"rating\":5"), true);
  assert.equal(serialized.includes("\"createdById\":\"purchasing-1\""), true);
});

test("InventoryService order match includes locked allocations and batch trace", async () => {
  const findUniqueCalls: unknown[] = [];
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    order: {
      findUnique: async (args: unknown) => {
        findUniqueCalls.push(args);
        return {
          id: "order-1",
          storeId: "store-1",
          items: [
            {
              id: "item-1",
              productId: "product-1",
              quantity: 2,
              inventoryAllocations: [
                {
                  id: "allocation-1",
                  batchId: "batch-1",
                  lockedQuantity: 1,
                  outboundQuantity: 0,
                  status: "LOCKED",
                  batch: { id: "batch-1", batchNo: "B001" }
                }
              ]
            }
          ]
        };
      }
    },
    inventoryBatch: {
      findMany: async () => []
    }
  } as never);

  const result = await service.getOrderInventoryMatch(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "order-1"
  );

  assert.deepEqual(
    (findUniqueCalls[0] as { include: { customer: unknown; vehicle: unknown } }).include.customer,
    true
  );
  assert.deepEqual(
    (findUniqueCalls[0] as { include: { customer: unknown; vehicle: unknown } }).include.vehicle,
    true
  );
  assert.deepEqual(
    (findUniqueCalls[0] as { include: { items: { include: { inventoryAllocations: unknown } } } }).include.items.include
      .inventoryAllocations,
    { include: { batch: true } }
  );
  assert.equal(
    (result.items[0].orderItem.inventoryAllocations[0] as { batch: { batchNo: string } }).batch.batchNo,
    "B001"
  );
});

test("InventoryService receive purchase item updates purchase requirement fulfillment", async () => {
  const writes: unknown[] = [];
  const tx = {
    purchaseOrderItem: {
      findUnique: async () => ({
        id: "poi-1",
        purchaseOrderId: "po-1",
        purchaseRequirementItemId: "pri-1",
        productId: "product-1",
        quantity: 2,
        receivedQuantity: 0,
        unitCostCents: 1000,
        purchaseOrder: { id: "po-1", storeId: "store-1", orderNo: "PO1", supplierName: "3M" }
      }),
      update: async (args: unknown) => writes.push(args),
      findMany: async () => [{ id: "poi-1", quantity: 2, receivedQuantity: 0 }]
    },
    inventoryBatch: {
      upsert: async (args: unknown) => {
        writes.push(args);
        return { id: "batch-1" };
      }
    },
    inventoryMovement: {
      create: async (args: unknown) => writes.push(args)
    },
    purchaseRequirementItem: {
      update: async (args: unknown) => writes.push(args),
      findMany: async () => [{ fulfilledQuantity: 2, requiredQuantity: 2, purchaseRequirementId: "pr-1" }]
    },
    purchaseOrder: {
      update: async (args: unknown) => writes.push(args)
    },
    purchaseRequirement: {
      update: async (args: unknown) => writes.push(args)
    }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  await service.receivePurchaseItem(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "poi-1",
    { quantity: 2, batchNo: "B20260604", supplierName: "3M" }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("fulfilledQuantity"), true);
  assert.equal(serialized.includes("\"status\":\"FULFILLED\""), true);
});

test("InventoryService receives purchase item package quantity as base stock", async () => {
  const writes: unknown[] = [];
  const tx = {
    purchaseOrderItem: {
      findUnique: async () => ({
        id: "poi-1",
        purchaseOrderId: "po-1",
        purchaseRequirementItemId: null,
        productId: "product-1",
        quantity: 1,
        receivedQuantity: 0,
        unitCostCents: 1000,
        product: {
          unit: ProductUnit.ROLL,
          inventoryUnit: ProductUnit.METER,
          metersPerRoll: 18
        },
        purchaseOrder: { id: "po-1", storeId: "store-1", orderNo: "PO1", supplierName: "3M" }
      }),
      update: async (args: unknown) => writes.push(args),
      findMany: async () => [{ id: "poi-1", quantity: 1, receivedQuantity: 0 }]
    },
    inventoryBatch: {
      upsert: async (args: unknown) => {
        writes.push(args);
        return { id: "batch-1" };
      }
    },
    inventoryMovement: {
      create: async (args: unknown) => writes.push(args)
    },
    purchaseOrder: {
      update: async (args: unknown) => writes.push(args)
    }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  await service.receivePurchaseItem(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "poi-1",
    { quantity: 1, batchNo: "ROLL-PO-1", supplierName: "3M" }
  );

  const serialized = JSON.stringify(writes);
  assert.match(serialized, /"packageUnit":"ROLL"/);
  assert.match(serialized, /"packageQuantity":1/);
  assert.match(serialized, /"unit":"METER"/);
  assert.match(serialized, /"totalQuantity":18/);
  assert.match(serialized, /"availableQuantity":18/);
  assert.match(serialized, /"quantity":18/);
});

test("InventoryService receives purchase item batches with per-line failures", async () => {
  const purchaseItem = {
    id: "poi-1",
    purchaseOrderId: "po-1",
    purchaseRequirementItemId: null,
    productId: "product-1",
    quantity: 2,
    receivedQuantity: 0,
    unitCostCents: 1000,
    purchaseOrder: { id: "po-1", storeId: "store-1", orderNo: "PO1", supplierName: "3M" }
  };
  const tx = {
    purchaseOrderItem: {
      findUnique: async () => purchaseItem,
      update: async (args: { data: { receivedQuantity: number } }) => {
        purchaseItem.receivedQuantity = args.data.receivedQuantity;
      },
      findMany: async () => [purchaseItem]
    },
    inventoryBatch: {
      upsert: async (args: { create: { batchNo: string } }) => ({ id: `batch-${args.create.batchNo}` })
    },
    inventoryMovement: { create: async () => undefined },
    purchaseOrder: { update: async () => undefined }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  const result = await service.receivePurchaseItemBatches(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "poi-1",
    {
      batches: [
        { batchNo: "B001", quantity: 1, supplierName: "3M" },
        { batchNo: "B002", quantity: 2, supplierName: "3M" },
        { batchNo: "B003", quantity: 1, supplierName: "3M" }
      ]
    } as never
  );

  assert.deepEqual(result.received.map((row) => row.batchNo), ["B001", "B003"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0].index, 1);
  assert.match(result.failed[0].message, /入库数量不能超过采购数量/);
  assert.equal(purchaseItem.receivedQuantity, 2);
});

test("InventoryService stores receiving warehouse on purchase-in batch and movement", async () => {
  const writes: unknown[] = [];
  const purchaseItem = {
    id: "poi-1",
    purchaseOrderId: "po-1",
    purchaseRequirementItemId: null,
    productId: "product-1",
    quantity: 2,
    receivedQuantity: 0,
    unitCostCents: 1000,
    purchaseOrder: { id: "po-1", storeId: "store-1", orderNo: "PO1", supplierName: "3M" }
  };
  const tx = {
    warehouse: {
      findUnique: async () => ({ id: "warehouse-1", storeId: "store-1", name: "主仓库 A 区", isActive: true })
    },
    purchaseOrderItem: {
      findUnique: async () => purchaseItem,
      update: async (args: unknown) => writes.push(args),
      findMany: async () => [purchaseItem]
    },
    inventoryBatch: {
      upsert: async (args: unknown) => {
        writes.push(args);
        return { id: "batch-1" };
      }
    },
    inventoryMovement: { create: async (args: unknown) => writes.push(args) },
    purchaseOrder: { update: async (args: unknown) => writes.push(args) }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  await service.receivePurchaseItem(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "poi-1",
    { quantity: 1, batchNo: "B001", supplierName: "3M", warehouseId: "warehouse-1" } as never
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("\"warehouseId\":\"warehouse-1\""), true);
  assert.equal(serialized.includes("\"warehouseName\":\"主仓库 A 区\""), true);
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

test("InventoryService splits roll batch into traceable meter child batch", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)
  };
  const tx = {
    inventoryBatch: {
      findUnique: async () => ({
        id: "batch-1",
        storeId: "store-1",
        productId: "product-1",
        batchNo: "BOP001",
        unit: ProductUnit.ROLL,
        availableQuantity: 2,
        product: { metersPerRoll: 50 }
      }),
      count: async () => 0,
      update: async (args: unknown) => writes.push(args),
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "batch-child", batchNo: "BOP001-01" };
      }
    },
    inventoryMovement: {
      create: async (args: unknown) => writes.push(args)
    }
  };
  const service = new InventoryService(prisma as never);

  const result = await service.splitBatch(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "batch-1",
    { quantityMeters: 30 }
  );

  assert.equal((result as { batchNo: string }).batchNo, "BOP001-01");
  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("\"availableQuantity\":{\"decrement\":0.6}"), true);
  assert.equal(serialized.includes("\"batchNo\":\"BOP001-01\""), true);
  assert.equal(serialized.includes(InventoryMovementType.BATCH_SPLIT), true);
});

test("InventoryService applies manual stock operations with explicit movement types", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)
  };
  const tx = {
    inventoryBatch: {
      findUnique: async () => ({
        id: "batch-1",
        storeId: "store-1",
        productId: "product-1",
        unit: ProductUnit.METER,
        availableQuantity: 20
      }),
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

  await service.createStockOperation(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    { batchId: "batch-1", movementType: InventoryMovementType.DAMAGE_OUT, quantity: 1.5, note: "零散报损" }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("\"availableQuantity\":{\"decrement\":1.5}"), true);
  assert.equal(serialized.includes("\"quantity\":1.5"), true);
  assert.equal(serialized.includes(InventoryMovementType.DAMAGE_OUT), true);
});

test("InventoryService partially outbounds locked inventory by selected unit", async () => {
  const writes: unknown[] = [];
  const tx = {
    order: {
      findUnique: async () => ({ id: "order-1", storeId: "store-1" })
    },
    orderInventoryAllocation: {
      findMany: async () => [
        {
          id: "allocation-1",
          storeId: "store-1",
          orderId: "order-1",
          batchId: "batch-1",
          productId: "product-1",
          lockedQuantity: 18,
          outboundQuantity: 0,
          status: "LOCKED",
          batch: {
            id: "batch-1",
            unit: ProductUnit.METER,
            packageUnit: ProductUnit.ROLL,
            baseQuantityPerPackage: 18,
            lockedQuantity: 18,
            outboundQuantity: 0
          }
        }
      ],
      update: async (args: unknown) => writes.push(args)
    },
    inventoryBatch: {
      update: async (args: unknown) => writes.push(args)
    },
    inventoryMovement: {
      create: async (args: unknown) => writes.push(args)
    }
  };
  const service = new InventoryService({
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (innerTx: unknown) => Promise<unknown>) => fn(tx)
  } as never);

  await service.outboundOrderInventory(
    {
      id: "purchasing-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.PURCHASING }
    },
    "order-1",
    { lines: [{ allocationId: "allocation-1", quantity: 12, unit: ProductUnit.METER }] } as never
  );

  const serialized = JSON.stringify(writes);
  assert.match(serialized, /"lockedQuantity":\{"decrement":12\}/);
  assert.match(serialized, /"outboundQuantity":\{"increment":12\}/);
  assert.match(serialized, /"movementType":"ORDER_OUT"/);
  assert.match(serialized, /"quantity":12/);
  assert.match(serialized, /"status":"LOCKED"/);
  assert.doesNotMatch(serialized, /"status":"OUTBOUND"/);
});
