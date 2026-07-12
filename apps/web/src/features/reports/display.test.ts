import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAfterSaleTrendRows,
  buildCommissionTrendRows,
  buildConstructionTrendRows,
  buildFinanceTrendRows,
  buildInventoryTrendRows,
  buildInvoiceTrendRows,
  buildRebateTrendRows,
  buildReportInsightRows,
  buildReportRows,
  buildSalesPerformanceInsightRows,
  buildSalesPerformanceRows,
  buildSalesTrendRows
} from "./display";

test("buildReportRows formats money metrics in yuan", () => {
  assert.deepEqual(
    buildReportRows({
      orders: 2,
      totalAmountCents: 123456,
      paidAmountCents: 100000,
      constructionRecords: 1,
      afterSales: 0,
      invoices: 1,
      rebates: 1,
      inventoryBatches: 5,
      inventoryMovements: 8,
      expenseAmountCents: 30000,
      reimbursementAmountCents: 20000,
      paymentRecordAmountCents: 90000,
      salesCommissionAmountCents: 10000,
      workerCommissionAmountCents: 9000,
      salesTrend: [],
      constructionTrend: [],
      afterSaleTrend: [],
      commissionTrend: [],
      financeTrend: [],
      inventoryTrend: [],
      invoiceTrend: [],
      rebateTrend: []
    }),
    [
      { key: "orders", label: "订单数", value: "2" },
      { key: "totalAmountCents", label: "订单总额", value: "¥1,234.56" },
      { key: "paidAmountCents", label: "已收款", value: "¥1,000.00" },
      { key: "constructionRecords", label: "施工记录", value: "1" },
      { key: "afterSales", label: "售后单", value: "0" },
      { key: "invoices", label: "发票", value: "1" },
      { key: "rebates", label: "返利", value: "1" },
      { key: "inventoryBatches", label: "库存批次", value: "5" },
      { key: "inventoryMovements", label: "库存流水", value: "8" },
      { key: "expenseAmountCents", label: "费用申请", value: "¥300.00" },
      { key: "reimbursementAmountCents", label: "报销申请", value: "¥200.00" },
      { key: "paymentRecordAmountCents", label: "打款流水", value: "¥900.00" },
      { key: "salesCommissionAmountCents", label: "销售提成", value: "¥100.00" },
      { key: "workerCommissionAmountCents", label: "师傅提成", value: "¥90.00" }
    ]
  );
});

test("buildSalesPerformanceRows keeps only personal sales metrics", () => {
  const rows = buildSalesPerformanceRows({
    orders: 3,
    totalAmountCents: 120000,
    paidAmountCents: 80000,
    constructionRecords: 2,
    afterSales: 1,
    invoices: 2,
    rebates: 1,
    inventoryBatches: 4,
    inventoryMovements: 5,
    expenseAmountCents: 6000,
    reimbursementAmountCents: 7000,
    paymentRecordAmountCents: 90000,
    salesCommissionAmountCents: 12000,
    workerCommissionAmountCents: 30000,
    salesTrend: [],
    constructionTrend: [],
    afterSaleTrend: [],
    commissionTrend: [],
    financeTrend: [],
    inventoryTrend: [],
    invoiceTrend: [],
    rebateTrend: []
  });

  assert.deepEqual(rows.map((row) => row.label), ["订单数", "订单总额", "已收款", "发票", "返利", "销售提成"]);
});

test("buildSalesPerformanceInsightRows excludes store operation insight metrics", () => {
  const rows = buildSalesPerformanceInsightRows({
    orders: 2,
    totalAmountCents: 100000,
    paidAmountCents: 70000,
    constructionRecords: 2,
    afterSales: 1,
    invoices: 0,
    rebates: 0,
    inventoryBatches: 0,
    inventoryMovements: 0,
    expenseAmountCents: 0,
    reimbursementAmountCents: 0,
    paymentRecordAmountCents: 0,
    salesCommissionAmountCents: 0,
    workerCommissionAmountCents: 0,
    salesTrend: [],
    constructionTrend: [],
    afterSaleTrend: [],
    commissionTrend: [],
    financeTrend: [],
    inventoryTrend: [],
    invoiceTrend: [],
    rebateTrend: []
  });

  assert.deepEqual(rows.map((row) => row.label), ["回款率", "待收金额", "客单价"]);
});

