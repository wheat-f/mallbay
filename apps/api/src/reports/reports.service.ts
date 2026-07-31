/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Injectable } from "@nestjs/common";
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
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { OperationalReportQueryDto, ReportQueryDto } from "./dto/reports.dto";

export type AuthenticatedReportUser = UserWithStoreMember & { username?: string };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: AuthenticatedReportUser, query: ReportQueryDto) {
    const actor = await this.withStoreMember(user);
    const storeId = query.storeId ?? actor.storeMember?.storeId;
    if (!storeId && !PermissionPolicy.isAdmin(actor)) {
      throw new ForbiddenException("无权限");
    }
    if (storeId && !PermissionPolicy.canViewReports(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }
    const scope = buildReportQueryScope(actor, storeId);
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
    const actor = await this.withStoreMember(user);
    const storeId = query.storeId ?? actor.storeMember?.storeId;
    this.assertCanViewOperationalReports(actor, storeId);

    const dateRange = reportDateRange(query.dateFrom, query.dateTo);
    const isSales = PermissionPolicy.hasRuntimeSnapshot(actor.id) ? Boolean(PermissionPolicy.hasRuntimeRole(actor, ["SALES"], storeId)) : !actor.isAuditor && actor.storeMember?.position === StorePosition.SALES;
    const salesPersonId = isSales ? actor.id : query.salesPersonId;
    const orderWhere = buildOperationalOrderWhere(storeId, query, dateRange, salesPersonId);
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
    const paymentWhere: Prisma.OrderPaymentWhereInput = {
      paidAt: dateRange,
      order: {
        ...(storeId ? { storeId } : {}),
        ...(salesPersonId ? { salesPersonId } : {})
      }
    };
    const payments = await this.prisma.orderPayment.findMany({
      where: paymentWhere,
      select: { amountCents: true, order: { select: { salesPersonId: true } } }
    });
    const afterSaleWhere: Prisma.AfterSaleWhereInput = {
      ...(storeId ? { storeId } : {}),
      createdAt: dateRange,
      ...(salesPersonId ? { order: { salesPersonId } } : {}),
      ...(query.workerUserId ? { assignments: { some: { workerUserId: query.workerUserId } } } : {})
    };
    const afterSales = await this.prisma.afterSale.findMany({
      where: afterSaleWhere,
      include: {
        assignments: { include: { worker: { select: { id: true, nickname: true, username: true } } } },
        costEntries: { where: { status: "CONFIRMED" }, select: { category: true, direction: true, amountCents: true } }
      }
    });

    return buildOperationalReport({ orders, payments, afterSales, dateBasis: query.dateBasis ?? "DEFAULT" });
  }

  /** Returns only real active store members and values found in store data. */
  async filterOptions(user: AuthenticatedReportUser, query: ReportQueryDto) {
    const actor = await this.withStoreMember(user);
    const storeId = query.storeId ?? actor.storeMember?.storeId;
    this.assertCanViewOperationalReports(actor, storeId);
    if (!storeId) {
      return { salesPeople: [], constructionPeople: [], constructionTypes: [], productCategories: [], orderStatuses: [] };
    }
    const isSales = PermissionPolicy.hasRuntimeSnapshot(actor.id) ? Boolean(PermissionPolicy.hasRuntimeRole(actor, ["SALES"], storeId)) : !actor.isAuditor && actor.storeMember?.position === StorePosition.SALES;
    const [members, constructionTypes, productCategories, orderStatuses] = await Promise.all([
      this.prisma.storeMember.findMany({
        where: {
          storeId,
          ...(isSales ? { userId: actor.id } : {}),
          position: { in: [StorePosition.MANAGER, StorePosition.SALES, StorePosition.CONSTRUCTION, StorePosition.APPRENTICE] }
        },
        include: { user: { select: { id: true, nickname: true, username: true } } },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.order.findMany({ where: { storeId }, distinct: ["constructionType"], select: { constructionType: true } }),
      this.prisma.product.findMany({ where: { storeId }, distinct: ["category"], select: { category: true } }),
      this.prisma.order.findMany({ where: { storeId }, distinct: ["status"], select: { status: true } })
    ]);
    const people = members.map((member) => ({ id: member.user.id, name: member.user.nickname ?? member.user.username, position: member.position }));
    return {
      salesPeople: people.filter((person) => person.position === StorePosition.SALES || person.position === StorePosition.MANAGER),
      constructionPeople: people.filter((person) => person.position === StorePosition.CONSTRUCTION || person.position === StorePosition.APPRENTICE),
      constructionTypes: constructionTypes.map((item) => item.constructionType),
      productCategories: productCategories.map((item) => item.category),
      orderStatuses: orderStatuses.map((item) => item.status)
    };
  }

  private async withStoreMember(user: AuthenticatedReportUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private assertCanViewOperationalReports(actor: UserWithStoreMember, storeId: string | undefined) {
    if (!storeId && !PermissionPolicy.isAdmin(actor)) throw new ForbiddenException("无权限");
    if (storeId && !PermissionPolicy.canViewReports(actor, storeId)) throw new ForbiddenException("无权限");
  }
}

function buildReportQueryScope(actor: UserWithStoreMember, storeId: string | undefined) {
  const storeWhere = storeId ? { storeId } : {};
  const isSales = PermissionPolicy.hasRuntimeSnapshot(actor.id) ? Boolean(PermissionPolicy.hasRuntimeRole(actor, ["SALES"], storeId)) : !actor.isAuditor && actor.storeMember?.position === StorePosition.SALES;
  if (!isSales) {
    return {
      orderWhere: storeWhere,
      orderAmountWhere: storeId ? { order: { storeId } } : {},
      invoiceWhere: storeWhere,
      rebateWhere: storeWhere,
      salesCommissionWhere: storeWhere,
      operationalWhere: storeWhere
    };
  }

  return {
    orderWhere: { storeId, salesPersonId: actor.id },
    orderAmountWhere: { order: { storeId, salesPersonId: actor.id } },
    invoiceWhere: { storeId, order: { salesPersonId: actor.id } },
    rebateWhere: { storeId, order: { salesPersonId: actor.id } },
    salesCommissionWhere: { storeId, salesUserId: actor.id },
    operationalWhere: { storeId, id: "__mallbay_sales_report_no_access__" }
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
    workerLines: Array<{ workerUserId: string; confirmedMinutes: number; manualConstructionChargeCents: number | null }>;
  } | null;
  workerCommissions: Array<{ workerUserId: string; amountCents: number; finalAmountCents: number }>;
  salesCommissionLog: { amountCents: number } | null;
};

type OperationalPayment = { amountCents: number; order: { salesPersonId: string } };
type OperationalAfterSale = {
  id: string;
  status: AfterSaleStatus;
  responsibility: AfterSaleResponsibility;
  assignments: Array<{ workerUserId: string; worker: { id: string; nickname: string | null; username: string } }>;
  costEntries: Array<{ category: string; direction: string; amountCents: number }>;
};

function reportDateRange(dateFrom?: string, dateTo?: string): Prisma.DateTimeFilter | undefined {
  if (!dateFrom && !dateTo) return undefined;
  const range: Prisma.DateTimeFilter = {};
  if (dateFrom) range.gte = new Date(`${dateFrom}T00:00:00.000`);
  if (dateTo) range.lte = new Date(`${dateTo}T23:59:59.999`);
  return range;
}

function buildOperationalOrderWhere(
  storeId: string | undefined,
  query: OperationalReportQueryDto,
  dateRange: Prisma.DateTimeFilter | undefined,
  salesPersonId?: string
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
    ...(storeId ? { storeId } : {}),
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
}) {
  const sales = new Map<string, {
    userId: string; name: string; orders: number; amountCents: number; receivedCents: number;
    costCents: number; grossProfitCents: number; accruedCommissionCents: number;
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
    amountCents: number; receivedCents: number; materialCostCents: number; constructionCostCents: number;
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
    salesRow.grossProfitCents += cost.grossProfitCents ?? 0;
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
      materialCostCents: cost.materialCostCents ?? 0,
      constructionCostCents: cost.constructionCostCents ?? 0,
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
  return {
    dateBasis: input.dateBasis,
    salesPeople: [...sales.values()].sort((a, b) => b.amountCents - a.amountCents),
    constructionWorkers: [...workers.values()].sort((a, b) => b.allocatedConstructionChargeCents - a.allocatedConstructionChargeCents),
    financeOrders,
    projectStats: [...projectStats.values()].sort((a, b) => b.amountCents - a.amountCents),
    afterSaleWorkers: [...afterSaleWorkers.values()].sort((a, b) => b.afterSales - a.afterSales),
    afterSaleBreakdown: [...afterSaleBreakdown.values()].sort((a, b) => b.afterSales - a.afterSales)
  };
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
