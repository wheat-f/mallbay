import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConstructionLocation,
  ConstructionType,
  PaymentType,
  ProductUnit,
  StorePosition
} from "@prisma/client";
import { CreateOrderUseCase } from "./create-order.use-case";

const orderAccess = {
  can: async (actorId: string, capability: string, action: string, context: { storeId?: string; ownerId?: string } = {}) => {
    const role = actorId.startsWith("sales") ? "SALES" : actorId.startsWith("manager") ? "MANAGER" : actorId.startsWith("customer-service") ? "CUSTOMER_SERVICE" : "SALES";
    if (capability === "orders" && action === "write") return ["SALES", "MANAGER", "CUSTOMER_SERVICE"].includes(role);
    if (capability === "store" && action === "write") return role === "MANAGER";
    if (capability === "customers" && action === "read") return role !== "SALES" || context.ownerId === actorId;
    return false;
  }
};

const activeVehicle = () => ({
  id: "vehicle-1",
  storeId: "store-1",
  customerId: "customer-1",
  status: "ACTIVE",
  defaultContact: null
});

test("CreateOrderUseCase creates order items amount and deposit payment in one transaction", async () => {
  const operations: string[] = [];
  const tx = {
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [{ id: "product-1", basePriceCents: 5000000, status: "ACTIVE" }] },
    dailyCapacity: {
      findUnique: async () => ({
        id: "capacity-1",
        inStoreCapacity: 1,
        inStoreReserved: 0,
        outsideCapacity: 0,
        outsideReserved: 0,
        heatFilmCapacity: 0,
        heatFilmReserved: 0,
        inspectionCapacity: 0,
        inspectionReserved: 0
      }),
      update: async () => undefined
    },
    order: {
      create: async () => {
        operations.push("order.create");
        return { id: "order-1", orderNo: "ORD202605310001" };
      }
    },
    orderItem: { createMany: async () => operations.push("orderItem.createMany") },
    orderAmount: {
      create: async (args: unknown) => {
        operations.push("orderAmount.create");
        operations.push(JSON.stringify(args));
      }
    },
    paymentAccount: { findUnique: async () => ({ id: "account-1", storeId: "store-1", isActive: true }) },
    orderPayment: { create: async () => { operations.push("orderPayment.create"); return { id: "payment-1" }; } },
    paymentRecord: { create: async () => operations.push("paymentRecord.create") }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
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
    JSON.stringify({
      data: {
        orderId: "order-1",
        productAmountCents: 5000000,
        laborCostCents: 200000,
        constructionChargeCents: 200000,
        totalAmountCents: 5200000,
        paidAmountCents: 1000000,
        outstandingCents: 4200000,
        materialCostCents: 0,
        salesCommissionCents: 0,
        profitCents: 5200000
      }
    }),
    "orderPayment.create",
    "paymentRecord.create"
  ]);
});

test("CreateOrderUseCase snapshots the selected meter sales unit and its base inventory demand", async () => {
  const orderItemCreates: unknown[] = [];
  const tx = {
    dailyCapacity: { findUnique: async () => null },
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: {
      findMany: async () => [
        {
          id: "product-1",
          status: "ACTIVE",
          unit: ProductUnit.ROLL,
          salesUnit: ProductUnit.ROLL,
          inventoryUnit: ProductUnit.ROLL,
          metersPerRoll: 10
        }
      ]
    },
    order: { create: async () => ({ id: "order-1", orderNo: "ORD202606010001" }) },
    orderItem: { createMany: async (args: unknown) => orderItemCreates.push(args) },
    orderAmount: { create: async () => undefined },
    orderPayment: { create: async () => undefined }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
    next: () => "ORD202606010001"
  });

  await useCase.execute(
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
      items: [{ productId: "product-1", salesUnit: ProductUnit.METER, quantity: 2, unitPriceCents: 500000 }],
      laborCostCents: 200000
    }
  );

  const serialized = JSON.stringify(orderItemCreates);
  assert.match(serialized, /"salesUnit":"METER"/);
  assert.match(serialized, /"baseUnit":"ROLL"/);
  assert.match(serialized, /"baseQuantityPerSalesUnit":0\.1/);
  assert.match(serialized, /"requiredBaseQuantity":0\.2/);
});

