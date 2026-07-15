import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getInventoryBatchLabel,
  formatBatchLockedStockLabel,
  formatBatchPhysicalStockLabel,
  formatBatchStockLabel,
  formatPackageSnapshotLabel,
  getInventoryBatchSplitSummary,
  getInventoryAllocationStatusLabel,
  getInventoryBatchAttentionLabels,
  getInventoryBatchStockSnapshot,
  getInventoryMovementTypeLabel,
  getInventoryOrderCustomerLabel,
  getInventoryOrderItemsSummary,
  getInventoryProductLabel,
  getInventoryOrderVehicleLabel,
  getInventoryMovementSummary,
  getPurchaseInboundItemDetails,
  getPurchaseOrderArrivalReminder,
  getPurchaseOrderStatusLabel,
  getPurchaseRequirementItemsSummary,
  getPurchaseRequirementStatusLabel,
  getPurchaseRequirementSourceOrderLabel
} from "./display";

test("getInventoryOrderCustomerLabel formats personal and company customers", () => {
  assert.equal(getInventoryOrderCustomerLabel({ customer: { name: "小明" } }), "小明");
  assert.equal(getInventoryOrderCustomerLabel({ customer: { companyName: "长沙膜店", contactName: "周七" } }), "长沙膜店 / 周七");
});

test("getInventoryOrderVehicleLabel formats plate model and color", () => {
  assert.equal(
    getInventoryOrderVehicleLabel({ vehicle: { plateNo: "湘A101ZQ", model: "宝马5系", color: "黑色" } }),
    "湘A101ZQ / 宝马5系 / 黑色"
  );
  assert.equal(
    getInventoryOrderVehicleLabel({ vehicle: { carPlate: "湘A101ZQ", carModel: "宝马5系", carColor: "黑色" } }),
    "湘A101ZQ / 宝马5系 / 黑色"
  );
});

test("getPurchaseRequirementSourceOrderLabel formats source order business fields", () => {
  assert.equal(
    getPurchaseRequirementSourceOrderLabel({
      sourceOrder: {
        orderNo: "SO-001",
        customer: { name: "周七" },
        vehicle: { carPlate: "湘A101ZQ", carModel: "宝马5系" },
        items: [{ quantity: 1, product: { brand: "品牌1", name: "漆面保护膜", model: "PPF-100" } }]
      }
    }),
    "SO-001 · 周七 · 湘A101ZQ / 宝马5系 · 品牌：品牌1 / 名称：漆面保护膜 / 型号：PPF-100 x 1"
  );
  assert.equal(getPurchaseRequirementSourceOrderLabel({ sourceOrderId: undefined }), "手工创建");
});

test("getPurchaseRequirementItemsSummary formats product quantity and unit instead of requirement ids", () => {
  const products = new Map([
    ["product-1", { brand: "品牌1", name: "漆面保护膜", model: "PPF-100" }]
  ]);

  assert.equal(
    getPurchaseRequirementItemsSummary(
      {
        items: [
          { productId: "product-1", requiredQuantity: "15", requiredUnit: "METER" },
          { productId: "missing-product", requiredQuantity: 2, requiredUnit: "ROLL" }
        ]
      },
      products
    ),
    "品牌：品牌1 / 名称：漆面保护膜 / 型号：PPF-100 x 15 米；产品信息待确认 x 2 卷"
  );
  assert.equal(getPurchaseRequirementItemsSummary({ items: [] }, products), "-");
});

test("getInventoryOrderItemsSummary formats product details and quantity", () => {
  assert.equal(
    getInventoryOrderItemsSummary({
      items: [
        {
          quantity: 2,
          product: { brand: "品牌1", name: "漆面保护膜", model: "PPF-100" }
        }
      ]
    }),
    "品牌：品牌1 / 名称：漆面保护膜 / 型号：PPF-100 x 2"
  );
});

test("getInventoryOrderItemsSummary does not expose technical product ids when product summary is missing", () => {
  assert.equal(
    getInventoryOrderItemsSummary({
      items: [
        {
          quantity: 2,
          productId: "product-technical-id",
          product: null
        }
      ]
    }),
    "产品信息待确认 x 2"
  );
});

