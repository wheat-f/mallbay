import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AfterSaleResponsibility,
  AfterSaleStatus,
  CostCompleteness,
  ConstructionCostSettlementStatus,
  ConstructionTaskStatus,
  InvoiceStatus,
  InventoryMovementType,
  PaymentRecordType,
  QualityCheckResult,
  RebateStatus,
  StorePosition
} from "@prisma/client";
import { ReportsService } from "./reports.service";

const reportAccess = {
  can: async () => true,
  scope: async (subject: { userId: string }, _capability: string, _action: string, context: { storeId?: string } = {}) => ({
    allowed: true,
    global: subject.userId.startsWith("admin"),
    storeIds: subject.userId.startsWith("admin") ? [] : [context.storeId ?? "store-1"],
    ...(subject.userId.startsWith("sales") ? { ownerId: subject.userId } : {})
  }),
  resolve: async (actor: string) => ({
    roles: [{
      roleCode: actor.startsWith("sales") ? "SALES" : "MANAGER",
      roleName: "测试角色",
      scopeType: "STORE",
      scopeIds: ["store-1"]
    }]
  })
};

const deniedReportAccess = { can: async () => false, scope: async () => ({ allowed: false, global: false, storeIds: [], reason: "ACCESS_DENIED" as const }), resolve: reportAccess.resolve };

test("ReportsService keeps LIST-SCOPE-01 for no visible stores", async () => {
  const service = new ReportsService({} as never, { scope: async () => ({ allowed: false, global: false, storeIds: [], reason: "SCOPE_UNRESOLVED" as const }) } as never);
  const result = await service.summary({ id: "user-1" }, {});
  assert.equal(result.orders, 0);
  assert.equal(result.totalAmountCents, 0);
});

test("ReportsService returns STORE_OUT_OF_SCOPE for an explicit out-of-scope store", async () => {
  const service = new ReportsService({} as never, { scope: async () => ({ allowed: false, global: false, storeIds: ["store-a"], reason: "STORE_OUT_OF_SCOPE" as const }) } as never);
  await assert.rejects(() => service.summary({ id: "user-1" }, { storeId: "store-b" }), (error: unknown) => String((error as Error).message).includes("门店"));
});

