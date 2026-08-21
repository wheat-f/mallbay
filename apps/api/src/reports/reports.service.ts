/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  AfterSaleResponsibility,
  AfterSaleStatus,
  CostCompleteness,
  ConstructionTaskStatus,
  InvoiceStatus,
  InventoryMovementType,
  PaymentRecordType,
  Prisma,
  QualityCheckResult,
  RebateStatus,
  StorePosition,
  ConstructionCostSettlementStatus
} from "@prisma/client";
import { AccessContext, type AccessScopeFacts } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { OperationalReportQueryDto, ReportQueryDto } from "./dto/reports.dto";

export type AuthenticatedReportUser = {
  id: string;
  username?: string;
  /** @deprecated compatibility for staged test/request adapters only. */
  isAuditor?: boolean;
  /** @deprecated compatibility for staged test/request adapters only. */
  storeMember?: { storeId: string; position: string } | null;
};

const OPERATIONAL_DETAIL_ROW_LIMIT = 2000;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly accessContext: AccessContext) {}

  async summary(user: AuthenticatedReportUser, query: ReportQueryDto) {
    const access = await this.resolveScope(user, query.storeId);
    if (access.empty) return emptyReportSummary();
    const scope = buildReportQueryScope(user.id, access.storeIds, access.scope.ownerId);
    const [
      orders,
      amount,
      constructionRecords,
      afterSales,
      invoices,
      rebates,
      inventoryBatches,
      inventoryMovements,
      expenses,
      reimbursements,
      paymentRecords,
      salesCommissions,
      workerCommissions,
      salesTrendSource,
      constructionTrendSource,
      afterSaleTrendSource,
      commissionSalesTrendSource,
      commissionWorkerTrendSource,
      financeTrendSource,
      inventoryTrendSource,
      invoiceTrendSource,
      rebateTrendSource
    ] = await Promise.all([
      this.prisma.order.count({ where: scope.orderWhere }),
      this.prisma.orderAmount.aggregate({
        where: scope.orderAmountWhere,
        _sum: { totalAmountCents: true, paidAmountCents: true }
      }),
      this.prisma.constructionRecord.count({ where: scope.operationalWhere }),
      this.prisma.afterSale.count({ where: scope.operationalWhere }),
      this.prisma.invoice.count({ where: scope.invoiceWhere }),
      this.prisma.customerRebate.count({ where: scope.rebateWhere }),
      this.prisma.inventoryBatch.count({ where: scope.operationalWhere }),
      this.prisma.inventoryMovement.count({ where: scope.operationalWhere }),
      this.prisma.expenseApplication.aggregate({
        where: scope.operationalWhere,
        _sum: { amountCents: true }
      }),
      this.prisma.reimbursementApplication.aggregate({
        where: scope.operationalWhere,
        _sum: { amountCents: true }
      }),
      this.prisma.paymentRecord.aggregate({
        where: scope.operationalWhere,
        _sum: { amountCents: true }
      }),
      this.prisma.salesCommissionLog.aggregate({
        where: scope.salesCommissionWhere,
        _sum: { amountCents: true }
      }),
      this.prisma.workerCommission.aggregate({
        where: scope.operationalWhere,
        _sum: { finalAmountCents: true }
      }),
      this.prisma.order.findMany({
        where: scope.orderWhere,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          amount: { select: { totalAmountCents: true, paidAmountCents: true } }
        }
      }),
      this.prisma.constructionRecord.findMany({
        where: scope.operationalWhere,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          status: true,
          qualityResult: true
        }
      }),
      this.prisma.afterSale.findMany({
        where: scope.operationalWhere,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          status: true,
          responsibility: true
        }
      }),
      this.prisma.salesCommissionLog.findMany({
        where: scope.salesCommissionWhere,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          amountCents: true
        }
      }),
      this.prisma.workerCommission.findMany({
        where: scope.operationalWhere,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          finalAmountCents: true,
          adjustmentCents: true
        }
      }),
      this.prisma.paymentRecord.findMany({
        where: scope.operationalWhere,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          type: true,
          amountCents: true
        }
      }),
      this.prisma.inventoryMovement.findMany({
        where: scope.operationalWhere,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          movementType: true,
          quantity: true
        }
      }),
      this.prisma.invoice.findMany({
        where: scope.invoiceWhere,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          status: true,
          amountCents: true
        }
      }),
      this.prisma.customerRebate.findMany({
        where: scope.rebateWhere,
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          status: true,
          amountCents: true
        }
      })
    ]);
    return {
      orders,
      totalAmountCents: amount._sum.totalAmountCents ?? 0,
      paidAmountCents: amount._sum.paidAmountCents ?? 0,
      constructionRecords,
      afterSales,
      invoices,
      rebates,
      inventoryBatches,
      inventoryMovements,
      expenseAmountCents: expenses._sum.amountCents ?? 0,
      reimbursementAmountCents: reimbursements._sum.amountCents ?? 0,
      paymentRecordAmountCents: paymentRecords._sum.amountCents ?? 0,
      salesCommissionAmountCents: salesCommissions._sum.amountCents ?? 0,
      workerCommissionAmountCents: workerCommissions._sum.finalAmountCents ?? 0,
      salesTrend: buildSalesTrend(salesTrendSource),
      constructionTrend: buildConstructionTrend(constructionTrendSource),
      afterSaleTrend: buildAfterSaleTrend(afterSaleTrendSource),
      commissionTrend: buildCommissionTrend(commissionSalesTrendSource, commissionWorkerTrendSource),
      financeTrend: buildFinanceTrend(financeTrendSource),
      inventoryTrend: buildInventoryTrend(inventoryTrendSource),
      invoiceTrend: buildInvoiceTrend(invoiceTrendSource),
      rebateTrend: buildRebateTrend(rebateTrendSource)
    };
  }

  /**
   * Data behind the operational report centre.  It is separate from `summary`
   * so dashboard cards can retain their lightweight, backward-compatible
   * aggregate query while reports receive real people and order-level rows.
   */
  async operational(user: AuthenticatedReportUser, query: OperationalReportQueryDto) {
    const access = await this.resolveScope(user, query.storeId);
    if (access.empty) return emptyOperationalReport();
    const storeId = query.storeId;

    const dateRange = reportDateRange(query.dateFrom, query.dateTo);
    assertOperationalDateRange(query.dateFrom, query.dateTo);
    const salesPersonId = access.scope.ownerId ?? query.salesPersonId;
    const orderWhere = buildOperationalOrderWhere(storeId, query, dateRange, salesPersonId, access.storeIds);
    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      orderBy: { createdAt: "desc" },
      include: {
        salesPerson: { select: { id: true, nickname: true, username: true } },
        amount: true,
        items: { include: { product: { select: { category: true } } } },
        constructionRecord: {
          include: {
            assignments: { include: { worker: { select: { id: true, nickname: true, username: true } } } }
          }
        },
        costSettlement: { include: { workerLines: true } },
        workerCommissions: true,
        salesCommissionLog: true
      }
    });
    const filteredOrders = orders.filter((order) => matchesOperationalOrderFilters(order, query));
    const paymentOrderWhere = buildOperationalOrderWhere(storeId, { ...query, dateFrom: undefined, dateTo: undefined }, undefined, salesPersonId, access.storeIds);
    const paymentWhere: Prisma.OrderPaymentWhereInput = {
      paidAt: dateRange,
      order: paymentOrderWhere
    };
    const payments = await this.prisma.orderPayment.findMany({
      where: paymentWhere,
      select: { amountCents: true, paidAt: true, order: { select: { id: true, salesPersonId: true } } }
    });
    const afterSaleWhere: Prisma.AfterSaleWhereInput = {
      ...(storeId ? { storeId } : access.scope.global ? {} : { storeId: { in: access.storeIds } }),
      createdAt: dateRange,
      ...(salesPersonId ? { order: { salesPersonId } } : {}),
      ...(query.workerUserId ? { assignments: { some: { workerUserId: query.workerUserId } } } : {}),
      ...(query.afterSaleStatus ? { status: query.afterSaleStatus as never } : {}),
      ...(query.afterSaleResponsibility ? { responsibility: query.afterSaleResponsibility as never } : {})
    };
    const afterSales = await this.prisma.afterSale.findMany({
      where: afterSaleWhere,
      include: {
        assignments: { include: { worker: { select: { id: true, nickname: true, username: true } } } },
        costEntries: { where: { status: "CONFIRMED" }, select: { category: true, direction: true, amountCents: true, confirmedAt: true } }
      }
    });

    const filteredOrderIds = new Set(filteredOrders.map((order) => order.id));
    const filteredPayments = payments.filter((payment) => filteredOrderIds.has(payment.order.id));
    const report = buildOperationalReport({ orders: filteredOrders, payments: filteredPayments, afterSales, dateBasis: query.dateBasis ?? "DEFAULT", dateFrom: query.dateFrom, dateTo: query.dateTo });
    const detailRowCount = report.financeOrders.length;
    report.financeOrders = report.financeOrders.slice(0, OPERATIONAL_DETAIL_ROW_LIMIT);
    report.modules.details = {
      status: detailRowCount > OPERATIONAL_DETAIL_ROW_LIMIT ? "partial" : "ready",
      rowCount: detailRowCount,
      truncated: detailRowCount > OPERATIONAL_DETAIL_ROW_LIMIT,
      ...(detailRowCount > OPERATIONAL_DETAIL_ROW_LIMIT ? { errorCode: "DETAILS_TRUNCATED" } : {})
    };
    report.comparison = await this.operationalComparison(storeId, query, salesPersonId, report.summary, access.storeIds);
    report.generatedAt = new Date().toISOString();
    return report;
  }

  private async operationalComparison(
    storeId: string | undefined,
    query: OperationalReportQueryDto,
    salesPersonId: string | undefined,
    current: ReturnType<typeof buildOperationalReport>["summary"],
    storeIds: string[]
  ): Promise<ReturnType<typeof buildOperationalReport>["comparison"]> {
    const previous = previousPeriod(query.dateFrom, query.dateTo);
    const unavailable: ReturnType<typeof buildOperationalReport>["comparison"] = {
      amount: unavailableComparison(current.amountCents, "NO_PREVIOUS_PERIOD"),
      received: unavailableComparison(current.receivedCents, "NO_PREVIOUS_PERIOD"),
      outstanding: unavailableComparison(current.outstandingCents, "NO_PREVIOUS_PERIOD"),
      grossProfit: unavailableComparison(current.grossProfitCents, "NO_PREVIOUS_PERIOD")
    };
    if (!previous) return unavailable;
    const previousQuery = { ...query, dateFrom: previous.dateFrom, dateTo: previous.dateTo };
    const previousRange = reportDateRange(previous.dateFrom, previous.dateTo);
    const previousOrderWhere = buildOperationalOrderWhere(storeId, previousQuery, previousRange, salesPersonId, storeIds);
    const previousOrders = await this.prisma.order.findMany({
      where: previousOrderWhere,
      select: {
        id: true,
        amount: { select: { totalAmountCents: true, paidAmountCents: true, costCompleteness: true, estimatedTotalCostCents: true, estimatedMaterialCostCents: true, estimatedConstructionCostCents: true } },
        costSettlement: { select: { status: true, actualTotalCostCents: true, actualGrossProfitCents: true } }
      }
    });
    const previousPayment = await this.prisma.orderPayment.findMany({
      where: { paidAt: previousRange, order: buildOperationalOrderWhere(storeId, { ...previousQuery, dateFrom: undefined, dateTo: undefined }, undefined, salesPersonId, storeIds) },
      select: { amountCents: true, orderId: true }
    });
    const previousRows = previousOrders.filter((order) => matchesLeanOperationalOrderFilters(order, query));
    const previousOrderIds = new Set(previousRows.map((order) => order.id));
    const previousAmount = previousRows.reduce((sum, order) => sum + (order.amount?.totalAmountCents ?? 0), 0);
    const previousReceived = previousPayment.filter((payment) => previousOrderIds.has(payment.orderId)).reduce((sum, payment) => sum + payment.amountCents, 0);
    const previousOutstanding = previousRows.reduce((sum, order) => sum + Math.max(0, (order.amount?.totalAmountCents ?? 0) - (order.amount?.paidAmountCents ?? 0)), 0);
    const previousGross = previousRows.map(leanOperationalCost).some((cost) => cost === null) ? null : previousRows.reduce((sum, order) => sum + (leanOperationalCost(order) ?? 0), 0);
    return {
      amount: compareMetric(current.amountCents, previousAmount),
      received: compareMetric(current.receivedCents, previousReceived),
      outstanding: compareMetric(current.outstandingCents, previousOutstanding),
      grossProfit: current.grossProfitCents == null || previousGross == null ? unavailableComparison(current.grossProfitCents, "INCOMPLETE_METRIC") : compareMetric(current.grossProfitCents, previousGross)
    };
  }
  /** Returns only real active store members and values found in store data. */
  async filterOptions(user: AuthenticatedReportUser, query: ReportQueryDto) {
    const access = await this.resolveScope(user, query.storeId);
    if (access.empty) {
      return { salesPeople: [], constructionPeople: [], constructionTypes: [], productCategories: [], orderStatuses: [], afterSaleStatuses: [], afterSaleResponsibilities: [] };
    }
    const storeId = query.storeId ?? (access.storeIds.length === 1 ? access.storeIds[0] : undefined);
    if (!storeId) return { salesPeople: [], constructionPeople: [], constructionTypes: [], productCategories: [], orderStatuses: [], afterSaleStatuses: [], afterSaleResponsibilities: [] };
    const isSales = Boolean(access.scope.ownerId);
    const [members, constructionTypes, productCategories, orderStatuses, afterSaleStatuses, afterSaleResponsibilities] = await Promise.all([
      this.prisma.storeMember.findMany({
        where: {
          storeId,
          ...(isSales ? { userId: user.id } : {}),
          position: { in: [StorePosition.MANAGER, StorePosition.SALES, StorePosition.CONSTRUCTION, StorePosition.APPRENTICE] }
        },
        include: { user: { select: { id: true, nickname: true, username: true } } },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.order.findMany({ where: { storeId }, distinct: ["constructionType"], select: { constructionType: true } }),
      this.prisma.product.findMany({ where: { storeId }, distinct: ["category"], select: { category: true } }),
      this.prisma.order.findMany({ where: { storeId }, distinct: ["status"], select: { status: true } }),
      this.prisma.afterSale.findMany({ where: { storeId }, distinct: ["status"], select: { status: true } }),
      this.prisma.afterSale.findMany({ where: { storeId }, distinct: ["responsibility"], select: { responsibility: true } })
    ]);
    const people = members.map((member) => ({ id: member.user.id, name: member.user.nickname ?? member.user.username, position: member.position }));
    return {
      salesPeople: people.filter((person) => person.position === StorePosition.SALES || person.position === StorePosition.MANAGER),
      constructionPeople: people.filter((person) => person.position === StorePosition.CONSTRUCTION || person.position === StorePosition.APPRENTICE),
      constructionTypes: constructionTypes.map((item) => item.constructionType),
      productCategories: productCategories.map((item) => item.category),
      orderStatuses: orderStatuses.map((item) => item.status),
      afterSaleStatuses: afterSaleStatuses.map((item) => item.status),
      afterSaleResponsibilities: afterSaleResponsibilities.map((item) => item.responsibility)
    };
  }

  private async resolveScope(user: AuthenticatedReportUser, requestedStoreId?: string): Promise<{ scope: AccessScopeFacts; storeIds: string[]; empty: boolean }> {
    const scope = await this.accessContext.scope({ userId: user.id }, "reports", "read", requestedStoreId ? { storeId: requestedStoreId } : {});
    if (requestedStoreId && !scope.allowed) {
      throw new ForbiddenException({ code: scope.reason ?? "STORE_OUT_OF_SCOPE", message: "无权限访问该门店" });
    }
    if (!requestedStoreId && !scope.global && scope.reason === "ACCESS_DENIED") {
      throw new ForbiddenException({ code: "ACCESS_DENIED", message: "当前角色无权访问报表" });
    }
    const storeIds = requestedStoreId ? [requestedStoreId] : scope.global ? [] : scope.storeIds;
    return { scope, storeIds, empty: !scope.global && storeIds.length === 0 };
  }
}

function emptyReportSummary() {
  return {
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
    financeTrend: [],
    inventoryTrend: [],
    invoiceTrend: [],
    rebateTrend: []
  };
}

function emptyOperationalReport() {
  return buildOperationalReport({ orders: [], payments: [], afterSales: [], dateBasis: "DEFAULT" });
}

function buildReportQueryScope(userId: string, storeIds: string[], ownerId?: string) {
  const storeWhere = storeIds.length === 0 ? {} : storeIds.length === 1 ? { storeId: storeIds[0] } : { storeId: { in: storeIds } };
  if (!ownerId) {
    return {
      orderWhere: storeWhere,
      orderAmountWhere: storeIds.length ? { order: storeWhere } : {},
      invoiceWhere: storeWhere,
      rebateWhere: storeWhere,
      salesCommissionWhere: storeWhere,
      operationalWhere: storeWhere
    };
  }

  return {
    orderWhere: { ...storeWhere, salesPersonId: userId },
    orderAmountWhere: { order: { ...storeWhere, salesPersonId: userId } },
    invoiceWhere: { ...storeWhere, order: { salesPersonId: userId } },
    rebateWhere: { ...storeWhere, order: { salesPersonId: userId } },
    salesCommissionWhere: { ...storeWhere, salesUserId: userId },
    operationalWhere: { ...storeWhere, id: "__mallbay_sales_report_no_access__" }
  };
}

type SalesTrendSourceOrder = {
  createdAt: Date;
  amount?: {
    totalAmountCents: number | null;
    paidAmountCents: number | null;
  } | null;
};

function buildSalesTrend(orders: SalesTrendSourceOrder[]) {
  const grouped = new Map<string, { month: string; orders: number; totalAmountCents: number; paidAmountCents: number }>();
  for (const order of orders) {
    const month = order.createdAt.toISOString().slice(0, 7);
    const current = grouped.get(month) ?? { month, orders: 0, totalAmountCents: 0, paidAmountCents: 0 };
    current.orders += 1;
    current.totalAmountCents += order.amount?.totalAmountCents ?? 0;
    current.paidAmountCents += order.amount?.paidAmountCents ?? 0;
    grouped.set(month, current);
  }
  return [...grouped.values()];
}

type ConstructionTrendSourceRecord = {
  createdAt: Date;
  status: ConstructionTaskStatus;
  qualityResult: QualityCheckResult | null;
};

function buildConstructionTrend(records: ConstructionTrendSourceRecord[]) {
  const grouped = new Map<
    string,
    { month: string; records: number; completed: number; qualityPassed: number; reworkRequired: number }
  >();
  for (const record of records) {
    const month = record.createdAt.toISOString().slice(0, 7);
    const current = grouped.get(month) ?? {
      month,
      records: 0,
      completed: 0,
      qualityPassed: 0,
      reworkRequired: 0
    };
    current.records += 1;
    if (record.status === ConstructionTaskStatus.COMPLETED) {
      current.completed += 1;
    }
    if (record.qualityResult === QualityCheckResult.PASS) {
      current.qualityPassed += 1;
    }
    if (record.qualityResult === QualityCheckResult.REWORK_REQUIRED) {
      current.reworkRequired += 1;
    }
    grouped.set(month, current);
  }
  return [...grouped.values()];
}

type AfterSaleTrendSourceRecord = {
  createdAt: Date;
  status: AfterSaleStatus;
  responsibility: AfterSaleResponsibility;
};

function buildAfterSaleTrend(records: AfterSaleTrendSourceRecord[]) {
  const grouped = new Map<
    string,
    { month: string; cases: number; resolved: number; constructionResponsibility: number }
  >();
  for (const record of records) {
    const month = record.createdAt.toISOString().slice(0, 7);
    const current = grouped.get(month) ?? {
      month,
      cases: 0,
      resolved: 0,
      constructionResponsibility: 0
    };
    current.cases += 1;
    if (record.status === AfterSaleStatus.RESOLVED || record.status === AfterSaleStatus.CLOSED) {
      current.resolved += 1;
    }
    if (record.responsibility === AfterSaleResponsibility.CONSTRUCTION) {
      current.constructionResponsibility += 1;
    }
    grouped.set(month, current);
  }
  return [...grouped.values()];
}

type CommissionSalesTrendSourceRecord = {
  createdAt: Date;
  amountCents: number;
};

type CommissionWorkerTrendSourceRecord = {
  createdAt: Date;
  finalAmountCents: number;
  adjustmentCents: number;
};

function buildCommissionTrend(
  salesRecords: CommissionSalesTrendSourceRecord[],
  workerRecords: CommissionWorkerTrendSourceRecord[]
) {
  const grouped = new Map<
    string,
    {
      month: string;
      salesLogs: number;
      workerCommissions: number;
      salesCommissionCents: number;
      workerCommissionCents: number;
      workerAdjustmentCents: number;
      totalCommissionCents: number;
    }
  >();
  const getCurrent = (month: string) => {
    const current = grouped.get(month) ?? {
      month,
      salesLogs: 0,
      workerCommissions: 0,
      salesCommissionCents: 0,
      workerCommissionCents: 0,
      workerAdjustmentCents: 0,
      totalCommissionCents: 0
    };
    grouped.set(month, current);
    return current;
  };

  for (const record of salesRecords) {
    const current = getCurrent(record.createdAt.toISOString().slice(0, 7));
    current.salesLogs += 1;
    current.salesCommissionCents += record.amountCents;
    current.totalCommissionCents += record.amountCents;
  }
  for (const record of workerRecords) {
    const current = getCurrent(record.createdAt.toISOString().slice(0, 7));
    current.workerCommissions += 1;
    current.workerCommissionCents += record.finalAmountCents;
    current.workerAdjustmentCents += record.adjustmentCents;
    current.totalCommissionCents += record.finalAmountCents;
  }
  return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month));
}

