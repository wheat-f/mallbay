export type StoreFlowFixture = {
  store: { id: "store-flow-1"; name: "流程验收门店" };
  manager: { id: "manager-flow-1"; role: "STORE_MANAGER" };
  worker: { id: "worker-flow-1"; role: "CONSTRUCTION" };
  customer: { id: "customer-flow-1"; name: "流程验收客户" };
  vehicle: { id: "vehicle-flow-1"; customerId: "customer-flow-1"; plateNo: "京FLOW01" };
  filmProduct: { id: "product-film-1"; salesUnit: "METER"; baseUnit: "METER" };
  order: { id: "order-flow-1"; customerId: "customer-flow-1"; vehicleId: "vehicle-flow-1" };
};

export type StoreFlowState = {
  orderStatus: "PENDING_DISPATCH" | "DISPATCHED" | "IN_CONSTRUCTION" | "COMPLETED" | "WARRANTIED";
  inventoryAvailableBaseQuantity: number;
  inventoryLockedBaseQuantity: number;
  constructionStatus: "NOT_ASSIGNED" | "ASSIGNED" | "IN_CONSTRUCTION" | "COMPLETED" | "QUALITY_PASSED";
  materialsPicked: boolean;
  warrantyStatus: "NOT_CREATED" | "ACTIVE";
  afterSaleStatus: "NOT_CREATED" | "OPEN" | "ASSIGNED" | "RESOLVED" | "CLOSED";
  afterSaleEvidenceCount: number;
  afterSaleEvidenceNote?: string;
  purchaseRequirementStatus: "OPEN" | "PARTIAL_ORDERED" | "ORDERED" | "PARTIAL_RECEIVED" | "FULFILLED";
  purchaseOrders: Array<{
    supplierName: string;
    quantity: number;
    expectedAt: string;
    receivedQuantity: number;
  }>;
  auditEvents: string[];
};

export type StoreFlowPurchaseOrderInput = {
  supplierName: string;
  quantity: number;
  expectedAt: string;
};