test("ReportsService returns operating metrics for managers and admins", async () => {
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      count: async () => 3,
      findMany: async () => [
        {
          createdAt: new Date("2026-04-12T10:00:00.000Z"),
          amount: { totalAmountCents: 50000, paidAmountCents: 30000 }
        },
        {
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          amount: { totalAmountCents: 70000, paidAmountCents: 70000 }
        },
        {
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          amount: { totalAmountCents: 20000, paidAmountCents: 10000 }
        }
      ]
    },
    orderAmount: { aggregate: async () => ({ _sum: { totalAmountCents: 120000, paidAmountCents: 100000 } }) },
    constructionRecord: {
      count: async () => 2,
      findMany: async () => [
        {
          createdAt: new Date("2026-04-12T10:00:00.000Z"),
          status: ConstructionTaskStatus.COMPLETED,
          qualityResult: QualityCheckResult.PASS
        },
        {
          createdAt: new Date("2026-04-22T10:00:00.000Z"),
          status: ConstructionTaskStatus.IN_CONSTRUCTION,
          qualityResult: null
        },
        {
          createdAt: new Date("2026-05-01T10:00:00.000Z"),
          status: ConstructionTaskStatus.COMPLETED,
          qualityResult: QualityCheckResult.REWORK_REQUIRED
        }
      ]
    },
    afterSale: {
      count: async () => 3,
      findMany: async () => [
        {
          createdAt: new Date("2026-04-13T10:00:00.000Z"),
          status: AfterSaleStatus.RESOLVED,
          responsibility: AfterSaleResponsibility.CONSTRUCTION
        },
        {
          createdAt: new Date("2026-04-23T10:00:00.000Z"),
          status: AfterSaleStatus.OPEN,
          responsibility: AfterSaleResponsibility.PENDING
        },
        {
          createdAt: new Date("2026-05-02T10:00:00.000Z"),
          status: AfterSaleStatus.CLOSED,
          responsibility: AfterSaleResponsibility.MATERIAL
        }
      ]
    },
    invoice: {
      count: async () => 2,
      findMany: async () => [
        {
          createdAt: new Date("2026-04-15T10:00:00.000Z"),
          status: InvoiceStatus.ISSUED,
          amountCents: 80000
        },
        {
          createdAt: new Date("2026-05-05T10:00:00.000Z"),
          status: InvoiceStatus.VOIDED,
          amountCents: 30000
        }
      ]
    },
    customerRebate: {
      count: async () => 2,
      findMany: async () => [
        {
          createdAt: new Date("2026-04-16T10:00:00.000Z"),
          status: RebateStatus.APPROVED,
          amountCents: 6000
        },
        {
          createdAt: new Date("2026-05-06T10:00:00.000Z"),
          status: RebateStatus.PAID,
          amountCents: 4000
        }
      ]
    },
    salesCommissionLog: {
      aggregate: async () => ({ _sum: { amountCents: 10000 } }),
      findMany: async () => [
        { createdAt: new Date("2026-04-17T10:00:00.000Z"), amountCents: 4000 },
        { createdAt: new Date("2026-05-07T10:00:00.000Z"), amountCents: 6000 }
      ]
    },
    workerCommission: {
      aggregate: async () => ({ _sum: { finalAmountCents: 9000 } }),
      findMany: async () => [
        { createdAt: new Date("2026-04-18T10:00:00.000Z"), finalAmountCents: 3000, adjustmentCents: -500 },
        { createdAt: new Date("2026-05-08T10:00:00.000Z"), finalAmountCents: 6000, adjustmentCents: 1000 }
      ]
    },
    inventoryBatch: { count: async () => 5 },
    inventoryMovement: {
      count: async () => 8,
      findMany: async () => [
        {
          createdAt: new Date("2026-04-18T10:00:00.000Z"),
          movementType: InventoryMovementType.PURCHASE_IN,
          quantity: 5
        },
        {
          createdAt: new Date("2026-04-19T10:00:00.000Z"),
          movementType: InventoryMovementType.ORDER_LOCK,
          quantity: 2
        },
        {
          createdAt: new Date("2026-05-08T10:00:00.000Z"),
          movementType: InventoryMovementType.ORDER_OUT,
          quantity: 1.5
        },
        {
          createdAt: new Date("2026-05-09T10:00:00.000Z"),
          movementType: InventoryMovementType.STOCK_ADJUST,
          quantity: 0.5
        }
      ]
    },
    expenseApplication: { aggregate: async () => ({ _sum: { amountCents: 30000 } }) },
    reimbursementApplication: { aggregate: async () => ({ _sum: { amountCents: 20000 } }) },
    paymentRecord: {
      aggregate: async () => ({ _sum: { amountCents: 90000 } }),
      findMany: async () => [
        {
          createdAt: new Date("2026-04-14T10:00:00.000Z"),
          type: PaymentRecordType.ORDER_PAYMENT,
          amountCents: 100000
        },
        {
          createdAt: new Date("2026-04-24T10:00:00.000Z"),
          type: PaymentRecordType.REIMBURSEMENT,
          amountCents: 20000
        },
        {
          createdAt: new Date("2026-05-03T10:00:00.000Z"),
          type: PaymentRecordType.REBATE,
          amountCents: 5000
        }
      ]
    }
  };
  const service = new ReportsService(prisma as never, reportAccess as never);

  const result = await service.summary(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
    { storeId: "store-1" }
  );

  assert.deepEqual(result, {
    orders: 3,
    totalAmountCents: 120000,
    paidAmountCents: 100000,
    constructionRecords: 2,
    afterSales: 3,
    invoices: 2,
    rebates: 2,
    inventoryBatches: 5,
    inventoryMovements: 8,
    expenseAmountCents: 30000,
    reimbursementAmountCents: 20000,
    paymentRecordAmountCents: 90000,
    salesCommissionAmountCents: 10000,
    workerCommissionAmountCents: 9000,
    salesTrend: [
      {
        month: "2026-04",
        orders: 2,
        totalAmountCents: 120000,
        paidAmountCents: 100000
      },
      {
        month: "2026-05",
        orders: 1,
        totalAmountCents: 20000,
        paidAmountCents: 10000
      }
    ],
    constructionTrend: [
      {
        month: "2026-04",
        records: 2,
        completed: 1,
        qualityPassed: 1,
        reworkRequired: 0
      },
      {
        month: "2026-05",
        records: 1,
        completed: 1,
        qualityPassed: 0,
        reworkRequired: 1
      }
    ],
    afterSaleTrend: [
      {
        month: "2026-04",
        cases: 2,
        resolved: 1,
        constructionResponsibility: 1
      },
      {
        month: "2026-05",
        cases: 1,
        resolved: 1,
        constructionResponsibility: 0
      }
    ],
    financeTrend: [
      {
        month: "2026-04",
        incomeCents: 100000,
        expenseCents: 0,
        reimbursementCents: 20000,
        rebateCents: 0,
        netCashflowCents: 80000
      },
      {
        month: "2026-05",
        incomeCents: 0,
        expenseCents: 0,
        reimbursementCents: 0,
        rebateCents: 5000,
        netCashflowCents: -5000
      }
    ],
    inventoryTrend: [
      {
        month: "2026-04",
        movements: 2,
        inboundQuantity: 5,
        outboundQuantity: 0,
        lockedQuantity: 2,
        releasedQuantity: 0,
        adjustmentQuantity: 0
      },
      {
        month: "2026-05",
        movements: 2,
        inboundQuantity: 0,
        outboundQuantity: 1.5,
        lockedQuantity: 0,
        releasedQuantity: 0,
        adjustmentQuantity: 0.5
      }
    ],
    commissionTrend: [
      {
        month: "2026-04",
        salesLogs: 1,
        workerCommissions: 1,
        salesCommissionCents: 4000,
        workerCommissionCents: 3000,
        workerAdjustmentCents: -500,
        totalCommissionCents: 7000
      },
      {
        month: "2026-05",
        salesLogs: 1,
        workerCommissions: 1,
        salesCommissionCents: 6000,
        workerCommissionCents: 6000,
        workerAdjustmentCents: 1000,
        totalCommissionCents: 12000
      }
    ],
    invoiceTrend: [
      {
        month: "2026-04",
        invoices: 1,
        issued: 1,
        voided: 0,
        reissued: 0,
        amountCents: 80000
      },
      {
        month: "2026-05",
        invoices: 1,
        issued: 0,
        voided: 1,
        reissued: 0,
        amountCents: 30000
      }
    ],
    rebateTrend: [
      {
        month: "2026-04",
        rebates: 1,
        approved: 1,
        paid: 0,
        rejected: 0,
        amountCents: 6000
      },
      {
        month: "2026-05",
        rebates: 1,
        approved: 0,
        paid: 1,
        rejected: 0,
        amountCents: 4000
      }
    ]
  });
});

