/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  AfterSaleResponsibility,
  AfterSaleStatus,
  ConstructionTaskStatus,
  InvoiceStatus,
  InventoryMovementType,
  PaymentRecordType,
  QualityCheckResult,
  RebateStatus,
  StorePosition
} from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { ReportQueryDto } from "./dto/reports.dto";

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

  private async withStoreMember(user: AuthenticatedReportUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

function buildReportQueryScope(actor: UserWithStoreMember, storeId: string | undefined) {
  const storeWhere = storeId ? { storeId } : {};
  const isSales = !actor.isAuditor && actor.storeMember?.position === StorePosition.SALES;
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