test("CreateOrderUseCase reserves daily capacity for scheduled in store orders", async () => {
  const updates: unknown[] = [];
  const tx = {
    dailyCapacity: {
      findUnique: async () => ({
        id: "capacity-1",
        inStoreCapacity: 1,
        inStoreReserved: 0,
        outsideCapacity: 0,
        outsideReserved: 0,
        heatFilmCapacity: 0,
        heatFilmReserved: 0,
        inspectionCapacity: 0,
        inspectionReserved: 0
      }),
      update: async (args: unknown) => updates.push(args)
    },
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [{ id: "product-1", status: "ACTIVE" }] },
    order: { create: async () => ({ id: "order-1", orderNo: "ORD202606010001" }) },
    orderItem: { createMany: async () => undefined },
    orderAmount: { create: async () => undefined },
    orderPayment: { create: async () => undefined }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
    next: () => "ORD202606010001"
  });

  await useCase.execute(
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
      laborCostCents: 200000
    }
  );

  assert.deepEqual(updates, [
    {
      where: { id: "capacity-1" },
      data: { inStoreReserved: { increment: 1 } }
    }
  ]);
});

test("CreateOrderUseCase stores suggested labor snapshot and adjustment reason", async () => {
  const amountCreates: unknown[] = [];
  const tx = {
    dailyCapacity: {
      findUnique: async () => null
    },
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [{ id: "product-1", status: "ACTIVE" }] },
    order: { create: async () => ({ id: "order-1", orderNo: "ORD202606010002" }) },
    orderItem: { createMany: async () => undefined },
    orderAmount: { create: async (args: unknown) => amountCreates.push(args) },
    orderPayment: { create: async () => undefined }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
    next: () => "ORD202606010002"
  });

  await useCase.execute(
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
      constructionLocation: ConstructionLocation.OUTSIDE,
      constructionAddress: "客户小区",
      items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
      laborCostCents: 250000,
      suggestedLaborCostCents: 220000,
      laborCostAdjustmentReason: "外出距离远，需要增加人工费"
    } as never
  );

  assert.deepEqual(amountCreates, [
    {
      data: {
        orderId: "order-1",
        productAmountCents: 5000000,
        laborCostCents: 250000,
        suggestedLaborCostCents: 220000,
        laborCostAdjustmentReason: "外出距离远，需要增加人工费",
        constructionChargeCents: 250000,
        suggestedConstructionChargeCents: 220000,
        constructionChargeAdjustmentReason: "外出距离远，需要增加人工费",
        totalAmountCents: 5250000,
        paidAmountCents: 0,
        outstandingCents: 5250000,
        materialCostCents: 0,
        salesCommissionCents: 0,
        profitCents: 5250000
      }
    }
  ]);
});

test("CreateOrderUseCase rejects deposit when payment account is unavailable", async () => {
  const tx = {
    dailyCapacity: {
      findUnique: async () => null
    },
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [{ id: "product-1", status: "ACTIVE" }] },
    paymentAccount: {
      findUnique: async () => ({ id: "account-1", storeId: "store-2", isActive: true })
    },
    order: { create: async () => ({ id: "order-1", orderNo: "ORD202606010003" }) },
    orderItem: { createMany: async () => undefined },
    orderAmount: { create: async () => undefined },
    orderPayment: {
      create: async () => {
        throw new Error("deposit should not be created with an unavailable payment account");
      }
    }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
    next: () => "ORD202606010003"
  });

  await assert.rejects(
    () => useCase.execute(
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
        items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
        laborCostCents: 200000,
        deposit: {
          accountId: "account-1",
          amountCents: 1000000,
          paymentType: PaymentType.DEPOSIT,
          paidAt: "2026-05-31T10:00:00.000Z"
        }
      }
    ),
    /收款账户不可用/
  );
});

test("CreateOrderUseCase rejects sales creating orders for another sales person's customer", async () => {
  const tx = {
    dailyCapacity: {
      findUnique: async () => null
    },
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-2" })
    },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [{ id: "product-1", status: "ACTIVE" }] },
    order: {
      create: async () => {
        throw new Error("order should not be created for another sales person's customer");
      }
    },
    orderItem: { createMany: async () => undefined },
    orderAmount: { create: async () => undefined },
    orderPayment: { create: async () => undefined }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
    next: () => "ORD202606010004"
  });

  await assert.rejects(
    () => useCase.execute(
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
        items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
        laborCostCents: 200000
      }
    ),
    /无权限/
  );
});

test("CreateOrderUseCase rejects outside construction orders without address", async () => {
  const tx = {
    dailyCapacity: {
      findUnique: async () => null
    },
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [{ id: "product-1", status: "ACTIVE" }] },
    order: {
      create: async () => {
        throw new Error("outside order should not be created without construction address");
      }
    },
    orderItem: { createMany: async () => undefined },
    orderAmount: { create: async () => undefined },
    orderPayment: { create: async () => undefined }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
    next: () => "ORD202606010005"
  });

  await assert.rejects(
    () => useCase.execute(
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
        constructionLocation: ConstructionLocation.OUTSIDE,
        constructionAddress: "   ",
        items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
        laborCostCents: 200000
      }
    ),
    /外出地址不能为空/
  );
});