test("ReportsService lets administrators summarize all stores without a storeId", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      count: async (args: unknown) => {
        calls.push({ model: "order", args });
        return 0;
      },
      findMany: async (args: unknown) => {
        calls.push({ model: "order.findMany", args });
        return [];
      }
    },
    orderAmount: {
      aggregate: async (args: unknown) => {
        calls.push({ model: "orderAmount", args });
        return { _sum: { totalAmountCents: null, paidAmountCents: null } };
      }
    },
    constructionRecord: { count: async () => 0, findMany: async () => [] },
    afterSale: { count: async () => 0, findMany: async () => [] },
    invoice: { count: async () => 0, findMany: async () => [] },
    customerRebate: { count: async () => 0, findMany: async () => [] },
    salesCommissionLog: { aggregate: async () => ({ _sum: { amountCents: null } }), findMany: async () => [] },
    workerCommission: { aggregate: async () => ({ _sum: { finalAmountCents: null } }), findMany: async () => [] },
    inventoryBatch: { count: async () => 0 },
    inventoryMovement: { count: async () => 0, findMany: async () => [] },
    expenseApplication: { aggregate: async () => ({ _sum: { amountCents: null } }) },
    reimbursementApplication: { aggregate: async () => ({ _sum: { amountCents: null } }) },
    paymentRecord: { aggregate: async () => ({ _sum: { amountCents: null } }), findMany: async () => [] }
  };
  const service = new ReportsService(prisma as never, reportAccess as never);

  const result = await service.summary(
    { id: "admin-1", isAuditor: true, storeMember: null },
    {}
  );

  assert.equal(result.orders, 0);
  assert.deepEqual(calls.find((call) => (call as { model: string }).model === "order"), {
    model: "order",
    args: { where: {} }
  });
  assert.deepEqual(calls.find((call) => (call as { model: string }).model === "orderAmount"), {
    model: "orderAmount",
    args: { where: {}, _sum: { totalAmountCents: true, paidAmountCents: true } }
  });
});