type FinanceTrendSourceRecord = {
  createdAt: Date;
  type: PaymentRecordType;
  amountCents: number;
};

function buildFinanceTrend(records: FinanceTrendSourceRecord[]) {
  const grouped = new Map<
    string,
    {
      month: string;
      incomeCents: number;
      expenseCents: number;
      reimbursementCents: number;
      rebateCents: number;
      netCashflowCents: number;
    }
  >();
  for (const record of records) {
    const month = record.createdAt.toISOString().slice(0, 7);
    const current = grouped.get(month) ?? {
      month,
      incomeCents: 0,
      expenseCents: 0,
      reimbursementCents: 0,
      rebateCents: 0,
      netCashflowCents: 0
    };
    if (record.type === PaymentRecordType.ORDER_PAYMENT) {
      current.incomeCents += record.amountCents;
      current.netCashflowCents += record.amountCents;
    } else if (record.type === PaymentRecordType.EXPENSE) {
      current.expenseCents += record.amountCents;
      current.netCashflowCents -= record.amountCents;
    } else if (record.type === PaymentRecordType.REIMBURSEMENT) {
      current.reimbursementCents += record.amountCents;
      current.netCashflowCents -= record.amountCents;
    } else if (record.type === PaymentRecordType.REBATE) {
      current.rebateCents += record.amountCents;
      current.netCashflowCents -= record.amountCents;
    }
    grouped.set(month, current);
  }
  return [...grouped.values()];
}