test("buildReportInsightRows derives operating analysis from summary metrics", () => {
  assert.deepEqual(
    buildReportInsightRows({
      orders: 4,
      totalAmountCents: 200000,
      paidAmountCents: 150000,
      constructionRecords: 3,
      afterSales: 1,
      invoices: 2,
      rebates: 1,
      inventoryBatches: 0,
      inventoryMovements: 0,
      expenseAmountCents: 0,
      reimbursementAmountCents: 0,
      paymentRecordAmountCents: 0,
      salesCommissionAmountCents: 0,
      workerCommissionAmountCents: 0,
      salesTrend: [],
      constructionTrend: [],
      afterSaleTrend: [],
      commissionTrend: [],
      financeTrend: [],
      inventoryTrend: [],
      invoiceTrend: [],
      rebateTrend: []
    }),
    [
      { key: "collectionRate", label: "回款率", value: "75.0%", description: "已收款 / 订单总额" },
      { key: "outstandingAmount", label: "待收金额", value: "¥500.00", description: "订单总额 - 已收款" },
      { key: "averageOrderAmount", label: "客单价", value: "¥500.00", description: "订单总额 / 订单数" },
      { key: "constructionFulfillmentRate", label: "施工履约率", value: "75.0%", description: "施工记录 / 订单数" },
      { key: "afterSalesRate", label: "售后率", value: "25.0%", description: "售后单 / 订单数" }
    ]
  );
});

test("buildSalesTrendRows formats monthly sales trend in yuan", () => {
  assert.deepEqual(
    buildSalesTrendRows({
      orders: 3,
      totalAmountCents: 140000,
      paidAmountCents: 110000,
      constructionRecords: 0,
      afterSales: 0,
      invoices: 0,
      rebates: 0,
      inventoryBatches: 0,
      inventoryMovements: 0,
      expenseAmountCents: 0,
      reimbursementAmountCents: 0,
      paymentRecordAmountCents: 0,
      salesCommissionAmountCents: 0,
      workerCommissionAmountCents: 0,
      salesTrend: [
        { month: "2026-04", orders: 2, totalAmountCents: 120000, paidAmountCents: 100000 },
        { month: "2026-05", orders: 1, totalAmountCents: 20000, paidAmountCents: 10000 }
      ],
      constructionTrend: [],
      afterSaleTrend: [],
      commissionTrend: [],
      financeTrend: [],
      inventoryTrend: [],
      invoiceTrend: [],
      rebateTrend: []
    }),
    [
      { month: "2026-04", orders: "2", totalAmount: "¥1,200.00", paidAmount: "¥1,000.00", collectionRate: "83.3%" },
      { month: "2026-05", orders: "1", totalAmount: "¥200.00", paidAmount: "¥100.00", collectionRate: "50.0%" }
    ]
  );
});

test("buildConstructionTrendRows formats monthly construction delivery trend", () => {
  assert.deepEqual(
    buildConstructionTrendRows({
      orders: 0,
      totalAmountCents: 0,
      paidAmountCents: 0,
      constructionRecords: 3,
      afterSales: 0,
      invoices: 0,
      rebates: 0,
      inventoryBatches: 0,
      inventoryMovements: 0,
      expenseAmountCents: 0,
      reimbursementAmountCents: 0,
      paymentRecordAmountCents: 0,
      salesCommissionAmountCents: 0,
      workerCommissionAmountCents: 0,
      salesTrend: [],
      constructionTrend: [
        { month: "2026-04", records: 2, completed: 1, qualityPassed: 1, reworkRequired: 0 },
        { month: "2026-05", records: 1, completed: 1, qualityPassed: 0, reworkRequired: 1 }
      ],
      afterSaleTrend: [],
      commissionTrend: [],
      financeTrend: [],
      inventoryTrend: [],
      invoiceTrend: [],
      rebateTrend: []
    }),
    [
      {
        month: "2026-04",
        records: "2",
        completed: "1",
        qualityPassed: "1",
        reworkRequired: "0",
        completionRate: "50.0%"
      },
      {
        month: "2026-05",
        records: "1",
        completed: "1",
        qualityPassed: "0",
        reworkRequired: "1",
        completionRate: "100.0%"
      }
    ]
  );
});

