import assert from "node:assert/strict";
import test from "node:test";
import {
  ConstructionLocation,
  ConstructionType,
  CustomerContactRole,
  CustomerVehicleStatus,
  ProductStatus,
  ProductUnit,
  StorePosition
} from "@prisma/client";
import { CreateOrderUseCase } from "./create-order.use-case";

const orderAccess = {
  can: async (actorId: string, capability: string, action: string, context: { ownerId?: string } = {}) => {
    if (capability === "orders" && action === "write") return true;
    if (capability === "customers" && action === "read") return context.ownerId === actorId;
    return capability === "store" && action === "write";
  }
};

const actor = {
  id: "sales-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.SALES }
};

const baseDto = () => ({
  storeId: "store-1",
  customerId: "customer-1",
  vehicleId: "vehicle-1",
  constructionType: ConstructionType.PPF,
  constructionLocation: ConstructionLocation.IN_STORE,
  items: [{ productId: "product-1", quantity: 1, unitPriceCents: 1_000 }],
  laborCostCents: 100
});

const contact = (overrides: Record<string, unknown> = {}) => ({
  id: "contact-1",
  customerId: "customer-1",
  name: "联系人一",
  phoneEncrypted: "encrypted-phone-1",
  phoneHash: "phone-hash-1",
  role: CustomerContactRole.PRIMARY,
  department: "采购部",
  isDefault: false,
  ...overrides
});

const customer = (users: Array<ReturnType<typeof contact>> = []) => ({
  id: "customer-1",
  storeId: "store-1",
  ownerUserId: "sales-1",
  name: "测试客户",
  companyName: null,
  contactPerson: "基础联系人",
  phoneEncrypted: "customer-encrypted-phone",
  phoneHash: "customer-phone-hash",
  users
});

const vehicle = (overrides: Record<string, unknown> = {}) => ({
  id: "vehicle-1",
  storeId: "store-1",
  customerId: "customer-1",
  status: CustomerVehicleStatus.ACTIVE,
  defaultContact: null,
  ...overrides
});

function createHarness(options: {
  customer?: ReturnType<typeof customer> | null;
  vehicle?: ReturnType<typeof vehicle> | null;
} = {}) {
  const captured: { orderData?: Record<string, unknown> } = {};
  const tx = {
    customer: { findUnique: async () => options.customer === undefined ? customer() : options.customer },
    customerVehicle: { findUnique: async () => options.vehicle === undefined ? vehicle() : options.vehicle },
    product: {
      findMany: async () => [{
        id: "product-1",
        storeId: "store-1",
        name: "测试产品",
        status: ProductStatus.ACTIVE,
        quantityPrecision: 3,
        salesUnit: ProductUnit.ROLL,
        unit: ProductUnit.ROLL,
        inventoryUnit: ProductUnit.ROLL,
        metersPerRoll: null
      }]
    },
    order: {
      create: async (args: { data: Record<string, unknown> }) => {
        captured.orderData = args.data;
        return { id: "order-1", ...args.data };
      }
    },
    orderItem: { createMany: async () => ({ count: 1 }) },
    orderAmount: { create: async () => ({ id: "amount-1" }) }
  };
  const useCase = new CreateOrderUseCase(
    { $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx) } as never,
    orderAccess as never,
    { next: () => "ORD-1" }
  );
  return { useCase, captured };
}

test("正式订单缺少车辆时由服务端拒绝", async () => {
  const { useCase } = createHarness();
  const dto = baseDto();
  const { vehicleId: _vehicleId, ...withoutVehicle } = dto;
  await assert.rejects(() => useCase.execute(actor as never, withoutVehicle as never), /正式订单必须选择车辆/);
});

test("停用车辆不能用于创建正式订单", async () => {
  const { useCase } = createHarness({ vehicle: vehicle({ status: CustomerVehicleStatus.INACTIVE }) });
  await assert.rejects(() => useCase.execute(actor as never, baseDto()), /该车辆已停用/);
});

test("跨客户或跨门店车辆不能用于创建正式订单", async () => {
  for (const invalidVehicle of [vehicle({ customerId: "customer-2" }), vehicle({ storeId: "store-2" })]) {
    const { useCase } = createHarness({ vehicle: invalidVehicle });
    await assert.rejects(() => useCase.execute(actor as never, baseDto()), /车辆不属于该客户或当前门店/);
  }
});

test("显式选择的订单联系人会冻结为订单快照", async () => {
  const selected = contact({ id: "contact-selected", name: "王经理", department: "车队部" });
  const { useCase, captured } = createHarness({ customer: customer([selected]) });
  await useCase.execute(actor as never, { ...baseDto(), contactId: "contact-selected" });
  assert.deepEqual(captured.orderData?.contactSnapshot, {
    create: {
      sourceContactId: "contact-selected",
      contactName: "王经理",
      contactPhoneEncrypted: "encrypted-phone-1",
      contactPhoneHash: "phone-hash-1",
      role: CustomerContactRole.PRIMARY,
      department: "车队部"
    }
  });
});

test("未指定联系人时优先使用车辆默认联系人，并保留客户级兜底", async () => {
  const vehicleDefault = contact({ id: "contact-vehicle", name: "车辆负责人", role: CustomerContactRole.DRIVER });
  const customerDefault = contact({ id: "contact-customer", name: "客户默认联系人", isDefault: true });
  const firstHarness = createHarness({
    customer: customer([customerDefault, vehicleDefault]),
    vehicle: vehicle({ defaultContact: vehicleDefault })
  });
  await firstHarness.useCase.execute(actor as never, baseDto());
  assert.equal(
    (firstHarness.captured.orderData?.contactSnapshot as { create?: { sourceContactId?: string } })?.create?.sourceContactId,
    "contact-vehicle"
  );
  const fallbackHarness = createHarness({ customer: customer([]) });
  await fallbackHarness.useCase.execute(actor as never, baseDto());
  assert.deepEqual(fallbackHarness.captured.orderData?.contactSnapshot, {
    create: {
      contactName: "基础联系人",
      contactPhoneEncrypted: "customer-encrypted-phone",
      contactPhoneHash: "customer-phone-hash"
    }
  });
});