type InventoryTrendSourceRecord = {
  createdAt: Date;
  movementType: InventoryMovementType;
  quantity: number | string | { toString(): string };
};

function buildInventoryTrend(records: InventoryTrendSourceRecord[]) {
  const grouped = new Map<
    string,
    {
      month: string;
      movements: number;
      inboundQuantity: number;
      outboundQuantity: number;
      lockedQuantity: number;
      releasedQuantity: number;
      adjustmentQuantity: number;
    }
  >();
  for (const record of records) {
    const month = record.createdAt.toISOString().slice(0, 7);
    const current = grouped.get(month) ?? {
      month,
      movements: 0,
      inboundQuantity: 0,
      outboundQuantity: 0,
      lockedQuantity: 0,
      releasedQuantity: 0,
      adjustmentQuantity: 0
    };
    const quantity = Number(record.quantity);
    current.movements += 1;
    if (
      record.movementType === InventoryMovementType.PURCHASE_IN ||
      record.movementType === InventoryMovementType.COUNT_IN ||
      record.movementType === InventoryMovementType.TRANSFER_IN ||
      record.movementType === InventoryMovementType.RETURN_IN
    ) {
      current.inboundQuantity += quantity;
    } else if (
      record.movementType === InventoryMovementType.ORDER_OUT ||
      record.movementType === InventoryMovementType.COUNT_OUT ||
      record.movementType === InventoryMovementType.DAMAGE_OUT ||
      record.movementType === InventoryMovementType.TRANSFER_OUT ||
      record.movementType === InventoryMovementType.RETURN_OUT
    ) {
      current.outboundQuantity += quantity;
    } else if (record.movementType === InventoryMovementType.ORDER_LOCK) {
      current.lockedQuantity += quantity;
    } else if (record.movementType === InventoryMovementType.STOCK_RELEASE) {
      current.releasedQuantity += quantity;
    } else if (
      record.movementType === InventoryMovementType.STOCK_ADJUST ||
      record.movementType === InventoryMovementType.DAMAGE ||
      record.movementType === InventoryMovementType.TRANSFER ||
      record.movementType === InventoryMovementType.UNIT_CONVERSION ||
      record.movementType === InventoryMovementType.BATCH_SPLIT
    ) {
      current.adjustmentQuantity += quantity;
    }
    grouped.set(month, current);
  }
  return [...grouped.values()];
}

