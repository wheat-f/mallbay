import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildOrderCustomerOptions,
  buildOrderVehicleOptions,
  centsToYuan,
  formatOrderDateValue,
  formatOrderTimeSlotValue,
  getOrderAmountSummary,
  getOrderCapacityStatus,
  getOrderCustomerLabel,
  getOrderCustomerHistorySummary,
  getOrderProductLabel,
  resolveCreatedCustomerSelection,
  resolveVehicleIdForCustomer,
  toCreateOrderPayload,
  yuanToCents
} from "./create-order-form";

test("getOrderCustomerLabel prefers company name then personal name", () => {
  assert.equal(getOrderCustomerLabel({ id: "customer-1", companyName: "MallBay", name: "小明" }), "MallBay");
  assert.equal(getOrderCustomerLabel({ id: "customer-2", name: "小明" }), "小明");
  assert.equal(getOrderCustomerLabel({ id: "cm-customer-technical-id" }), "未命名客户");
});

test("buildOrderCustomerOptions includes the selected customer before search results", () => {
  assert.deepEqual(
    buildOrderCustomerOptions(
      [{ id: "customer-2", name: "周琪" }],
      { id: "customer-1", name: "小明" }
    ),
    [
      { label: "小明", value: "customer-1" },
      { label: "周琪", value: "customer-2" }
    ]
  );
});

test("buildOrderVehicleOptions formats customer vehicles for selection", () => {
  assert.deepEqual(
    buildOrderVehicleOptions({
      id: "customer-1",
      vehicles: [
        { id: "vehicle-1", carPlate: "湘A12345", carModel: "Model 3", carColor: "白色" }
      ]
    }),
    [{ label: "湘A12345 / Model 3 / 白色", value: "vehicle-1" }]
  );
  assert.deepEqual(
    buildOrderVehicleOptions({
      id: "customer-2",
      vehicles: [{ id: "cm-vehicle-technical-id" }]
    }),
    [{ label: "未登记车辆", value: "cm-vehicle-technical-id" }]
  );
});

test("getOrderCustomerHistorySummary formats customer archive for order creation", () => {
  assert.deepEqual(
    getOrderCustomerHistorySummary({
      id: "customer-1",
      name: "小明",
      vehicles: [
        { id: "vehicle-1", carPlate: "湘A12345", carModel: "Model 3", carColor: "白色" }
      ],
      orders: [
        {
          id: "order-1",
          orderNo: "MB202606050001",
          status: "PENDING_DISPATCH",
          createdAt: "2026-06-05T00:00:00.000Z",
          amount: { totalAmountCents: 100000, paidAmountCents: 20000, outstandingCents: 80000 },
          vehicle: { id: "vehicle-1", carPlate: "湘A12345" }
        }
      ],
      archiveSummary: {
        consumption: {
          orderCount: 3,
          totalAmountCents: 300000,
          paidAmountCents: 220000,
          outstandingCents: 80000,
          constructionTypeDistribution: { PPF: 2 },
          latestConsumedAt: "2026-06-05T00:00:00.000Z"
        },
        warranty: { activeCount: 1, expiredCount: 0, expiringSoonCount: 0 },
        afterSales: { totalCount: 1, openCount: 1, closedCount: 0, responsibilityDistribution: {} },
        construction: {
          recentRecords: [
            {
              orderNo: "MB202602100001",
              constructionType: "PPF",
              status: "UNKNOWN_STATUS",
              completedAt: "2026-02-10T08:00:00.000Z",
              actualMinutes: 360,
              qualityResult: "UNKNOWN_RESULT",
              vehicleLabel: "湘A12345 / Model 3 / 白色"
            }
          ]
        },
        systemTags: [{ code: "KEY_FOLLOW_UP", label: "重点关注客户" }]
      }
    }),
    {
      orderCount: 3,
      vehicleCount: 1,
      totalAmountYuan: 3000,
      paidAmountYuan: 2200,
      outstandingAmountYuan: 800,
      activeWarrantyCount: 1,
      openAfterSalesCount: 1,
      tags: ["重点关注客户"],
      latestOrder: {
        orderNo: "MB202606050001",
        status: "待派工",
        amountYuan: 1000,
        vehicleLabel: "湘A12345",
        createdAt: "2026-06-05T00:00:00.000Z"
      },
      recentConstructionRecords: [
        {
          orderNo: "MB202602100001",
          constructionType: "漆面保护膜",
          status: "施工状态待确认",
          completedAt: "2026-02-10T08:00:00.000Z",
          actualMinutes: 360,
          qualityResult: "质检结果待确认",
          vehicleLabel: "湘A12345 / Model 3 / 白色"
        }
      ],
      warning: "该客户存在 ¥800.00 未结金额，创建新订单前请确认收款风险。"
    }
  );
});

