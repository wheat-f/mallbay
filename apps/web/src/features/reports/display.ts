import type { ReportSummary } from "@mallbay/shared";
import { yuanCurrency } from "../orders/order-display";

export type ReportDisplayRow = {
  key: keyof ReportSummary;
  label: string;
  value: string;
};

export type ReportInsightRow = {
  key: "collectionRate" | "outstandingAmount" | "averageOrderAmount" | "constructionFulfillmentRate" | "afterSalesRate";
  label: string;
  value: string;
  description: string;
};

export type SalesTrendDisplayRow = {
  month: string;
  orders: string;
  totalAmount: string;
  paidAmount: string;
  collectionRate: string;
};

export type ConstructionTrendDisplayRow = {
  month: string;
  records: string;
  completed: string;
  qualityPassed: string;
  reworkRequired: string;
  completionRate: string;
};

export type AfterSaleTrendDisplayRow = {
  month: string;
  cases: string;
  resolved: string;
  constructionResponsibility: string;
  resolveRate: string;
  afterSalesRate: string;
};

export type CommissionTrendDisplayRow = {
  month: string;
  salesLogs: string;
  workerCommissions: string;
  salesCommission: string;
  workerCommission: string;
  workerAdjustment: string;
  totalCommission: string;
};

export type FinanceTrendDisplayRow = {
  month: string;
  income: string;
  expense: string;
  reimbursement: string;
  rebate: string;
  netCashflow: string;
};

export type InventoryTrendDisplayRow = {
  month: string;
  movements: string;
  inbound: string;
  outbound: string;
  locked: string;
  released: string;
  adjustments: string;
};

export type InvoiceTrendDisplayRow = {
  month: string;
  invoices: string;
  issued: string;
  voided: string;
  reissued: string;
  amount: string;
  issueRate: string;
};

export type RebateTrendDisplayRow = {
  month: string;
  rebates: string;
  approved: string;
  paid: string;
  rejected: string;
  amount: string;
  payRate: string;
};

export function buildReportRows(summary?: ReportSummary): ReportDisplayRow[] {
  return [
    { key: "orders", label: "订单数", value: String(summary?.orders ?? 0) },
    { key: "totalAmountCents", label: "订单总额", value: yuanCurrency(summary?.totalAmountCents ?? 0) },
    { key: "paidAmountCents", label: "已收款", value: yuanCurrency(summary?.paidAmountCents ?? 0) },
    { key: "constructionRecords", label: "施工记录", value: String(summary?.constructionRecords ?? 0) },
    { key: "afterSales", label: "售后单", value: String(summary?.afterSales ?? 0) },
    { key: "invoices", label: "发票", value: String(summary?.invoices ?? 0) },
    { key: "rebates", label: "返利", value: String(summary?.rebates ?? 0) },
    { key: "inventoryBatches", label: "库存批次", value: String(summary?.inventoryBatches ?? 0) },
    { key: "inventoryMovements", label: "库存流水", value: String(summary?.inventoryMovements ?? 0) },
    { key: "expenseAmountCents", label: "费用申请", value: yuanCurrency(summary?.expenseAmountCents ?? 0) },
    { key: "reimbursementAmountCents", label: "报销申请", value: yuanCurrency(summary?.reimbursementAmountCents ?? 0) },
    { key: "paymentRecordAmountCents", label: "打款流水", value: yuanCurrency(summary?.paymentRecordAmountCents ?? 0) },
    { key: "salesCommissionAmountCents", label: "销售提成", value: yuanCurrency(summary?.salesCommissionAmountCents ?? 0) },
    { key: "workerCommissionAmountCents", label: "师傅提成", value: yuanCurrency(summary?.workerCommissionAmountCents ?? 0) }
  ];
}

export function buildSalesPerformanceRows(summary?: ReportSummary): ReportDisplayRow[] {
  return buildReportRows(summary).filter((row) =>
    ["orders", "totalAmountCents", "paidAmountCents", "invoices", "rebates", "salesCommissionAmountCents"].includes(row.key)
  );
}

export function buildReportInsightRows(summary?: ReportSummary): ReportInsightRow[] {
  const orders = summary?.orders ?? 0;
  const totalAmountCents = summary?.totalAmountCents ?? 0;
  const paidAmountCents = summary?.paidAmountCents ?? 0;
  const constructionRecords = summary?.constructionRecords ?? 0;
  const afterSales = summary?.afterSales ?? 0;

  return [
    {
      key: "collectionRate",
      label: "回款率",
      value: formatPercent(paidAmountCents, totalAmountCents),
      description: "已收款 / 订单总额"
    },
    {
      key: "outstandingAmount",
      label: "待收金额",
      value: yuanCurrency(Math.max(totalAmountCents - paidAmountCents, 0)),
      description: "订单总额 - 已收款"
    },
    {
      key: "averageOrderAmount",
      label: "客单价",
      value: yuanCurrency(orders > 0 ? Math.round(totalAmountCents / orders) : 0),
      description: "订单总额 / 订单数"
    },
    {
      key: "constructionFulfillmentRate",
      label: "施工履约率",
      value: formatPercent(constructionRecords, orders),
      description: "施工记录 / 订单数"
    },
    {
      key: "afterSalesRate",
      label: "售后率",
      value: formatPercent(afterSales, orders),
      description: "售后单 / 订单数"
    }
  ];
}