type InvoiceTrendSourceRecord = {
  createdAt: Date;
  status: InvoiceStatus;
  amountCents: number;
};

function buildInvoiceTrend(records: InvoiceTrendSourceRecord[]) {
  const grouped = new Map<
    string,
    { month: string; invoices: number; issued: number; voided: number; reissued: number; amountCents: number }
  >();
  for (const record of records) {
    const month = record.createdAt.toISOString().slice(0, 7);
    const current = grouped.get(month) ?? {
      month,
      invoices: 0,
      issued: 0,
      voided: 0,
      reissued: 0,
      amountCents: 0
    };
    current.invoices += 1;
    current.amountCents += record.amountCents;
    if (record.status === InvoiceStatus.ISSUED) {
      current.issued += 1;
    }
    if (record.status === InvoiceStatus.VOIDED) {
      current.voided += 1;
    }
    if (record.status === InvoiceStatus.REISSUED) {
      current.reissued += 1;
    }
    grouped.set(month, current);
  }
  return [...grouped.values()];
}

type RebateTrendSourceRecord = {
  createdAt: Date;
  status: RebateStatus;
  amountCents: number;
};

function buildRebateTrend(records: RebateTrendSourceRecord[]) {
  const grouped = new Map<
    string,
    { month: string; rebates: number; approved: number; paid: number; rejected: number; amountCents: number }
  >();
  for (const record of records) {
    const month = record.createdAt.toISOString().slice(0, 7);
    const current = grouped.get(month) ?? {
      month,
      rebates: 0,
      approved: 0,
      paid: 0,
      rejected: 0,
      amountCents: 0
    };
    current.rebates += 1;
    current.amountCents += record.amountCents;
    if (record.status === RebateStatus.APPROVED) {
      current.approved += 1;
    }
    if (record.status === RebateStatus.PAID) {
      current.paid += 1;
    }
    if (record.status === RebateStatus.REJECTED) {
      current.rejected += 1;
    }
    grouped.set(month, current);
  }
  return [...grouped.values()];
}

type OperationalReportOrder = {
  id: string;
  orderNo: string;
  salesPersonId: string;
  constructionType: string;
  status: string;
  createdAt: Date;
  appointmentDate: Date | null;
  salesPerson: { id: string; nickname: string | null; username: string };
  amount: {
    totalAmountCents: number;
    paidAmountCents: number;
    constructionChargeCents: number | null;
    laborCostCents: number;
    estimatedTotalCostCents: number | null;
    estimatedMaterialCostCents: number | null;
    estimatedConstructionCostCents: number | null;
    costCompleteness: CostCompleteness | null;
  } | null;
  items: Array<{ product: { category: string } }>;
  constructionRecord: {
    completedAt: Date | null;
    assignments: Array<{ workerUserId: string; worker: { id: string; nickname: string | null; username: string } }>;
  } | null;
  costSettlement: {
    status: ConstructionCostSettlementStatus;
    actualMaterialCostCents: number;
    actualConstructionCostCents: number;
    actualTotalCostCents: number;
    actualGrossProfitCents: number | null;
    settledAt: Date | null;
    workerLines: Array<{ workerUserId: string; confirmedMinutes: number; manualConstructionChargeCents: number | null }>;
  } | null;
  workerCommissions: Array<{ workerUserId: string; amountCents: number; finalAmountCents: number }>;
  salesCommissionLog: { amountCents: number } | null;
};

type OperationalPayment = { amountCents: number; paidAt: Date; order: { id: string; salesPersonId: string } };
type ReportMetricComparison = { status: "comparable" | "new" | "unchanged" | "unavailable"; changeBps: number | null; currentCents: number; previousCents: number | null; reason?: "NO_PREVIOUS_PERIOD" | "NO_COMPARABLE_DATA" | "INCOMPLETE_METRIC" };
type OperationalAfterSale = {
  id: string;
  createdAt: Date;
  status: AfterSaleStatus;
  responsibility: AfterSaleResponsibility;
  assignments: Array<{ workerUserId: string; worker: { id: string; nickname: string | null; username: string } }>;
  costEntries: Array<{ category: string; direction: string; amountCents: number; confirmedAt: Date }>;
};

