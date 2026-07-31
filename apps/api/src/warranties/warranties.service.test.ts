import assert from "node:assert/strict";
import { test } from "node:test";
import { OrderStatus, StorePosition, WarrantyStatus } from "@prisma/client";
import { WarrantiesService } from "./warranties.service";

test("WarrantiesService creates warranty from completed order with construction photos", async () => {
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
        customerId: "customer-1",
        vehicleId: "vehicle-1",
        status: OrderStatus.COMPLETED,
        items: [{ product: { name: "PPF", warrantyYears: 5 } }],
        constructionRecord: {
          qualityResult: "PASS",
          photos: [{ id: "photo-1", url: "https://oss/photo-before.jpg" }]
        }
      }),
      update: async (args: unknown) => writes.push(args)
    },
    warranty: {
      findUnique: async () => null,
      create: async (args: unknown) => {
        writes.push(args);
        return {
          id: "warranty-1",
          warrantyNo: "WAR202606010001",
          status: WarrantyStatus.ACTIVE
        };
      }
    }
  };
  const service = new WarrantiesService(prisma as never);

  const result = await service.createFromOrder(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    {
      orderId: "order-1",
      scope: "整车漆面保护膜",
      startDate: "2026-06-01"
    }
  );

  assert.equal(result.id, "warranty-1");
  assert.equal(JSON.stringify(writes).includes("photo-before.jpg"), true);
  assert.equal(JSON.stringify(writes).includes(WarrantyStatus.PENDING_ACTIVATION), true);
});

test("WarrantiesService looks up active warranty by warranty number for customer query", async () => {
  const prisma = {
    warranty: {
      findUnique: async (args: unknown) => ({
        id: "warranty-1",
        warrantyNo: (args as { where: { warrantyNo: string } }).where.warrantyNo,
        status: WarrantyStatus.ACTIVE
      })
    }
  };
  const service = new WarrantiesService(prisma as never);

  const result = await service.lookup("WAR202606010001");

  assert.equal(result?.warrantyNo, "WAR202606010001");
  assert.equal(result?.status, WarrantyStatus.ACTIVE);
});

test("WarrantiesService returns the existing warranty for an idempotent retry", async () => {
  const existing = {
    id: "warranty-1",
    orderId: "order-1",
    warrantyNo: "WAR202606010001",
    status: WarrantyStatus.ACTIVE,
    photos: []
  };
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      order: {
        findUnique: async () => ({
          id: "order-1",
          storeId: "store-1",
          customerId: "customer-1",
          vehicleId: "vehicle-1",
          status: OrderStatus.WARRANTIED,
          items: [],
          constructionRecord: { qualityResult: "PASS", photos: [] }
        })
      },
      warranty: {
        findUnique: async () => existing,
        create: async () => {
          throw new Error("不应重复创建质保卡");
        }
      }
    })
  };
  const service = new WarrantiesService(prisma as never);

  const result = await service.createFromOrder(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    { orderId: "order-1", scope: "整车漆面保护膜", startDate: "2026-06-01" }
  );

  assert.deepEqual(result, existing);
});

test("WarrantiesService lists warranties with order customer and vehicle summary", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    warranty: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new WarrantiesService(prisma as never);

  await service.list(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    { storeId: "store-1" }
  );

  const serialized = JSON.stringify(calls[0]);
  assert.match(serialized, /"order"/);
  assert.match(serialized, /"orderNo"/);
  assert.match(serialized, /"customer"/);
  assert.match(serialized, /"vehicle"/);
});

test("WarrantiesService limits sales warranty list to their own orders", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    warranty: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new WarrantiesService(prisma as never);

  await service.list(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    { storeId: "store-1" }
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    order: { salesPersonId: "sales-1" }
  });
});

test("WarrantiesService rejects sales viewing another sales person's warranty detail", async () => {
  const prisma = {
    storeMember: { findUnique: async () => null },
    warranty: {
      findUnique: async () => ({
        id: "warranty-1",
        storeId: "store-1",
        order: { salesPersonId: "sales-2" }
      })
    }
  };
  const service = new WarrantiesService(prisma as never);

  await assert.rejects(
    () =>
      service.detail(
        {
          id: "sales-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.SALES }
        },
        "warranty-1"
      ),
    /无权限/
  );
});

test("WarrantiesService returns persisted warranty audit events in detail", async () => {
  const events = [{ id: "event-1", action: "WARRANTY_CREATED", targetType: "warranty", targetId: "warranty-1" }];
  const prisma = {
    storeMember: { findUnique: async () => null },
    warranty: {
      findUnique: async () => ({
        id: "warranty-1",
        storeId: "store-1",
        order: { salesPersonId: "sales-1" },
        afterSales: [{ id: "after-sale-1" }]
      })
    },
    auditEvent: {
      findMany: async (args: unknown) => {
        assert.deepEqual(args, {
          where: {
            OR: [
              { targetType: "warranty", targetId: "warranty-1" },
              { targetType: "after_sale", targetId: { in: ["after-sale-1"] } }
            ]
          },
          orderBy: { createdAt: "desc" },
          take: 50
        });
        return events;
      }
    }
  };
  const service = new WarrantiesService(prisma as never);

  const result = await service.detail(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "warranty-1"
  );

  assert.deepEqual(result.events, events);
});