export type StoreFlowScenario = StoreFlowFixture & {
  state: StoreFlowState;
  lockInventory(): void;
  outboundInventory(quantityInBaseUnit: number): void;
  dispatchConstruction(): void;
  pickupMaterials(): void;
  startConstruction(): void;
  completeConstruction(): void;
  passQualityCheck(): void;
  generateWarranty(): void;
  createAfterSale(): void;
  assignAfterSale(): void;
  submitAfterSaleEvidence(photoCount: number, note: string): void;
  judgeAfterSale(): void;
  closeAfterSale(): void;
  createPurchaseOrders(orders: StoreFlowPurchaseOrderInput[]): void;
  receivePurchaseOrder(supplierName: string): void;
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

export function createStoreFlowScenario(options: { initialInventoryBaseQuantity?: number } = {}): StoreFlowScenario {
  const fixture = createStoreFlowFixture();
  const initialInventoryBaseQuantity = options.initialInventoryBaseQuantity ?? 18;
  const state: StoreFlowState = {
    orderStatus: "PENDING_DISPATCH",
    inventoryAvailableBaseQuantity: initialInventoryBaseQuantity,
    inventoryLockedBaseQuantity: 0,
    constructionStatus: "NOT_ASSIGNED",
    materialsPicked: false,
    warrantyStatus: "NOT_CREATED",
    afterSaleStatus: "NOT_CREATED",
    afterSaleEvidenceCount: 0,
    purchaseRequirementStatus: initialInventoryBaseQuantity >= 18 ? "FULFILLED" : "OPEN",
    purchaseOrders: [],
    auditEvents: []
  };
  const record = (event: string) => {
    if (!state.auditEvents.includes(event)) state.auditEvents.push(event);
  };

  return {
    ...fixture,
    state,
    lockInventory() {
      if (state.inventoryLockedBaseQuantity === 18 || (state.orderStatus !== "PENDING_DISPATCH" && state.inventoryLockedBaseQuantity === 0)) return;
      if (state.orderStatus !== "PENDING_DISPATCH") throw new Error("订单当前不可锁定库存");
      if (state.inventoryAvailableBaseQuantity < 18) {
        record("PURCHASE_REQUIREMENT_CREATED");
        state.purchaseRequirementStatus = "OPEN";
        return;
      }
      state.inventoryLockedBaseQuantity = 18;
      state.orderStatus = "DISPATCHED";
      record("INVENTORY_LOCKED");
    },
    createPurchaseOrders(orders) {
      if (state.purchaseRequirementStatus !== "OPEN" && state.purchaseRequirementStatus !== "PARTIAL_ORDERED") {
        throw new Error("当前采购需求不可创建采购单");
      }
      if (orders.length === 0 || orders.some((order) => order.quantity <= 0 || !order.supplierName || !order.expectedAt)) {
        throw new Error("采购单必须包含供应商、数量和预计到货日期");
      }
      const alreadyOrdered = state.purchaseOrders.reduce((sum, order) => sum + order.quantity, 0);
      const requested = orders.reduce((sum, order) => sum + order.quantity, 0);
      if (alreadyOrdered + requested > 18) throw new Error("采购总量超过剩余需求");
      state.purchaseOrders.push(...orders.map((order) => ({ ...order, receivedQuantity: 0 })));
      state.purchaseRequirementStatus = alreadyOrdered + requested === 18 ? "ORDERED" : "PARTIAL_ORDERED";
      record("PURCHASE_ORDERS_CREATED");
    },
    receivePurchaseOrder(supplierName) {
      const order = state.purchaseOrders.find((item) => item.supplierName === supplierName);
      if (!order) throw new Error("供应商采购单不存在");
      if (order.receivedQuantity === order.quantity) return;
      order.receivedQuantity = order.quantity;
      state.inventoryAvailableBaseQuantity += order.quantity;
      const received = state.purchaseOrders.reduce((sum, item) => sum + item.receivedQuantity, 0);
      const ordered = state.purchaseOrders.reduce((sum, item) => sum + item.quantity, 0);
      state.purchaseRequirementStatus = received === ordered ? "FULFILLED" : "PARTIAL_RECEIVED";
      record(`PURCHASE_RECEIVED_${supplierName}`);
    },
    outboundInventory(quantityInBaseUnit) {
      if (state.inventoryLockedBaseQuantity === 0) return;
      if (quantityInBaseUnit <= 0 || quantityInBaseUnit > state.inventoryLockedBaseQuantity) {
        throw new Error("出库数量超过锁定库存");
      }
      state.inventoryAvailableBaseQuantity -= quantityInBaseUnit;
      state.inventoryLockedBaseQuantity -= quantityInBaseUnit;
      record("INVENTORY_OUTBOUNDED");
    },
    dispatchConstruction() {
      if (state.constructionStatus !== "NOT_ASSIGNED") return;
      if (state.orderStatus !== "DISPATCHED" || state.inventoryLockedBaseQuantity !== 0) {
        throw new Error("库存出库完成后才能施工派工");
      }
      state.constructionStatus = "ASSIGNED";
      record("CONSTRUCTION_ASSIGNED");
    },
    pickupMaterials() {
      if (state.materialsPicked) return;
      if (state.constructionStatus !== "ASSIGNED") throw new Error("派工后才能领取物料");
      state.materialsPicked = true;
      record("MATERIALS_PICKED");
    },
    startConstruction() {
      if (state.constructionStatus === "IN_CONSTRUCTION") return;
      if (!state.materialsPicked) throw new Error("领取物料后才能施工");
      state.constructionStatus = "IN_CONSTRUCTION";
      state.orderStatus = "IN_CONSTRUCTION";
      record("CONSTRUCTION_STARTED");
    },
    completeConstruction() {
      if (state.constructionStatus === "COMPLETED" || state.constructionStatus === "QUALITY_PASSED") return;
      if (state.constructionStatus !== "IN_CONSTRUCTION") throw new Error("施工中才能完工");
      state.constructionStatus = "COMPLETED";
      state.orderStatus = "COMPLETED";
      record("CONSTRUCTION_COMPLETED");
    },
    passQualityCheck() {
      if (state.constructionStatus === "QUALITY_PASSED") return;
      if (state.constructionStatus !== "COMPLETED") throw new Error("完工后才能质检");
      state.constructionStatus = "QUALITY_PASSED";
      record("QUALITY_PASSED");
    },
    generateWarranty() {
      if (state.warrantyStatus === "ACTIVE") return;
      if (state.constructionStatus !== "QUALITY_PASSED") throw new Error("质检通过后才能生成质保");
      state.warrantyStatus = "ACTIVE";
      state.orderStatus = "WARRANTIED";
      record("WARRANTY_CREATED");
    },
    createAfterSale() {
      if (state.afterSaleStatus !== "NOT_CREATED") return;
      if (state.warrantyStatus !== "ACTIVE") throw new Error("有效质保后才能发起售后");
      state.afterSaleStatus = "OPEN";
      record("AFTER_SALE_CREATED");
    },
    assignAfterSale() {
      if (state.afterSaleStatus === "ASSIGNED") return;
      if (state.afterSaleStatus !== "OPEN") throw new Error("售后待处理才能派单");
      state.afterSaleStatus = "ASSIGNED";
      record("AFTER_SALE_ASSIGNED");
    },
    submitAfterSaleEvidence(photoCount, note) {
      if (state.afterSaleEvidenceCount > 0) return;
      if (state.afterSaleStatus !== "ASSIGNED" || photoCount < 1) throw new Error("派单后必须提交施工后照片");
      state.afterSaleEvidenceCount = photoCount;
      state.afterSaleEvidenceNote = note;
      record("AFTER_SALE_EVIDENCE_SUBMITTED");
    },
    judgeAfterSale() {
      if (state.afterSaleStatus === "RESOLVED" || state.afterSaleStatus === "CLOSED") return;
      if (state.afterSaleStatus !== "ASSIGNED" || state.afterSaleEvidenceCount < 1) throw new Error("证据齐全后才能判责");
      state.afterSaleStatus = "RESOLVED";
      record("AFTER_SALE_RESPONSIBILITY_JUDGED");
    },
    closeAfterSale() {
      if (state.afterSaleStatus === "CLOSED") return;
      if (state.afterSaleStatus !== "RESOLVED") throw new Error("判责完成后才能关闭售后");
      state.afterSaleStatus = "CLOSED";
      record("AFTER_SALE_CLOSED");
    }
  };
}