test("resolveVehicleIdForCustomer auto selects the only vehicle and preserves valid selection", () => {
  const customer = {
    id: "customer-1",
    vehicles: [
      { id: "vehicle-1", carPlate: "湘A12345" },
      { id: "vehicle-2", carPlate: "湘A67890" }
    ]
  };

  assert.equal(resolveVehicleIdForCustomer({ id: "customer-2", vehicles: [{ id: "vehicle-3" }] }), "vehicle-3");
  assert.equal(resolveVehicleIdForCustomer(customer, "vehicle-2"), "vehicle-2");
  assert.equal(resolveVehicleIdForCustomer(customer, "other"), undefined);
});

test("resolveCreatedCustomerSelection selects a newly created customer and clears stale vehicle", () => {
  assert.deepEqual(resolveCreatedCustomerSelection({ id: "customer-9" }), {
    customerId: "customer-9",
    vehicleId: undefined
  });
});

test("formatOrderDateValue keeps date strings and formats date picker values", () => {
  assert.equal(formatOrderDateValue("2026-06-04"), "2026-06-04");
  assert.equal(
    formatOrderDateValue({ format: (pattern: string) => (pattern === "YYYY-MM-DD" ? "2026-06-05" : "bad") }),
    "2026-06-05"
  );
  assert.equal(formatOrderDateValue(null), undefined);
});

test("formatOrderTimeSlotValue keeps strings and formats time range picker values", () => {
  assert.equal(formatOrderTimeSlotValue("09:00-12:00"), "09:00-12:00");
  assert.equal(
    formatOrderTimeSlotValue([
      { format: (pattern: string) => (pattern === "HH:mm" ? "09:30" : "bad") },
      { format: (pattern: string) => (pattern === "HH:mm" ? "11:30" : "bad") }
    ]),
    "09:30-11:30"
  );
  assert.equal(formatOrderTimeSlotValue([null, { format: () => "11:30" }]), undefined);
  assert.equal(formatOrderTimeSlotValue(null), undefined);
});

test("getOrderProductLabel names each product attribute", () => {
  assert.equal(
    getOrderProductLabel({ id: "product-1", brand: "品牌1", name: "名称1", model: "型号1" }),
    "品牌：品牌1 / 名称：名称1 / 型号：型号1"
  );
});

test("yuan and cents helpers convert display money without floating point drift", () => {
  assert.equal(yuanToCents(12.34), 1234);
  assert.equal(yuanToCents(0.1 + 0.2), 30);
  assert.equal(centsToYuan(1234), 12.34);
  assert.equal(centsToYuan(undefined), undefined);
});

test("toCreateOrderPayload converts yuan form values to cents API payload", () => {
  assert.deepEqual(
    toCreateOrderPayload(
      {
        customerId: "customer-1",
        constructionType: "PPF",
        constructionLocation: "IN_STORE",
        items: [{ productId: "product-1", quantity: 2, unitPriceYuan: 199.9 }],
        laborCostYuan: 88.8,
        remark: "test"
      },
      "store-1"
    ),
    {
      storeId: "store-1",
      customerId: "customer-1",
      constructionType: "PPF",
      constructionLocation: "IN_STORE",
      items: [{ productId: "product-1", quantity: 2, unitPriceCents: 19990 }],
      constructionChargeCents: 8880,
      remark: "test"
    }
  );
});

test("toCreateOrderPayload formats appointment date picker values before submit", () => {
  assert.deepEqual(
    toCreateOrderPayload(
      {
        customerId: "customer-1",
        constructionType: "PPF",
        constructionLocation: "IN_STORE",
        appointmentDate: { format: (pattern: string) => (pattern === "YYYY-MM-DD" ? "2026-06-18" : "bad") },
        appointmentTimeSlot: " 09:00 ",
        items: [{ productId: "product-1", quantity: 1, unitPriceYuan: 100 }]
      },
      "store-1"
    ),
    {
      storeId: "store-1",
      customerId: "customer-1",
      constructionType: "PPF",
      constructionLocation: "IN_STORE",
      appointmentDate: "2026-06-18",
      appointmentTimeSlot: "09:00",
      items: [{ productId: "product-1", quantity: 1, unitPriceCents: 10000 }],
      constructionChargeCents: 0
    }
  );
});