test("inventory product and batch labels use product display helpers", () => {
  const products = new Map([
    ["product-1", { brand: "品牌1", name: "漆面保护膜", model: "PPF-100" }]
  ]);

  assert.equal(getInventoryProductLabel("product-1", products), "品牌：品牌1 / 名称：漆面保护膜 / 型号：PPF-100");
  assert.equal(getInventoryProductLabel("missing-product", products), "产品信息待确认");
  assert.equal(
    getInventoryBatchLabel(
      { batchNo: "BOP001", productId: "product-1", availableQuantity: 12 },
      products
    ),
    "BOP001 · 品牌：品牌1 / 名称：漆面保护膜 / 型号：PPF-100 · 可用 12"
  );
});

test("formatBatchStockLabel shows base and package equivalent quantities", () => {
  assert.equal(
    formatBatchStockLabel({
      availableQuantity: 6,
      unit: "METER",
      packageUnit: "ROLL",
      baseQuantityPerPackage: 18
    }),
    "可用 6 米 / 折合 0.333 卷"
  );
});

test("inventory batch stock snapshot keeps available, locked and physical remaining distinct", () => {
  const batch = {
    totalQuantity: 18,
    availableQuantity: 0,
    lockedQuantity: 6,
    outboundQuantity: 12,
    unit: "METER",
    packageUnit: "ROLL",
    baseQuantityPerPackage: 18
  } as const;

  assert.deepEqual(getInventoryBatchStockSnapshot(batch), {
    totalQuantity: 18,
    availableQuantity: 0,
    lockedQuantity: 6,
    outboundQuantity: 12,
    physicalRemainingQuantity: 6,
    balanceDifference: 0,
    isBalanceAbnormal: false,
    isDepleted: false,
    isLowStock: false,
    isPartiallyOutbound: true,
    needsAttention: true
  });
  assert.equal(formatBatchPhysicalStockLabel(batch), "实物 6 米 / 折合 0.333 卷");
  assert.equal(formatBatchStockLabel(batch), "可用 0 米 / 折合 0 卷");
  assert.equal(formatBatchLockedStockLabel(batch), "锁定 6 米 / 折合 0.333 卷");
  assert.deepEqual(getInventoryBatchAttentionLabels(batch), ["部分出库"]);
});

test("inventory batch stock snapshot detects depleted and unbalanced batches", () => {
  assert.deepEqual(
    getInventoryBatchAttentionLabels({
      totalQuantity: 18,
      availableQuantity: 0,
      lockedQuantity: 0,
      outboundQuantity: 12
    }),
    ["数据异常", "已耗尽"]
  );
});

test("formatPackageSnapshotLabel shows original inbound package conversion", () => {
  assert.equal(
    formatPackageSnapshotLabel({
      packageQuantity: 1,
      packageUnit: "ROLL",
      baseQuantityPerPackage: 18,
      unit: "METER"
    }),
    "原始入库 1 卷 · 1 卷 = 18 米"
  );
});

test("getInventoryMovementTypeLabel formats stock movement enum values", () => {
  assert.equal(getInventoryMovementTypeLabel("PURCHASE_IN"), "采购入库");
  assert.equal(getInventoryMovementTypeLabel("DAMAGE_OUT"), "报损出库");
  assert.equal(getInventoryMovementTypeLabel("UNKNOWN"), "库存变动类型待确认");
});

test("inventory purchase and allocation status helpers format business labels", () => {
  assert.equal(getInventoryAllocationStatusLabel("LOCKED"), "已锁定");
  assert.equal(getInventoryAllocationStatusLabel("OUTBOUND"), "已出库");
  assert.equal(getInventoryAllocationStatusLabel("UNKNOWN"), "库存分配状态待确认");
  assert.equal(getPurchaseRequirementStatusLabel("PARTIAL_RECEIVED"), "部分入库");
  assert.equal(getPurchaseRequirementStatusLabel("UNKNOWN"), "采购需求状态待确认");
  assert.equal(getPurchaseOrderStatusLabel("DRAFT"), "草稿");
  assert.equal(getPurchaseOrderStatusLabel("UNKNOWN"), "采购单状态待确认");
});