type LeanOperationalOrder = {
  amount: { totalAmountCents: number; paidAmountCents: number; costCompleteness: CostCompleteness | null; estimatedTotalCostCents: number | null; estimatedMaterialCostCents: number | null; estimatedConstructionCostCents: number | null } | null;
  costSettlement: { status: ConstructionCostSettlementStatus; actualTotalCostCents: number; actualGrossProfitCents: number | null } | null;
};

function matchesLeanOperationalOrderFilters(order: LeanOperationalOrder, query: OperationalReportQueryDto) {
  const cost = leanOperationalCost(order);
  if (query.costSource) {
    const source = cost === null ? "待补齐" : order.costSettlement ? "实际" : "标准";
    if (source !== query.costSource) return false;
  }
  if (query.collectionStatus) {
    const total = order.amount?.totalAmountCents ?? 0;
    const paid = order.amount?.paidAmountCents ?? 0;
    const status = paid >= total && total > 0 ? "已收清" : paid > 0 ? "部分收款" : "未收款";
    if (status !== query.collectionStatus) return false;
  }
  return true;
}

function leanOperationalCost(order: LeanOperationalOrder): number | null {
  if (order.costSettlement?.status === ConstructionCostSettlementStatus.CONFIRMED || order.costSettlement?.status === ConstructionCostSettlementStatus.SETTLED) {
    return order.costSettlement.actualGrossProfitCents ?? ((order.amount?.totalAmountCents ?? 0) - order.costSettlement.actualTotalCostCents);
  }
  if (order.amount?.costCompleteness === CostCompleteness.COMPLETE) {
    const total = order.amount.estimatedTotalCostCents ?? (order.amount.estimatedMaterialCostCents ?? 0) + (order.amount.estimatedConstructionCostCents ?? 0);
    return (order.amount?.totalAmountCents ?? 0) - total;
  }
  return null;
}

function previousPeriod(dateFrom?: string, dateTo?: string) {
  if (!dateFrom || !dateTo) return undefined;
  const start = parseDateOnly(dateFrom);
  const end = parseDateOnly(dateTo);
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days <= 0) return undefined;
  const lastDayOfMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  if (start.getUTCDate() === 1 && end.getUTCDate() === lastDayOfMonth && start.getUTCMonth() === end.getUTCMonth()) {
    const previousEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    const previousStart = new Date(Date.UTC(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth(), 1));
    return { dateFrom: formatDateOnly(previousStart), dateTo: formatDateOnly(previousEnd) };
  }
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  return { dateFrom: formatDateOnly(previousStart), dateTo: formatDateOnly(previousEnd) };
}
function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function compareMetric(currentCents: number, previousCents: number): ReportMetricComparison {
  if (previousCents === 0 && currentCents > 0) return { status: "new" as const, changeBps: null, currentCents, previousCents };
  if (previousCents === 0 && currentCents === 0) return { status: "unchanged" as const, changeBps: null, currentCents, previousCents };
  return { status: "comparable" as const, changeBps: Math.round(((currentCents - previousCents) * 10000) / Math.abs(previousCents)), currentCents, previousCents };
}
function reportDateRange(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (dateFrom) range.gte = new Date(dateFrom + "T00:00:00.000+08:00");
  if (dateTo) {
    const endExclusive = new Date(dateTo + "T00:00:00.000+08:00");
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    range.lt = endExclusive;
  }
  return range;
}

function assertOperationalDateRange(dateFrom?: string, dateTo?: string) {
  if ((dateFrom && !isValidReportDate(dateFrom)) || (dateTo && !isValidReportDate(dateTo))) {
    throw new BadRequestException("REPORT_DATE_RANGE_INVALID");
  }
  if (!dateFrom || !dateTo) return;
  const start = new Date(dateFrom + "T00:00:00.000+08:00").getTime();
  const end = new Date(dateTo + "T00:00:00.000+08:00").getTime();
  if (end < start) throw new BadRequestException("REPORT_DATE_RANGE_INVALID");
  if ((end - start) / 86400000 + 1 > 366) throw new BadRequestException("REPORT_DATE_RANGE_TOO_LARGE");
}

function isValidReportDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function matchesOperationalOrderFilters(order: OperationalReportOrder, query: OperationalReportQueryDto) {
  if (query.costSource && summarizeReportOrderCost(order).costSource !== query.costSource) return false;
  if (query.collectionStatus) {
    const total = order.amount?.totalAmountCents ?? 0;
    const paid = order.amount?.paidAmountCents ?? 0;
    const status = paid >= total && total > 0 ? "已收清" : paid > 0 ? "部分收款" : "未收款";
    if (status !== query.collectionStatus) return false;
  }
  return true;
}
function buildOperationalOrderWhere(
  storeId: string | undefined,
  query: OperationalReportQueryDto,
  dateRange: Prisma.DateTimeFilter | undefined,
  salesPersonId?: string,
  accessibleStoreIds: string[] = []
): Prisma.OrderWhereInput {
  const dateBasis = query.dateBasis ?? "DEFAULT";
  const dateScope = !dateRange
    ? {}
    : dateBasis === "APPOINTMENT"
      ? { appointmentDate: dateRange }
      : dateBasis === "CONSTRUCTION_COMPLETED"
        ? { constructionRecord: { is: { completedAt: dateRange } } }
        : dateBasis === "SETTLEMENT"
          ? { costSettlement: { is: { settledAt: dateRange } } }
          : { createdAt: dateRange };
  return {
    ...(storeId ? { storeId } : accessibleStoreIds.length ? { storeId: { in: accessibleStoreIds } } : {}),
    ...(salesPersonId ? { salesPersonId } : {}),
    ...(query.workerUserId ? { constructionRecord: { is: { assignments: { some: { workerUserId: query.workerUserId } } } } } : {}),
    ...(query.constructionType ? { constructionType: query.constructionType as never } : {}),
    ...(query.orderStatus ? { status: query.orderStatus as never } : {}),
    ...(query.productCategory ? { items: { some: { product: { category: query.productCategory as never } } } } : {}),
    ...dateScope
  };
}

