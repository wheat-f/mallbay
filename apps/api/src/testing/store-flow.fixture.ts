export type StoreFlowFixture = {
  store: { id: "store-flow-1"; name: "流程验收门店" };
  manager: { id: "manager-flow-1"; role: "STORE_MANAGER" };
  worker: { id: "worker-flow-1"; role: "CONSTRUCTION" };
  customer: { id: "customer-flow-1"; name: "流程验收客户" };
  vehicle: { id: "vehicle-flow-1"; customerId: "customer-flow-1"; plateNo: "京FLOW01" };
  filmProduct: { id: "product-film-1"; salesUnit: "METER"; baseUnit: "METER" };
  order: { id: "order-flow-1"; customerId: "customer-flow-1"; vehicleId: "vehicle-flow-1" };
};

export function createStoreFlowFixture(): StoreFlowFixture {
  return {
    store: { id: "store-flow-1", name: "流程验收门店" },
    manager: { id: "manager-flow-1", role: "STORE_MANAGER" },
    worker: { id: "worker-flow-1", role: "CONSTRUCTION" },
    customer: { id: "customer-flow-1", name: "流程验收客户" },
    vehicle: { id: "vehicle-flow-1", customerId: "customer-flow-1", plateNo: "京FLOW01" },
    filmProduct: { id: "product-film-1", salesUnit: "METER", baseUnit: "METER" },
    order: { id: "order-flow-1", customerId: "customer-flow-1", vehicleId: "vehicle-flow-1" }
  };
}
