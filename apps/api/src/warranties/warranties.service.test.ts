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
          photos: [{ id: "photo-1", url: "https://oss/photo-before.jpg" }]
        }
      }),
      update: async (args: unknown) => writes.push(args)
    },
    warranty: {
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
  assert.equal(JSON.stringify(writes).includes(OrderStatus.WARRANTIED), true);
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