test("buildAfterSaleTrendRows formats monthly after-sale trend", () => {
  assert.deepEqual(
    buildAfterSaleTrendRows({
      orders: 4,
      totalAmountCents: 0,
      paidAmountCents: 0,
      constructionRecords: 0,
      afterSales: 3,
      invoices: 0,
      rebates: 0,
      inventoryBatches: 0,
      inventoryMovements: 0,
      expenseAmountCents: 0,
      reimbursementAmountCents: 0,
      paymentRecordAmountCents: 0,
      salesCommissionAmountCents: 0,
      workerCommissionAmountCents: 0,
      salesTrend: [],
      constructionTrend: [],
      afterSaleTrend: [
        { month: "2026-04", cases: 2, resolved: 1, constructionResponsibility: 1 },
        { month: "2026-05", cases: 1, resolved: 1, constructionResponsibility: 0 }
      ],
      commissionTrend: [],
      financeTrend: [],
      inventoryTrend: [],
      invoiceTrend: [],
      rebateTrend: []
    }),
    [
      {
        month: "2026-04",
        cases: "2",
        resolved: "1",
        constructionResponsibility: "1",
        resolveRate: "50.0%",
        afterSalesRate: "50.0%"
      },
      {
        month: "2026-05",
        cases: "1",
        resolved: "1",
        constructionResponsibility: "0",
        resolveRate: "100.0%",
        afterSalesRate: "25.0%"
      }
    ]
  );
});

test("buildCommissionTrendRows formats monthly commission trend in yuan", () => {
  assert.deepEqual(
    buildCommissionTrendRows({
      orders: 0,
      totalAmountCents: 0,
      paidAmountCents: 0,
      constructionRecords: 0,
      afterSales: 0,
      invoices: 0,
      rebates: 0,
      inventoryBatches: 0,
      inventoryMovements: 0,
      expenseAmountCents: 0,
      reimbursementAmountCents: 0,
      paymentRecordAmountCents: 0,
      salesCommissionAmountCents: 10000,
      workerCommissionAmountCents: 9000,
      salesTrend: [],
      constructionTrend: [],
      afterSaleTrend: [],
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
      financeTrend: [],
      inventoryTrend: [],
      invoiceTrend: [],
      rebateTrend: []
    }),
    [
      {
        month: "2026-04",
        salesLogs: "1",
        workerCommissions: "1",
        salesCommission: "¥40.00",
        workerCommission: "¥30.00",
        workerAdjustment: "-¥5.00",
        totalCommission: "¥70.00"
      },
      {
        month: "2026-05",
        salesLogs: "1",
        workerCommissions: "1",
        salesCommission: "¥60.00",
        workerCommission: "¥60.00",
        workerAdjustment: "¥10.00",
        totalCommission: "¥120.00"
      }
    ]
  );
});

test("buildFinanceTrendRows formats monthly finance trend in yuan", () => {
  assert.deepEqual(
    buildFinanceTrendRows({
      orders: 0,
      totalAmountCents: 0,
      paidAmountCents: 0,
      constructionRecords: 0,
      afterSales: 0,
      invoices: 0,
      rebates: 0,
      inventoryBatches: 0,
      inventoryMovements: 0,
      expenseAmountCents: 0,
      reimbursementAmountCents: 0,
      paymentRecordAmountCents: 0,
      salesCommissionAmountCents: 0,
      workerCommissionAmountCents: 0,
      salesTrend: [],
      constructionTrend: [],
      afterSaleTrend: [],
      commissionTrend: [],
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
      inventoryTrend: [],
      invoiceTrend: [],
      rebateTrend: []
    }),
    [
      {
        month: "2026-04",
        income: "¥1,000.00",
        expense: "¥0.00",
        reimbursement: "¥200.00",
        rebate: "¥0.00",
        netCashflow: "¥800.00"
      },
      {
        month: "2026-05",
        income: "¥0.00",
        expense: "¥0.00",
        reimbursement: "¥0.00",
        rebate: "¥50.00",
        netCashflow: "-¥50.00"
      }
    ]
  );
});

