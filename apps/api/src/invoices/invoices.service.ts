/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConstructionTaskStatus, CustomerType, InvoiceStatus, OrderStatus, Prisma } from "@prisma/client";
import { AccessContext, type AccessSubject } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyInvoiceDto, InvoiceActionDto, IssueInvoiceDto, ListInvoicesDto, SendInvoiceDto } from "./dto/invoice.dto";
import { InvoicePdfService } from "./invoice-pdf.service";

export type AuthenticatedInvoiceUser = {
  id: string;
  username?: string;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  isAuditor?: boolean;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  storeMember?: { storeId: string; position: string } | null;
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext,
    private readonly invoicePdf: InvoicePdfService = new InvoicePdfService()
  ) {}

  async apply(user: AuthenticatedInvoiceUser, dto: ApplyInvoiceDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const requestedOrderIds = [...new Set(
      dto.allocations?.map((allocation) => allocation.orderId)
        ?? dto.orderIds
        ?? (dto.orderId ? [dto.orderId] : [])
    )];
    if (requestedOrderIds.length === 0) {
      throw new BadRequestException("请至少选择一笔可开票订单");
    }

    const orders = await this.prisma.order.findMany({
      where: { id: { in: requestedOrderIds } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        amount: true,
        constructionRecord: { select: { status: true } },
        customer: { select: { customerType: true } }
      }
    });
    if (orders.length !== requestedOrderIds.length) throw new NotFoundException("部分订单不存在");
    const firstOrder = orders[0]!;
    if (orders.some((order) => order.storeId !== firstOrder.storeId || order.customerId !== firstOrder.customerId)) {
      throw new BadRequestException("合并开票仅支持同一门店、同一客户的订单");
    }
    if (orders.length > 1 && firstOrder.customer.customerType !== CustomerType.COMPANY) {
      throw new BadRequestException("多订单合并开票仅适用于企业客户");
    }

    const invoiceableStatuses: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.WARRANTIED];
    for (const order of orders) {
      if (!await this.accessContext.can(actor, "finance", "write", { storeId: order.storeId, ownerId: order.salesPersonId })) {
        throw new ForbiddenException("无权限");
      }
      const constructionCompleted = order.constructionRecord?.status === ConstructionTaskStatus.COMPLETED;
      if (!invoiceableStatuses.includes(order.status) && !constructionCompleted) {
        throw new BadRequestException(`订单 ${order.orderNo} 尚未完工，不能申请发票`);
      }
      if ((order.amount?.outstandingCents ?? 1) > 0) {
        throw new BadRequestException(`订单 ${order.orderNo} 尚未收齐，不能申请发票`);
      }
    }

    const previousInvoices = await this.prisma.invoice.findMany({
      where: {
        status: { not: InvoiceStatus.VOIDED },
        OR: [
          { orderId: { in: requestedOrderIds } },
          { allocations: { some: { orderId: { in: requestedOrderIds } } } }
        ]
      },
      select: {
        orderId: true,
        amountCents: true,
        allocations: { select: { orderId: true, amountCents: true } }
      }
    });
    const invoicedByOrder = new Map(requestedOrderIds.map((orderId) => [orderId, 0]));
    for (const invoice of previousInvoices) {
      if (invoice.allocations.length > 0) {
        for (const allocation of invoice.allocations) {
          if (invoicedByOrder.has(allocation.orderId)) {
            invoicedByOrder.set(allocation.orderId, (invoicedByOrder.get(allocation.orderId) ?? 0) + allocation.amountCents);
          }
        }
      } else if (invoice.orderId && invoicedByOrder.has(invoice.orderId)) {
        invoicedByOrder.set(invoice.orderId, (invoicedByOrder.get(invoice.orderId) ?? 0) + invoice.amountCents);
      }
    }

    const remainingByOrder = new Map(
      orders.map((order) => [
        order.id,
        Math.max(0, (order.amount?.totalAmountCents ?? 0) - (invoicedByOrder.get(order.id) ?? 0))
      ])
    );
    let allocations = dto.allocations?.map((allocation) => ({ ...allocation }));
    if (allocations) {
      if (new Set(allocations.map((allocation) => allocation.orderId)).size !== allocations.length) {
        throw new BadRequestException("同一订单不能重复分摊");
      }
      if (allocations.reduce((sum, allocation) => sum + allocation.amountCents, 0) !== dto.amountCents) {
        throw new BadRequestException("逐单分摊金额合计必须等于发票金额");
      }
    } else {
      let pendingAmount = dto.amountCents;
      allocations = [];
      for (const order of orders) {
        const amountCents = Math.min(pendingAmount, remainingByOrder.get(order.id) ?? 0);
        if (amountCents > 0) allocations.push({ orderId: order.id, amountCents });
        pendingAmount -= amountCents;
        if (pendingAmount === 0) break;
      }
      if (pendingAmount > 0) throw new BadRequestException("开票金额超过所选订单剩余可开票额度");
    }
    for (const allocation of allocations) {
      const remaining = remainingByOrder.get(allocation.orderId);
      if (remaining === undefined) throw new BadRequestException("分摊订单不在本次选择范围内");
      if (allocation.amountCents > remaining) {
        throw new BadRequestException("逐单分摊金额超过订单剩余可开票额度");
      }
    }

    return this.prisma.invoice.create({
      data: {
        storeId: firstOrder.storeId,
        customerId: firstOrder.customerId,
        orderId: allocations[0]!.orderId,
        title: dto.title,
        taxNo: dto.taxNo,
        amountCents: dto.amountCents,
        appliedById: actor.userId,
        allocations: { create: allocations },
        logs: {
          create: {
            status: InvoiceStatus.APPLIED,
            note: `发票申请（合并 ${allocations.length} 笔订单）`,
            createdById: actor.userId
          }
        }
      },
      include: { allocations: true }
    });
  }

  async issue(user: AuthenticatedInvoiceUser, id: string, dto: IssueInvoiceDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { order: { select: { orderNo: true } } }
    });
    if (!invoice) throw new NotFoundException("发票不存在");
    if (!await this.accessContext.can(actor, "finance", "write", { storeId: invoice.storeId })) throw new ForbiddenException("无权限");
    const fileUrl = dto.fileUrl ?? (await this.invoicePdf.generate(invoice, dto.invoiceNo));
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.ISSUED, invoiceNo: dto.invoiceNo, fileUrl, issuedAt: new Date() }
    });
    await this.prisma.invoiceLog.create({
      data: { invoiceId: id, status: InvoiceStatus.ISSUED, note: dto.note, createdById: actor.userId }
    });
    return updated;
  }

  async void(user: AuthenticatedInvoiceUser, id: string, dto: InvoiceActionDto) {
    return this.transition(user, id, InvoiceStatus.VOIDED, dto.note);
  }

  async reissue(user: AuthenticatedInvoiceUser, id: string, dto: IssueInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { allocations: { select: { orderId: true, amountCents: true } } }
    });
    if (!invoice) throw new NotFoundException("发票不存在");
    if (invoice.status !== InvoiceStatus.VOIDED) {
      throw new BadRequestException("仅作废发票可以重新开具；如需新开票请重新提交申请");
    }
    const updated = await this.issue(user, id, dto);
    return this.prisma.invoice.update({ where: { id: updated.id }, data: { status: InvoiceStatus.REISSUED } });
  }

  async send(user: AuthenticatedInvoiceUser, id: string, dto: SendInvoiceDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("发票不存在");
    if (!await this.accessContext.can(actor, "finance", "write", { storeId: invoice.storeId })) throw new ForbiddenException("无权限");
    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.REISSUED) {
      throw new BadRequestException("已开具或已重开发票才能发送");
    }
    if (!invoice.fileUrl) {
      throw new BadRequestException("发票缺少电子文件，不能发送");
    }
    await this.prisma.invoiceLog.create({
      data: {
        invoiceId: id,
        status: invoice.status,
        note: buildSendInvoiceNote(dto),
        createdById: actor.userId
      }
    });
    return invoice;
  }

  async list(user: AuthenticatedInvoiceUser, query: ListInvoicesDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const scope = await this.accessContext.scope(actor, "finance.document", "read", { storeId: query.storeId, ownerId: actor.userId });
    if (!scope.allowed) throw new ForbiddenException({ code: scope.reason ?? "ACCESS_DENIED", message: "无权限" });
    const where = buildInvoiceListScope(query.storeId, scope.ownerId);
    return this.prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        logs: true,
        order: {
          select: {
            orderNo: true,
            status: true,
            amount: { select: { paidAmountCents: true, outstandingCents: true } },
            customer: { select: { name: true, companyName: true, contactPerson: true } },
            vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
          }
        },
        allocations: {
          orderBy: { createdAt: "asc" },
          include: {
            order: {
              select: {
                orderNo: true,
                status: true,
                amount: { select: { paidAmountCents: true, outstandingCents: true } },
                customer: { select: { name: true, companyName: true, contactPerson: true } },
                vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
              }
            }
          }
        }
      }
    });
  }

  private async transition(user: AuthenticatedInvoiceUser, id: string, status: InvoiceStatus, note?: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("发票不存在");
    if (!await this.accessContext.can(actor, "finance", "write", { storeId: invoice.storeId })) throw new ForbiddenException("无权限");
    const updated = await this.prisma.invoice.update({ where: { id }, data: { status } });
    await this.prisma.invoiceLog.create({ data: { invoiceId: id, status, note, createdById: actor.userId } });
    return updated;
  }

}

export function buildInvoiceListScope(storeId: string, salesPersonId?: string): Prisma.InvoiceWhereInput {
  const where: Prisma.InvoiceWhereInput = { storeId };
  if (salesPersonId) {
    where.OR = [
      { order: { salesPersonId } },
      { allocations: { some: { order: { salesPersonId } } } }
    ];
  }
  return where;
}

function buildSendInvoiceNote(dto: SendInvoiceDto) {
  return ["发票发送", `渠道：${dto.channel}`, `接收人：${dto.recipient}`, dto.note].filter(Boolean).join("；");
}