test("ReportsService lets finance summarize their own store without passing storeId", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      count: async (args: unknown) => {
        calls.push({ model: "order", args });
        return 0;
      },
      findMany: async () => []
    },
    orderAmount: { aggregate: async () => ({ _sum: { totalAmountCents: null, paidAmountCents: null } }) },
    constructionRecord: { count: async () => 0, findMany: async () => [] },
    afterSale: { count: async () => 0, findMany: async () => [] },
    invoice: { count: async () => 0, findMany: async () => [] },
    customerRebate: { count: async () => 0, findMany: async () => [] },
    salesCommissionLog: { aggregate: async () => ({ _sum: { amountCents: null } }), findMany: async () => [] },
    workerCommission: { aggregate: async () => ({ _sum: { finalAmountCents: null } }), findMany: async () => [] },
    inventoryBatch: { count: async () => 0 },
    inventoryMovement: { count: async () => 0, findMany: async () => [] },
    expenseApplication: { aggregate: async () => ({ _sum: { amountCents: null } }) },
    reimbursementApplication: { aggregate: async () => ({ _sum: { amountCents: null } }) },
    paymentRecord: { aggregate: async () => ({ _sum: { amountCents: null } }), findMany: async () => [] }
  };
  const service = new ReportsService(prisma as never, reportAccess as never);

  await service.summary(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    {}
  );

  assert.deepEqual(calls.find((call) => (call as { model: string }).model === "order"), {
    model: "order",
    args: { where: { storeId: "store-1" } }
  });
});