test("toCreateOrderPayload trims optional text fields before submit", () => {
  assert.deepEqual(
    toCreateOrderPayload(
      {
        customerId: "customer-1",
        constructionType: "PPF",
        constructionLocation: "OUTSIDE",
        constructionAddress: " 湖南长沙岳麓区 ",
        remark: "  客户要求施工前确认车况  ",
        items: [{ productId: "product-1", quantity: 1, unitPriceYuan: 100 }]
      },
      "store-1"
    ),
    {
      storeId: "store-1",
      customerId: "customer-1",
      constructionType: "PPF",
      constructionLocation: "OUTSIDE",
      constructionAddress: "湖南长沙岳麓区",
      remark: "客户要求施工前确认车况",
      items: [{ productId: "product-1", quantity: 1, unitPriceCents: 10000 }],
      constructionChargeCents: 0
    }
  );

  assert.equal(
    "remark" in toCreateOrderPayload(
      {
        customerId: "customer-1",
        constructionType: "PPF",
        constructionLocation: "IN_STORE",
        remark: "   ",
        items: [{ productId: "product-1", quantity: 1, unitPriceYuan: 100 }]
      },
      "store-1"
    ),
    false
  );
});

test("toCreateOrderPayload includes deposit with yuan converted to cents", () => {
  assert.deepEqual(
    toCreateOrderPayload(
      {
        customerId: "customer-1",
        constructionType: "PPF",
        constructionLocation: "IN_STORE",
        items: [{ productId: "product-1", quantity: 1, unitPriceYuan: 100 }],
        laborCostYuan: 20,
        shouldRecordDeposit: true,
        deposit: {
          accountId: "account-1",
          amountYuan: 30.5,
          paymentType: "DEPOSIT",
          paidAt: { format: (pattern: string) => (pattern === "YYYY-MM-DD" ? "2026-06-05" : "bad") }
        }
      },
      "store-1"
    ).deposit,
    {
      accountId: "account-1",
      amountCents: 3050,
      paymentType: "DEPOSIT",
      paidAt: "2026-06-05"
    }
  );
});

test("toCreateOrderPayload includes labor suggestion snapshot and adjustment reason", () => {
  assert.deepEqual(
    toCreateOrderPayload(
      {
        customerId: "customer-1",
        constructionType: "PPF",
        constructionLocation: "OUTSIDE",
        items: [{ productId: "product-1", quantity: 1, unitPriceYuan: 100 }],
        laborCostYuan: 2500,
        suggestedLaborCostYuan: 2200,
        laborCostAdjustmentReason: " 外出距离远，需要增加人工费 "
      } as never,
      "store-1"
    ),
    {
      storeId: "store-1",
      customerId: "customer-1",
      constructionType: "PPF",
      constructionLocation: "OUTSIDE",
      items: [{ productId: "product-1", quantity: 1, unitPriceCents: 10000 }],
      constructionChargeCents: 250000,
      suggestedConstructionChargeCents: 220000,
      constructionChargeAdjustmentReason: "外出距离远，需要增加人工费"
    }
  );
});

test("getOrderAmountSummary totals products labor deposit and outstanding amount", () => {
  assert.deepEqual(
    getOrderAmountSummary({
      customerId: "customer-1",
      constructionType: "PPF",
      constructionLocation: "IN_STORE",
      items: [
        { productId: "product-1", quantity: 2, unitPriceYuan: 100 },
        { productId: "product-2", quantity: 1, unitPriceYuan: 50.5 }
      ],
      laborCostYuan: 20,
      deposit: { amountYuan: 80 }
    }),
    {
      productAmountYuan: 250.5,
      constructionChargeYuan: 20,
      laborCostYuan: 20,
      totalAmountYuan: 270.5,
      depositAmountYuan: 80,
      outstandingAmountYuan: 190.5
    }
  );
});


test("getOrderCapacityStatus explains missing full and available capacity", () => {
  assert.deepEqual(getOrderCapacityStatus(undefined, "IN_STORE", "PPF"), {
    state: "missing",
    message: "该预约日期尚未设置施工容量，请先维护当天容量后再创建预约订单。"
  });

  assert.deepEqual(
    getOrderCapacityStatus(
      {
        id: "capacity-1",
        storeId: "store-1",
        date: "2026-06-18T00:00:00.000Z",
        inStoreCapacity: 1,
        inStoreReserved: 1,
        outsideCapacity: 2,
        outsideReserved: 0,
        heatFilmCapacity: 1,
        heatFilmReserved: 0,
        inspectionCapacity: 1,
        inspectionReserved: 0
      },
      "IN_STORE",
      "PPF"
    ),
    {
      state: "full",
      message: "该预约日期的店内容量已满，请调整日期或先扩充施工容量。"
    }
  );

  assert.deepEqual(
    getOrderCapacityStatus(
      {
        id: "capacity-1",
        storeId: "store-1",
        date: "2026-06-18T00:00:00.000Z",
        inStoreCapacity: 2,
        inStoreReserved: 1,
        outsideCapacity: 2,
        outsideReserved: 0,
        heatFilmCapacity: 1,
        heatFilmReserved: 0,
        inspectionCapacity: 1,
        inspectionReserved: 0
      },
      "IN_STORE",
      "PPF"
    ),
    {
      state: "available",
      message: "店内容量剩余 1 个预约名额。"
    }
  );
});