test("CreateOrderUseCase rejects scheduled orders without appointment time slot", async () => {
  const tx = {
    dailyCapacity: {
      findUnique: async () => ({
        id: "capacity-1",
        inStoreCapacity: 1,
        inStoreReserved: 0,
        outsideCapacity: 0,
        outsideReserved: 0,
        heatFilmCapacity: 0,
        heatFilmReserved: 0,
        inspectionCapacity: 0,
        inspectionReserved: 0
      }),
      update: async () => undefined
    },
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [{ id: "product-1", status: "ACTIVE" }] },
    order: {
      create: async () => {
        throw new Error("scheduled order should not be created without appointment time slot");
      }
    },
    orderItem: { createMany: async () => undefined },
    orderAmount: { create: async () => undefined },
    orderPayment: { create: async () => undefined }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
    next: () => "ORD202606010006"
  });

  await assert.rejects(
    () => useCase.execute(
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
        appointmentTimeSlot: "   ",
        items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
        laborCostCents: 200000
      }
    ),
    /预约时段不能为空/
  );
});

test("CreateOrderUseCase rejects appointment time slot without appointment date", async () => {
  const tx = {
    dailyCapacity: {
      findUnique: async () => null
    },
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [{ id: "product-1", status: "ACTIVE" }] },
    order: {
      create: async () => {
        throw new Error("order should not be created with appointment time slot but no date");
      }
    },
    orderItem: { createMany: async () => undefined },
    orderAmount: { create: async () => undefined },
    orderPayment: { create: async () => undefined }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
    next: () => "ORD202606010007"
  });

  await assert.rejects(
    () => useCase.execute(
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
        appointmentTimeSlot: "09:00-12:00",
        items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
        laborCostCents: 200000
      }
    ),
    /预约日期不能为空/
  );
});

test("CreateOrderUseCase rejects scheduled orders when daily capacity is full", async () => {
  const tx = {
    dailyCapacity: {
      findUnique: async () => ({
        id: "capacity-1",
        inStoreCapacity: 1,
        inStoreReserved: 1,
        outsideCapacity: 0,
        outsideReserved: 0,
        heatFilmCapacity: 0,
        heatFilmReserved: 0,
        inspectionCapacity: 0,
        inspectionReserved: 0
      })
    },
    customer: { findUnique: async () => null },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [] },
    order: { create: async () => ({ id: "order-1" }) },
    orderItem: { createMany: async () => undefined },
    orderAmount: { create: async () => undefined },
    orderPayment: { create: async () => undefined }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, orderAccess as never, {
    next: () => "ORD202606010002"
  });

  await assert.rejects(
    () => useCase.execute(
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
        laborCostCents: 200000
      }
    ),
    /施工容量已满/
  );
});


test("CreateOrderUseCase creates an ORDER capacity reservation for direct scheduled orders", async () => {
  const reservations: unknown[] = [];
  const tx = {
    dailyCapacity: {
      findUnique: async () => ({ id: "capacity-1", inStoreCapacity: 2, inStoreReserved: 0, outsideCapacity: 0, outsideReserved: 0, heatFilmCapacity: 0, heatFilmReserved: 0, inspectionCapacity: 0, inspectionReserved: 0 }),
      updateMany: async () => ({ count: 1 })
    },
    capacityReservation: { create: async (args: unknown) => { reservations.push(args); return { id: "reservation-1" }; } },
    customer: { findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" }) },
    customerVehicle: { findUnique: async () => activeVehicle() },
    product: { findMany: async () => [{ id: "product-1", status: "ACTIVE", quantityPrecision: 3 }] },
    order: { create: async () => ({ id: "order-1", orderNo: "ORD-1" }) },
    orderItem: { createMany: async () => undefined },
    orderAmount: { create: async () => undefined },
    orderPayment: { create: async () => undefined }
  };
  const useCase = new CreateOrderUseCase({ $transaction: async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx) } as never, orderAccess as never, { next: () => "ORD-1" });
  await useCase.execute({ id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } }, { storeId: "store-1", customerId: "customer-1", vehicleId: "vehicle-1", constructionType: ConstructionType.PPF, constructionLocation: ConstructionLocation.IN_STORE, appointmentDate: "2026-06-01", appointmentTimeSlot: "09:00-12:00", items: [{ productId: "product-1", quantity: 1, unitPriceCents: 1000 }], laborCostCents: 100 } as never);
  assert.equal(reservations.length, 1);
  assert.equal((reservations[0] as { data: { sourceType: string; orderId: string; status: string } }).data.sourceType, "ORDER");
  assert.equal((reservations[0] as { data: { sourceType: string; orderId: string; status: string } }).data.orderId, "order-1");
});