test("buildInventoryTrendRows formats monthly inventory movement trend", () => {
  assert.deepEqual(
    buildInventoryTrendRows({
      orders: 0,
      totalAmountCents: 0,
      paidAmountCents: 0,
      constructionRecords: 0,
      afterSales: 0,
      invoices: 0,
      rebates: 0,
      inventoryBatches: 0,
      inventoryMovements: 4,
      expenseAmountCents: 0,
      reimbursementAmountCents: 0,
      paymentRecordAmountCents: 0,
      salesCommissionAmountCents: 0,
      workerCommissionAmountCents: 0,
      salesTrend: [],
      constructionTrend: [],
      afterSaleTrend: [],
      commissionTrend: [],
      financeTrend: [],
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
      invoiceTrend: [],
      rebateTrend: []
    }),
    [
      {
        month: "2026-04",
        movements: "2",
        inbound: "5",
        outbound: "0",
        locked: "2",
        released: "0",
        adjustments: "0"
      },
      {
        month: "2026-05",
        movements: "2",
        inbound: "0",
        outbound: "1.5",
        locked: "0",
        released: "0",
        adjustments: "0.5"
      }
    ]
  );
});

test("buildInvoiceTrendRows formats monthly invoice trend in yuan", () => {
  assert.deepEqual(
    buildInvoiceTrendRows({
      orders: 0,
      totalAmountCents: 0,
      paidAmountCents: 0,
      constructionRecords: 0,
      afterSales: 0,
      invoices: 2,
      rebates: 0,
      inventoryBatches: 0,
      inventoryMovements: 0,
      expenseAmountCents: 0,
      reimbursementAmountCents: 0,
      paymentRecordAmountCents: 0,
      salesCommissionAmountCents: 0,
      workerCommissionAmountCents: 0,
      salesTrend: [],
      constructionTrend: [],
      afterSaleTrend: [],
      commissionTrend: [],
      financeTrend: [],
      inventoryTrend: [],
      invoiceTrend: [
        { month: "2026-04", invoices: 1, issued: 1, voided: 0, reissued: 0, amountCents: 80000 },
        { month: "2026-05", invoices: 1, issued: 0, voided: 1, reissued: 0, amountCents: 30000 }
      ],
      rebateTrend: []
    }),
    [
      { month: "2026-04", invoices: "1", issued: "1", voided: "0", reissued: "0", amount: "¥800.00", issueRate: "100.0%" },
      { month: "2026-05", invoices: "1", issued: "0", voided: "1", reissued: "0", amount: "¥300.00", issueRate: "0.0%" }
    ]
  );
});

test("buildRebateTrendRows formats monthly rebate trend in yuan", () => {
  assert.deepEqual(
    buildRebateTrendRows({
      orders: 0,
      totalAmountCents: 0,
      paidAmountCents: 0,
      constructionRecords: 0,
      afterSales: 0,
      invoices: 0,
      rebates: 2,
      inventoryBatches: 0,
      inventoryMovements: 0,
      expenseAmountCents: 0,
      reimbursementAmountCents: 0,
      paymentRecordAmountCents: 0,
      salesCommissionAmountCents: 0,
      workerCommissionAmountCents: 0,
      salesTrend: [],
      constructionTrend: [],
      afterSaleTrend: [],
      commissionTrend: [],
      financeTrend: [],
      inventoryTrend: [],
      invoiceTrend: [],
      rebateTrend: [
        { month: "2026-04", rebates: 1, approved: 1, paid: 0, rejected: 0, amountCents: 6000 },
        { month: "2026-05", rebates: 1, approved: 0, paid: 1, rejected: 0, amountCents: 4000 }
      ]
    }),
    [
      { month: "2026-04", rebates: "1", approved: "1", paid: "0", rejected: "0", amount: "¥60.00", payRate: "0.0%" },
      { month: "2026-05", rebates: "1", approved: "0", paid: "1", rejected: "0", amount: "¥40.00", payRate: "100.0%" }
    ]
  );
});

test("buildReportInsightRows handles empty summaries without NaN or Infinity", () => {
  assert.deepEqual(
    buildReportInsightRows(),
    [
      { key: "collectionRate", label: "回款率", value: "0.0%", description: "已收款 / 订单总额" },
      { key: "outstandingAmount", label: "待收金额", value: "¥0.00", description: "订单总额 - 已收款" },
      { key: "averageOrderAmount", label: "客单价", value: "¥0.00", description: "订单总额 / 订单数" },
      { key: "constructionFulfillmentRate", label: "施工履约率", value: "0.0%", description: "施工记录 / 订单数" },
      { key: "afterSalesRate", label: "售后率", value: "0.0%", description: "售后单 / 订单数" }
    ]
  );
});