export function buildSalesPerformanceInsightRows(summary?: ReportSummary): ReportInsightRow[] {
  return buildReportInsightRows(summary).filter((row) =>
    ["collectionRate", "outstandingAmount", "averageOrderAmount"].includes(row.key)
  );
}

export function buildSalesTrendRows(summary?: ReportSummary): SalesTrendDisplayRow[] {
  return (summary?.salesTrend ?? []).map((row) => ({
    month: row.month,
    orders: String(row.orders),
    totalAmount: yuanCurrency(row.totalAmountCents),
    paidAmount: yuanCurrency(row.paidAmountCents),
    collectionRate: formatPercent(row.paidAmountCents, row.totalAmountCents)
  }));
}

export function buildConstructionTrendRows(summary?: ReportSummary): ConstructionTrendDisplayRow[] {
  return (summary?.constructionTrend ?? []).map((row) => ({
    month: row.month,
    records: String(row.records),
    completed: String(row.completed),
    qualityPassed: String(row.qualityPassed),
    reworkRequired: String(row.reworkRequired),
    completionRate: formatPercent(row.completed, row.records)
  }));
}

export function buildAfterSaleTrendRows(summary?: ReportSummary): AfterSaleTrendDisplayRow[] {
  const totalOrders = summary?.orders ?? 0;
  return (summary?.afterSaleTrend ?? []).map((row) => ({
    month: row.month,
    cases: String(row.cases),
    resolved: String(row.resolved),
    constructionResponsibility: String(row.constructionResponsibility),
    resolveRate: formatPercent(row.resolved, row.cases),
    afterSalesRate: formatPercent(row.cases, totalOrders)
  }));
}

export function buildCommissionTrendRows(summary?: ReportSummary): CommissionTrendDisplayRow[] {
  return (summary?.commissionTrend ?? []).map((row) => ({
    month: row.month,
    salesLogs: String(row.salesLogs),
    workerCommissions: String(row.workerCommissions),
    salesCommission: yuanCurrency(row.salesCommissionCents),
    workerCommission: yuanCurrency(row.workerCommissionCents),
    workerAdjustment: yuanCurrency(row.workerAdjustmentCents),
    totalCommission: yuanCurrency(row.totalCommissionCents)
  }));
}

export function buildFinanceTrendRows(summary?: ReportSummary): FinanceTrendDisplayRow[] {
  return (summary?.financeTrend ?? []).map((row) => ({
    month: row.month,
    income: yuanCurrency(row.incomeCents),
    expense: yuanCurrency(row.expenseCents),
    reimbursement: yuanCurrency(row.reimbursementCents),
    rebate: yuanCurrency(row.rebateCents),
    netCashflow: yuanCurrency(row.netCashflowCents)
  }));
}

export function buildInventoryTrendRows(summary?: ReportSummary): InventoryTrendDisplayRow[] {
  return (summary?.inventoryTrend ?? []).map((row) => ({
    month: row.month,
    movements: String(row.movements),
    inbound: formatQuantity(row.inboundQuantity),
    outbound: formatQuantity(row.outboundQuantity),
    locked: formatQuantity(row.lockedQuantity),
    released: formatQuantity(row.releasedQuantity),
    adjustments: formatQuantity(row.adjustmentQuantity)
  }));
}

export function buildInvoiceTrendRows(summary?: ReportSummary): InvoiceTrendDisplayRow[] {
  return (summary?.invoiceTrend ?? []).map((row) => ({
    month: row.month,
    invoices: String(row.invoices),
    issued: String(row.issued),
    voided: String(row.voided),
    reissued: String(row.reissued),
    amount: yuanCurrency(row.amountCents),
    issueRate: formatPercent(row.issued, row.invoices)
  }));
}

export function buildRebateTrendRows(summary?: ReportSummary): RebateTrendDisplayRow[] {
  return (summary?.rebateTrend ?? []).map((row) => ({
    month: row.month,
    rebates: String(row.rebates),
    approved: String(row.approved),
    paid: String(row.paid),
    rejected: String(row.rejected),
    amount: yuanCurrency(row.amountCents),
    payRate: formatPercent(row.paid, row.rebates)
  }));
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatQuantity(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(3)).toString();
}