function buildOperationalReport(input: {
  orders: OperationalReportOrder[];
  payments: OperationalPayment[];
  afterSales: OperationalAfterSale[];
  dateBasis: NonNullable<OperationalReportQueryDto["dateBasis"]>;
  dateFrom?: string;
  dateTo?: string;
}) {
  const sales = new Map<string, {
    userId: string; name: string; orders: number; amountCents: number; receivedCents: number;
    costCents: number; grossProfitCents: number | null; accruedCommissionCents: number;
    confirmedCommissionCents: number; settledCommissionCents: number; costSourceActualOrders: number;
    costSourceStandardOrders: number; costSourceMissingOrders: number;
  }>();
  const workers = new Map<string, {
    userId: string; name: string; orders: number; orderAmountCents: number; constructionChargeCents: number;
    allocatedConstructionChargeCents: number; confirmedMinutes: number; accruedCommissionCents: number;
    confirmedCommissionCents: number; settledCommissionCents: number; allocationStatus: "已按确认工时分摊" | "店长手工分摊" | "待确认工时";
  }>();
  const financeOrders: Array<{
    orderId: string; orderNo: string; salesPersonName: string; constructionType: string; status: string;
    amountCents: number; receivedCents: number; materialCostCents: number | null; constructionCostCents: number | null;
    totalCostCents: number | null; grossProfitCents: number | null; costSource: "实际" | "标准" | "待补齐";
  }> = [];
  const projectStats = new Map<string, { dimension: "施工类型" | "产品分类"; name: string; orders: number; amountCents: number; constructionChargeCents: number }>();

  const paymentBySales = new Map<string, number>();
  for (const payment of input.payments) {
    paymentBySales.set(payment.order.salesPersonId, (paymentBySales.get(payment.order.salesPersonId) ?? 0) + payment.amountCents);
  }

  for (const order of input.orders) {
    const amount = order.amount;
    const total = amount?.totalAmountCents ?? 0;
    const constructionCharge = amount?.constructionChargeCents ?? amount?.laborCostCents ?? 0;
    const cost = summarizeReportOrderCost(order);
    const salesName = displayName(order.salesPerson);
    const salesRow = sales.get(order.salesPersonId) ?? {
      userId: order.salesPersonId, name: salesName, orders: 0, amountCents: 0, receivedCents: 0,
      costCents: 0, grossProfitCents: 0, accruedCommissionCents: 0, confirmedCommissionCents: 0,
      settledCommissionCents: 0, costSourceActualOrders: 0, costSourceStandardOrders: 0, costSourceMissingOrders: 0
    };
    salesRow.orders += 1;
    salesRow.amountCents += total;
    salesRow.costCents += cost.totalCostCents ?? 0;
    if (salesRow.grossProfitCents !== null && cost.grossProfitCents !== null) salesRow.grossProfitCents += cost.grossProfitCents; else salesRow.grossProfitCents = null;
    salesRow.accruedCommissionCents += order.salesCommissionLog?.amountCents ?? 0;
    if (order.costSettlement?.status === ConstructionCostSettlementStatus.CONFIRMED || order.costSettlement?.status === ConstructionCostSettlementStatus.SETTLED) {
      salesRow.confirmedCommissionCents += order.salesCommissionLog?.amountCents ?? 0;
    }
    if (order.costSettlement?.status === ConstructionCostSettlementStatus.SETTLED) {
      salesRow.settledCommissionCents += order.salesCommissionLog?.amountCents ?? 0;
    }
    if (cost.costSource === "实际") salesRow.costSourceActualOrders += 1;
    if (cost.costSource === "标准") salesRow.costSourceStandardOrders += 1;
    if (cost.costSource === "待补齐") salesRow.costSourceMissingOrders += 1;
    sales.set(order.salesPersonId, salesRow);

    financeOrders.push({
      orderId: order.id,
      orderNo: order.orderNo,
      salesPersonName: salesName,
      constructionType: order.constructionType,
      status: order.status,
      amountCents: total,
      receivedCents: amount?.paidAmountCents ?? 0,
      materialCostCents: cost.materialCostCents,
      constructionCostCents: cost.constructionCostCents,
      totalCostCents: cost.totalCostCents,
      grossProfitCents: cost.grossProfitCents,
      costSource: cost.costSource
    });

    addProjectStat(projectStats, "施工类型", order.constructionType, total, constructionCharge);
    for (const category of new Set(order.items.map((item) => item.product.category))) {
      addProjectStat(projectStats, "产品分类", category, total, constructionCharge);
    }

    const record = order.constructionRecord;
    const settlement = order.costSettlement;
    const isWorkConfirmed = settlement?.status === ConstructionCostSettlementStatus.CONFIRMED || settlement?.status === ConstructionCostSettlementStatus.SETTLED;
    const confirmedMinutesTotal = isWorkConfirmed ? (settlement?.workerLines.reduce((sum, line) => sum + line.confirmedMinutes, 0) ?? 0) : 0;
    const hasManualConstructionChargeAllocation = isWorkConfirmed && Boolean(settlement?.workerLines.length) && settlement!.workerLines.every((line) => line.manualConstructionChargeCents != null);
    for (const assignment of record?.assignments ?? []) {
      const workerId = assignment.workerUserId;
      const commission = order.workerCommissions.find((item) => item.workerUserId === workerId);
      const worker = workers.get(workerId) ?? {
        userId: workerId, name: displayName(assignment.worker), orders: 0, orderAmountCents: 0,
        constructionChargeCents: 0, allocatedConstructionChargeCents: 0, confirmedMinutes: 0,
        accruedCommissionCents: 0, confirmedCommissionCents: 0, settledCommissionCents: 0,
        allocationStatus: "待确认工时" as const
      };
      worker.orders += 1;
      worker.orderAmountCents += total;
      worker.constructionChargeCents += constructionCharge;
      worker.accruedCommissionCents += commission?.finalAmountCents ?? 0;
      if (isWorkConfirmed) {
        const minutes = settlement?.workerLines.find((line) => line.workerUserId === workerId)?.confirmedMinutes ?? 0;
        worker.confirmedMinutes += minutes;
        const manualCharge = settlement?.workerLines.find((line) => line.workerUserId === workerId)?.manualConstructionChargeCents;
        worker.allocatedConstructionChargeCents += hasManualConstructionChargeAllocation
          ? (manualCharge ?? 0)
          : confirmedMinutesTotal > 0 ? Math.round((constructionCharge * minutes) / confirmedMinutesTotal) : 0;
        worker.confirmedCommissionCents += commission?.finalAmountCents ?? 0;
        worker.allocationStatus = hasManualConstructionChargeAllocation ? "店长手工分摊" : "已按确认工时分摊";
        if (settlement?.status === ConstructionCostSettlementStatus.SETTLED) worker.settledCommissionCents += commission?.finalAmountCents ?? 0;
      }
      workers.set(workerId, worker);
    }
  }
  for (const [salesUserId, receivedCents] of paymentBySales) {
    const row = sales.get(salesUserId);
    if (row) row.receivedCents = receivedCents;
  }

  const afterSaleWorkers = new Map<string, { userId: string; name: string; afterSales: number; constructionOrders: number; afterSaleRateBps: number; materialCostCents: number; laborCostCents: number; refundCompensationCents: number; outsourceCostCents: number; supplierRecoveryCents: number }>();
  for (const worker of workers.values()) {
    afterSaleWorkers.set(worker.userId, {
      userId: worker.userId, name: worker.name, afterSales: 0, constructionOrders: worker.orders, afterSaleRateBps: 0,
      materialCostCents: 0, laborCostCents: 0, refundCompensationCents: 0, outsourceCostCents: 0, supplierRecoveryCents: 0
    });
  }
  const afterSaleBreakdown = new Map<string, { category: string; afterSales: number; proportionBps: number }>();
  for (const afterSale of input.afterSales) {
    const key = `${afterSale.status}/${afterSale.responsibility}`;
    const aggregate = afterSaleBreakdown.get(key) ?? { category: key, afterSales: 0, proportionBps: 0 };
    aggregate.afterSales += 1;
    afterSaleBreakdown.set(key, aggregate);
    const sharedCost = (category: string, direction: string) => {
      const total = afterSale.costEntries
        .filter((entry) => entry.category === category)
        .reduce((sum, entry) => sum + (entry.direction === direction ? entry.amountCents : -entry.amountCents), 0);
      return afterSale.assignments.length > 0 ? Math.round(total / afterSale.assignments.length) : 0;
    };
    for (const assignment of afterSale.assignments) {
      const worker = afterSaleWorkers.get(assignment.workerUserId) ?? {
        userId: assignment.workerUserId, name: displayName(assignment.worker), afterSales: 0, constructionOrders: 0,
        afterSaleRateBps: 0, materialCostCents: 0, laborCostCents: 0, refundCompensationCents: 0, outsourceCostCents: 0, supplierRecoveryCents: 0
      };
      worker.afterSales += 1;
      worker.materialCostCents += sharedCost("MATERIAL", "EXPENSE");
      worker.laborCostCents += sharedCost("CONSTRUCTION_LABOR", "EXPENSE");
      worker.refundCompensationCents += sharedCost("REFUND_COMPENSATION", "EXPENSE");
      worker.outsourceCostCents += sharedCost("OUTSOURCE", "EXPENSE");
      worker.supplierRecoveryCents += sharedCost("SUPPLIER_RECOVERY", "RECOVERY");
      afterSaleWorkers.set(worker.userId, worker);
    }
  }
  for (const row of afterSaleWorkers.values()) {
    row.afterSaleRateBps = row.constructionOrders > 0 ? Math.round((row.afterSales * 10000) / row.constructionOrders) : 0;
  }
  for (const row of afterSaleBreakdown.values()) {
    row.proportionBps = input.afterSales.length > 0 ? Math.round((row.afterSales * 10000) / input.afterSales.length) : 0;
  }
  const analytics = buildOperationalAnalytics(input.orders, input.payments, input.afterSales, input.dateBasis, input.dateFrom, input.dateTo, sales, financeOrders, afterSaleWorkers);
  return {
    version: 1 as const,
    dateBasis: input.dateBasis,
    salesPeople: [...sales.values()].sort((a, b) => b.amountCents - a.amountCents),
    constructionWorkers: [...workers.values()].sort((a, b) => b.allocatedConstructionChargeCents - a.allocatedConstructionChargeCents),
    financeOrders,
    projectStats: [...projectStats.values()].sort((a, b) => b.amountCents - a.amountCents),
    afterSaleWorkers: [...afterSaleWorkers.values()].sort((a, b) => b.afterSales - a.afterSales),
    afterSaleBreakdown: [...afterSaleBreakdown.values()].sort((a, b) => b.afterSales - a.afterSales),
    ...analytics
  };
}

