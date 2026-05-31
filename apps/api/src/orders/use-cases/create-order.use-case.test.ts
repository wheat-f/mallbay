import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConstructionLocation,
  ConstructionType,
  PaymentType,
  StorePosition
} from "@prisma/client";
import { CreateOrderUseCase } from "./create-order.use-case";

test("CreateOrderUseCase creates order items amount and deposit payment in one transaction", async () => {
  const operations: string[] = [];
  const tx = {
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: { findUnique: async () => ({ id: "vehicle-1", customerId: "customer-1" }) },
    product: { findMany: async () => [{ id: "product-1", basePriceCents: 5000000, status: "ACTIVE" }] },
    order: {
      create: async () => {
        operations.push("order.create");
        return { id: "order-1", orderNo: "ORD202605310001" };
      }
    },
    orderItem: { createMany: async () => operations.push("orderItem.createMany") },
    orderAmount: { create: async () => operations.push("orderAmount.create") },
    orderPayment: { create: async () => operations.push("orderPayment.create") }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, {
    next: () => "ORD202605310001"
  });

  const result = await useCase.execute(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    {
      storeId: "store-1",
      customerId: "customer-1",
      vehicleId: "vehicle-1",
      constructionType: ConstructionType.PPF,
      constructionLocation: ConstructionLocation.IN_STORE,
      appointmentDate: "2026-06-01",
      appointmentTimeSlot: "09:00-12:00",
      items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
      laborCostCents: 200000,
      deposit: {
        accountId: "account-1",
        amountCents: 1000000,
        paymentType: PaymentType.DEPOSIT,
        paidAt: "2026-05-31T10:00:00.000Z"
      }
    }
  );

  assert.deepEqual(result, { id: "order-1", orderNo: "ORD202605310001" });
  assert.deepEqual(operations, [
    "order.create",
    "orderItem.createMany",
    "orderAmount.create",
    "orderPayment.create"
  ]);
});