test("getInventoryMovementSummary totals filtered movement quantities by business direction", () => {
  assert.deepEqual(
    getInventoryMovementSummary([
      { movementType: "PURCHASE_IN", quantity: 5 },
      { movementType: "ORDER_LOCK", quantity: 2 },
      { movementType: "ORDER_OUT", quantity: 1.5 },
      { movementType: "STOCK_RELEASE", quantity: 0.5 },
      { movementType: "DAMAGE_OUT", quantity: 1 },
      { movementType: "COUNT_IN", quantity: "3" },
      { movementType: "TRANSFER_OUT", quantity: 2 },
      { movementType: "BATCH_SPLIT", quantity: 4 }
    ]),
    {
      inbound: "8",
      outbound: "4.5",
      locked: "2",
      released: "0.5",
      adjustments: "4",
      totalRows: "8"
    }
  );
});

test("getInventoryBatchSplitSummary explains original child and conversion quantities", () => {
  assert.deepEqual(
    getInventoryBatchSplitSummary({
      originalBatch: { batchNo: "BOP001", availableQuantity: 2 },
      childBatch: { batchNo: "BOP001-01", availableQuantity: 30, unit: "METER" },
      quantityMeters: 30,
      metersPerRoll: 50,
      quantityPrecision: 3
    }),
    {
      original: "原批次 BOP001 剩余约 1.4 卷",
      child: "新批次 BOP001-01 生成 30 米",
      conversion: "换算关系 1 卷 = 50 米，本次拆分 30 米 = 0.6 卷"
    }
  );
});

test("getPurchaseInboundItemDetails formats product purchase and received batch fields", () => {
  assert.deepEqual(
    getPurchaseInboundItemDetails({
      product: {
        brand: "品牌1",
        name: "漆面保护膜",
        model: "PPF-100",
        category: "PPF",
        specification: "1.52*15米",
        inventoryUnit: "ROLL",
        salesUnit: "METER",
        rollWidthMeters: 1.52,
        rollLengthMeters: 15,
        metersPerRoll: 15,
        quantityPrecision: 3,
        warrantyYears: 5
      },
      quantity: 2,
      receivedQuantity: 1,
      receivedBatches: [
        {
          batchNo: "B20260606",
          quantity: 1,
          receivedAt: "2026-06-06T08:00:00.000Z"
        }
      ]
    }),
    {
      product: "品牌：品牌1 / 名称：漆面保护膜 / 型号：PPF-100",
      category: "漆面保护膜",
      specification: "库存单位：卷 / 销售单位：米 / 卷宽：1.52m / 卷长：15m / 1卷=15m / 精度：3位小数",
      warranty: "5 年",
      quantity: "采购 2 / 已入库 1",
      batches: "B20260606 x 1（2026-06-06）"
    }
  );
});

test("getPurchaseOrderArrivalReminder explains expected arrival risks", () => {
  const today = new Date("2026-06-10T08:00:00.000Z");

  assert.equal(getPurchaseOrderArrivalReminder({ status: "RECEIVED" }, today), "已全部入库");
  assert.equal(getPurchaseOrderArrivalReminder({ status: "ORDERED" }, today), "未设置预计到货日");
  assert.equal(
    getPurchaseOrderArrivalReminder({ status: "ORDERED", expectedAt: "2026-06-11T00:00:00.000Z" }, today),
    "明日预计到货"
  );
  assert.equal(
    getPurchaseOrderArrivalReminder({ status: "PARTIAL_RECEIVED", expectedAt: "2026-06-10T00:00:00.000Z" }, today),
    "今日预计到货"
  );
  assert.equal(
    getPurchaseOrderArrivalReminder({ status: "ORDERED", expectedAt: "2026-06-08T00:00:00.000Z" }, today),
    "已逾期 2 天"
  );
});