function operationalOrderDate(order: OperationalReportOrder, dateBasis: NonNullable<OperationalReportQueryDto["dateBasis"]>) {
  if (dateBasis === "APPOINTMENT") return order.appointmentDate;
  if (dateBasis === "CONSTRUCTION_COMPLETED") return order.constructionRecord?.completedAt ?? null;
  if (dateBasis === "SETTLEMENT") return order.costSettlement?.settledAt ?? null;
  return order.createdAt;
}

function buildOperationalAnalytics(
  orders: OperationalReportOrder[],
  payments: OperationalPayment[],
  afterSales: OperationalAfterSale[],
  dateBasis: NonNullable<OperationalReportQueryDto["dateBasis"]>,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  sales: Map<string, { userId: string; name: string; orders: number; amountCents: number; receivedCents: number; costCents: number; grossProfitCents: number | null }>,
  financeOrders: Array<{ totalCostCents: number | null; grossProfitCents: number | null; costSource: "实际" | "标准" | "待补齐" }>,
  afterSaleWorkers: Map<string, { afterSales: number }>
) {
  const costRows = orders.map((order) => summarizeReportOrderCost(order));
  const pendingCostOrderCount = costRows.filter((row) => row.costSource === "待补齐").length;
  const knownCostOrderCount = costRows.length - pendingCostOrderCount;
  const amountCents = orders.reduce((sum, order) => sum + (order.amount?.totalAmountCents ?? 0), 0);
  const receivedCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const outstandingCents = orders.reduce((sum, order) => sum + Math.max(0, (order.amount?.totalAmountCents ?? 0) - (order.amount?.paidAmountCents ?? 0)), 0);
  const completedOrderCount = orders.filter((order) => order.constructionRecord?.completedAt !== null && order.constructionRecord?.completedAt !== undefined).length;
  const knownCostGrossProfitCents = costRows.reduce((sum, row) => sum + (row.grossProfitCents ?? 0), 0);
  const grossProfitCents = pendingCostOrderCount > 0 ? null : knownCostGrossProfitCents;
  const afterSalesExpenseCents = afterSales.reduce(
    (sum, afterSale) => sum + afterSale.costEntries.reduce((entrySum, entry) => entrySum + (entry.direction === "RECOVERY" ? -entry.amountCents : entry.amountCents), 0),
    0
  );
  const summary = {
    orders: orders.length,
    amountCents,
    receivedCents,
    outstandingCents,
    afterSalesCount: afterSales.length,
    afterSalesExpenseCents,
    constructionOrderCount: completedOrderCount,
    grossProfitCents,
    costCompletenessBps: costRows.length === 0 ? 10000 : Math.round((knownCostOrderCount * 10000) / costRows.length),
    metricCompleteness: pendingCostOrderCount > 0 ? "incomplete" as const : "complete" as const,
    knownCostOrderCount,
    pendingCostOrderCount,
    knownCostGrossProfitCents,
    coverage: {
      ordersWithMissingBusinessDate: orders.filter((order) => !operationalOrderDate(order, dateBasis)).length,
      paymentsWithMissingEntryDate: payments.filter((payment) => !payment.paidAt).length,
      costsWithMissingConfirmationDate: afterSales.reduce((count, afterSale) => count + afterSale.costEntries.filter((entry) => !entry.confirmedAt).length, 0),
      afterSalesWithMissingConfirmationDate: afterSales.filter((afterSale) => afterSale.costEntries.some((entry) => !entry.confirmedAt)).length
    }
  };
  const trendGranularity = trendGranularityFor(dateFrom, dateTo);
  const trendMap = new Map<string, { period: string; orders: number; amountCents: number; receivedCents: number; outstandingCents: number; afterSalesCount: number; afterSalesExpenseCents: number; constructionOrderCount: number; grossProfitCents: number | null; costCompletenessBps: number; metricCompleteness: "complete" | "incomplete"; knownCostOrderCount: number; pendingCostOrderCount: number; knownCostGrossProfitCents: number | null }>();
  const getTrend = (date: Date) => {
    const period = reportPeriodKey(date, trendGranularity);
    const existing = trendMap.get(period) ?? { period, orders: 0, amountCents: 0, receivedCents: 0, outstandingCents: 0, afterSalesCount: 0, afterSalesExpenseCents: 0, constructionOrderCount: 0, grossProfitCents: 0, costCompletenessBps: 10000, metricCompleteness: "complete" as const, knownCostOrderCount: 0, pendingCostOrderCount: 0, knownCostGrossProfitCents: 0 };
    trendMap.set(period, existing);
    return existing;
  };
  for (let index = 0; index < orders.length; index += 1) {
    const order = orders[index];
    const cost = costRows[index];
    const orderDate = operationalOrderDate(order, dateBasis);
    if (!orderDate) continue;
    const row = getTrend(orderDate);
    row.orders += 1;
    row.amountCents += order.amount?.totalAmountCents ?? 0;
    row.outstandingCents += Math.max(0, (order.amount?.totalAmountCents ?? 0) - (order.amount?.paidAmountCents ?? 0));
    if (cost.grossProfitCents === null) {
      row.grossProfitCents = null;
      row.metricCompleteness = "incomplete";
    } else if (row.grossProfitCents !== null) {
      row.grossProfitCents += cost.grossProfitCents;
    }
  }
  for (const payment of payments) getTrend(payment.paidAt).receivedCents += payment.amountCents;
  for (const afterSale of afterSales) {
    const row = getTrend(afterSale.createdAt);
    row.afterSalesCount += 1;
    row.afterSalesExpenseCents += afterSale.costEntries.reduce((sum, entry) => isDateWithinQueryRange(entry.confirmedAt, dateFrom, dateTo) ? sum + (entry.direction === "RECOVERY" ? -entry.amountCents : entry.amountCents) : sum, 0);
  }
  for (const row of trendMap.values()) {
    const knownOrders = orders.filter((order) => {
      const orderDate = operationalOrderDate(order, dateBasis);
      return orderDate !== null && reportPeriodKey(orderDate, trendGranularity) === row.period && summarizeReportOrderCost(order).costSource !== "待补齐";
    }).length;
    row.knownCostOrderCount = knownOrders;
    row.pendingCostOrderCount = row.orders - knownOrders;
    row.knownCostGrossProfitCents = row.metricCompleteness === "complete" ? row.grossProfitCents : null;
    row.constructionOrderCount = orders.filter((order) => {
      const orderDate = operationalOrderDate(order, dateBasis);
      return order.constructionRecord?.completedAt !== null && order.constructionRecord?.completedAt !== undefined && orderDate !== null && reportPeriodKey(orderDate, trendGranularity) === row.period;
    }).length;
    row.costCompletenessBps = row.orders === 0 ? 10000 : Math.round((knownOrders * 10000) / row.orders);
  }
  const insights: Array<{ severity: "WARNING"; title: string; evidence: string; action: string; targetView?: string; filters?: Record<string, string | undefined> }> = [];
  if (amountCents > 0 && receivedCents * 10000 < amountCents * 8000 && outstandingCents > 0) {
    insights.push({ severity: "WARNING", title: "收款落后于订单金额", evidence: "订单金额 " + amountCents + " 分，实际收款 " + receivedCents + " 分，待收 " + outstandingCents + " 分", action: "查看待收订单", targetView: "finance", filters: { dateFrom, dateTo, collectionStatus: "部分收款" } });
  }
  if (pendingCostOrderCount > 0) {
    insights.push({ severity: "WARNING", title: "成本数据待补齐", evidence: "待补齐 " + pendingCostOrderCount + " 单，成本完整度 " + summary.costCompletenessBps + " bps", action: "查看待补齐成本订单", targetView: "finance", filters: { dateFrom, dateTo, costSource: "待补齐" } });
  }
  const topSales = [...sales.values()].sort((a, b) => b.amountCents - a.amountCents)[0];
  if (topSales && amountCents > 0 && topSales.amountCents * 10000 >= amountCents * 5000 && topSales.orders >= 3) {
    insights.push({ severity: "WARNING", title: "人员贡献集中", evidence: topSales.name + "贡献 " + Math.round((topSales.amountCents * 10000) / amountCents) + " bps，" + topSales.orders + " 单", action: "查看销售分析", targetView: "sales", filters: { dateFrom, dateTo, salesPersonId: topSales.userId } });
  }
  if (completedOrderCount >= 10 && afterSales.length * 10000 >= completedOrderCount * 1000) {
    insights.push({ severity: "WARNING", title: "售后比例偏高", evidence: "售后 " + afterSales.length + " 单，施工订单 " + completedOrderCount + " 单，售后率 " + Math.round((afterSales.length * 10000) / completedOrderCount) + " bps", action: "查看售后人员分析", targetView: "afterSalesWorker", filters: { dateFrom, dateTo } });
  }
  return {
    summary,
    generatedAt: new Date().toISOString(),
    modules: {
      summary: {
        status: summary.metricCompleteness === "complete" ? "ready" as const : "partial" as const,
        ...(summary.metricCompleteness === "complete" ? {} : { errorCode: "COST_INCOMPLETE" })
      },
      trend: {
        status: summary.metricCompleteness === "complete" ? "ready" as const : "partial" as const,
        ...(summary.metricCompleteness === "complete" ? {} : { errorCode: "COST_INCOMPLETE" })
      },
      insights: { status: "ready" as const },
      details: { status: "ready" as "ready" | "partial" | "unavailable" | "error", rowCount: financeOrders.length, truncated: false }
    },
    comparison: {
      amount: unavailableComparison(amountCents),
      received: unavailableComparison(receivedCents),
      outstanding: unavailableComparison(outstandingCents),
      grossProfit: unavailableComparison(grossProfitCents)
    },
    trendGranularity,
    trend: [...trendMap.values()].sort((a, b) => a.period.localeCompare(b.period)),
    insights: insights.slice(0, 3)
  };
}