test("ReportsService lets sales summarize only their own sales performance", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      count: async (args: unknown) => {
        calls.push({ model: "order.count", args });
        return 0;
      },
      findMany: async (args: unknown) => {
        calls.push({ model: "order.findMany", args });
        return [];
      }
    },
    orderAmount: {
      aggregate: async (args: unknown) => {
        calls.push({ model: "orderAmount.aggregate", args });
        return { _sum: { totalAmountCents: null, paidAmountCents: null } };
      }
    },
    constructionRecord: {
      count: async (args: unknown) => {
        calls.push({ model: "constructionRecord.count", args });
        return 0;
      },
      findMany: async () => []
    },
    afterSale: { count: async () => 0, findMany: async () => [] },
    invoice: {
      count: async (args: unknown) => {
        calls.push({ model: "invoice.count", args });
        return 0;
      },
      findMany: async (args: unknown) => {
        calls.push({ model: "invoice.findMany", args });
        return [];
      }
    },
    customerRebate: {
      count: async (args: unknown) => {
        calls.push({ model: "customerRebate.count", args });
        return 0;
      },
      findMany: async (args: unknown) => {
        calls.push({ model: "customerRebate.findMany", args });
        return [];
      }
    },
    salesCommissionLog: {
      aggregate: async (args: unknown) => {
        calls.push({ model: "salesCommissionLog.aggregate", args });
        return { _sum: { amountCents: null } };
      },
      findMany: async (args: unknown) => {
        calls.push({ model: "salesCommissionLog.findMany", args });
        return [];
      }
    },
    workerCommission: { aggregate: async () => ({ _sum: { finalAmountCents: null } }), findMany: async () => [] },
    inventoryBatch: { count: async () => 0 },
    inventoryMovement: { count: async () => 0, findMany: async () => [] },
    expenseApplication: { aggregate: async () => ({ _sum: { amountCents: null } }) },
    reimbursementApplication: { aggregate: async () => ({ _sum: { amountCents: null } }) },
    paymentRecord: { aggregate: async () => ({ _sum: { amountCents: null } }), findMany: async () => [] }
  };
  const service = new ReportsService(prisma as never, reportAccess as never);

  await service.summary(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    {}
  );

  assert.deepEqual(calls.find((call) => (call as { model: string }).model === "order.count"), {
    model: "order.count",
    args: { where: { storeId: "store-1", salesPersonId: "sales-1" } }
  });
  assert.deepEqual(calls.find((call) => (call as { model: string }).model === "orderAmount.aggregate"), {
    model: "orderAmount.aggregate",
    args: {
      where: { order: { storeId: "store-1", salesPersonId: "sales-1" } },
      _sum: { totalAmountCents: true, paidAmountCents: true }
    }
  });
  assert.deepEqual(calls.find((call) => (call as { model: string }).model === "salesCommissionLog.aggregate"), {
    model: "salesCommissionLog.aggregate",
    args: { where: { storeId: "store-1", salesUserId: "sales-1" }, _sum: { amountCents: true } }
  });
  assert.deepEqual(calls.find((call) => (call as { model: string }).model === "invoice.count"), {
    model: "invoice.count",
    args: { where: { storeId: "store-1", order: { salesPersonId: "sales-1" } } }
  });
});