function unavailableComparison(currentCents: number | null, reason: "NO_PREVIOUS_PERIOD" | "NO_COMPARABLE_DATA" | "INCOMPLETE_METRIC" = "NO_COMPARABLE_DATA"): ReportMetricComparison {
  return { status: "unavailable" as const, changeBps: null, currentCents: currentCents ?? 0, previousCents: null, reason };
}

function isDateWithinQueryRange(value: Date | null | undefined, dateFrom?: string, dateTo?: string) {
  if (!value) return false;
  if (!dateFrom && !dateTo) return true;
  const time = value.getTime();
  const start = dateFrom ? new Date(dateFrom + "T00:00:00+08:00").getTime() : Number.NEGATIVE_INFINITY;
  const end = dateTo ? new Date(dateTo + "T23:59:59.999+08:00").getTime() : Number.POSITIVE_INFINITY;
  return time >= start && time <= end;
}

function trendGranularityFor(dateFrom?: string, dateTo?: string): "day" | "week" | "month" {
  if (!dateFrom || !dateTo) return "month";
  const start = new Date(dateFrom + "T00:00:00+08:00").getTime();
  const end = new Date(dateTo + "T00:00:00+08:00").getTime();
  const days = Math.floor((end - start) / 86400000) + 1;
  return days <= 7 ? "day" : days <= 90 ? "week" : "month";
}

function reportPeriodKey(date: Date, granularity: "day" | "week" | "month") {
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  if (granularity === "day") return local.toISOString().slice(0, 10);
  if (granularity === "month") return local.toISOString().slice(0, 7);
  const day = local.getUTCDay() || 7;
  const monday = new Date(local);
  monday.setUTCDate(local.getUTCDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

function summarizeReportOrderCost(order: OperationalReportOrder) {
  const settlement = order.costSettlement;
  if (settlement?.status === ConstructionCostSettlementStatus.SETTLED || settlement?.status === ConstructionCostSettlementStatus.CONFIRMED) {
    return {
      materialCostCents: settlement.actualMaterialCostCents,
      constructionCostCents: settlement.actualConstructionCostCents,
      totalCostCents: settlement.actualTotalCostCents,
      grossProfitCents: settlement.actualGrossProfitCents ?? ((order.amount?.totalAmountCents ?? 0) - settlement.actualTotalCostCents),
      costSource: "实际" as const
    };
  }
  if (order.amount?.costCompleteness === CostCompleteness.COMPLETE) {
    const material = order.amount.estimatedMaterialCostCents ?? 0;
    const construction = order.amount.estimatedConstructionCostCents ?? 0;
    const total = order.amount.estimatedTotalCostCents ?? material + construction;
    return {
      materialCostCents: material,
      constructionCostCents: construction,
      totalCostCents: total,
      grossProfitCents: (order.amount.totalAmountCents ?? 0) - total,
      costSource: "标准" as const
    };
  }
  return { materialCostCents: null, constructionCostCents: null, totalCostCents: null, grossProfitCents: null, costSource: "待补齐" as const };
}

function addProjectStat(
  stats: Map<string, { dimension: "施工类型" | "产品分类"; name: string; orders: number; amountCents: number; constructionChargeCents: number }>,
  dimension: "施工类型" | "产品分类",
  name: string,
  amountCents: number,
  constructionChargeCents: number
) {
  const key = `${dimension}:${name}`;
  const current = stats.get(key) ?? { dimension, name, orders: 0, amountCents: 0, constructionChargeCents: 0 };
  current.orders += 1;
  current.amountCents += amountCents;
  current.constructionChargeCents += constructionChargeCents;
  stats.set(key, current);
}

function displayName(user: { nickname: string | null; username: string }) {
  return user.nickname ?? user.username;
}