test("ReportsService rejects an operational date range longer than 366 days before querying data", async () => {
  const service = new ReportsService({ storeMember: { findUnique: async () => null } } as never, reportAccess as never);
  await assert.rejects(
    service.operational(
      { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
      { storeId: "store-1", dateFrom: "2025-01-01", dateTo: "2026-01-02" }
    ),
    (error: unknown) => error instanceof Error && error.message === "REPORT_DATE_RANGE_TOO_LARGE"
  );
});

test("ReportsService rejects reversed operational date ranges", async () => {
  const service = new ReportsService({ storeMember: { findUnique: async () => null } } as never, reportAccess as never);
  await assert.rejects(
    service.operational(
      { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
      { storeId: "store-1", dateFrom: "2026-08-31", dateTo: "2026-08-01" }
    ),
    (error: unknown) => error instanceof Error && error.message === "REPORT_DATE_RANGE_INVALID"
  );
});

test("ReportsService rejects malformed operational dates before querying data", async () => {
  const service = new ReportsService({ storeMember: { findUnique: async () => null } } as never, reportAccess as never);
  await assert.rejects(
    service.operational(
      { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
      { storeId: "store-1", dateFrom: "2026-02-30", dateTo: "2026-03-01" }
    ),
    (error: unknown) => error instanceof Error && error.message === "REPORT_DATE_RANGE_INVALID"
  );
});

test("ReportsService operational contract preserves in-transit money and incomplete cost semantics", async () => {
  const calls: Array<{ model: string; args: unknown }> = [];
  const inTransitOrder = {
    id: "order-in-transit",
    orderNo: "ORD-202607-001",
    salesPersonId: "sales-1",
    constructionType: "基础施工",
    status: "IN_PROGRESS",
    createdAt: new Date("2026-07-10T10:00:00.000Z"),
    salesPerson: { id: "sales-1", nickname: "小王", username: "sales" },
    amount: {
      totalAmountCents: 380000,
      paidAmountCents: 100000,
      constructionChargeCents: 80000,
      laborCostCents: 80000,
      estimatedTotalCostCents: null,
      estimatedMaterialCostCents: null,
      estimatedConstructionCostCents: null,
      costCompleteness: null
    },
    items: [{ product: { category: "车膜" } }],
    constructionRecord: { completedAt: null, assignments: [] },
    costSettlement: null,
    workerCommissions: [],
    salesCommissionLog: null
  };
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findMany: async (args: unknown) => {
        calls.push({ model: "order.findMany", args });
        return calls.filter((call) => call.model === "order.findMany").length === 1 ? [inTransitOrder] : [];
      }
    },
    orderPayment: {
      findMany: async (args: unknown) => {
        calls.push({ model: "orderPayment.findMany", args });
        return calls.filter((call) => call.model === "orderPayment.findMany").length === 1
          ? [{ amountCents: 100000, paidAt: new Date("2026-07-20T10:00:00.000Z"), order: { id: inTransitOrder.id, salesPersonId: "sales-1" } }]
          : [];
      }
    },
    afterSale: { findMany: async () => [] }
  };
  const service = new ReportsService(prisma as never, reportAccess as never);

  const result = await service.operational(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
    { storeId: "store-1", dateFrom: "2026-07-01", dateTo: "2026-07-31", dateBasis: "ORDER" }
  );

  assert.equal(result.version, 1);
  assert.deepEqual(result.summary, {
    orders: 1,
    amountCents: 380000,
    receivedCents: 100000,
    outstandingCents: 280000,
    afterSalesCount: 0,
    afterSalesExpenseCents: 0,
    constructionOrderCount: 0,
    grossProfitCents: null,
    costCompletenessBps: 0,
    metricCompleteness: "incomplete",
    knownCostOrderCount: 0,
    pendingCostOrderCount: 1,
    knownCostGrossProfitCents: 0,
    coverage: {
      ordersWithMissingBusinessDate: 0,
      paymentsWithMissingEntryDate: 0,
      costsWithMissingConfirmationDate: 0,
      afterSalesWithMissingConfirmationDate: 0
    }
  });
  assert.equal(result.financeOrders[0]?.grossProfitCents, null);
  assert.equal(result.financeOrders[0]?.costSource, "待补齐");
  assert.deepEqual(result.modules.summary, { status: "partial", errorCode: "COST_INCOMPLETE" });
  assert.deepEqual(result.modules.trend, { status: "partial", errorCode: "COST_INCOMPLETE" });
  assert.deepEqual(result.modules.details, { status: "ready", rowCount: 1, truncated: false });
  const orderTrend = result.trend.find((item) => item.period === "2026-07-06");
  const paymentTrend = result.trend.find((item) => item.period === "2026-07-20");
  assert.equal(orderTrend?.amountCents, 380000);
  assert.equal(orderTrend?.receivedCents, 0);
  assert.equal(orderTrend?.grossProfitCents, null);
  assert.equal(paymentTrend?.amountCents, 0);
  assert.equal(paymentTrend?.receivedCents, 100000);
  assert.deepEqual(result.insights.map((item) => item.title), ["收款落后于订单金额", "成本数据待补齐"]);
  assert.equal(result.insights[0]?.targetView, "finance");
  assert.equal(result.comparison.amount.status, "new");
  assert.equal(result.comparison.grossProfit.reason, "INCOMPLETE_METRIC");
  assert.match(result.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual((calls[0]?.args as { where: Record<string, unknown> }).where, {
    storeId: "store-1",
    createdAt: { gte: new Date("2026-07-01T00:00:00.000+08:00"), lt: new Date("2026-08-01T00:00:00.000+08:00") }
  });
});

test("ReportsService operational interface rejects an actor without report scope", async () => {
  const service = new ReportsService({ storeMember: { findUnique: async () => null } } as never, deniedReportAccess as never);

  await assert.rejects(service.operational({ id: "user-1", isAuditor: false, storeMember: null }, {}));
});
