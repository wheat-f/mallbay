/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConstructionTaskStatus, InvoiceStatus, OrderStatus, StorePosition } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyInvoiceDto, InvoiceActionDto, IssueInvoiceDto, ListInvoicesDto, SendInvoiceDto } from "./dto/invoice.dto";
import { InvoicePdfService } from "./invoice-pdf.service";

export type AuthenticatedInvoiceUser = UserWithStoreMember & { username?: string };

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicePdf: InvoicePdfService = new InvoicePdfService()
  ) {}

  async apply(user: AuthenticatedInvoiceUser, dto: ApplyInvoiceDto) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { amount: true, constructionRecord: { select: { status: true } } }
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (!PermissionPolicy.canApplyInvoiceForOrder(actor, order.storeId, order.salesPersonId)) {
      throw new ForbiddenException("无权限");
    }
    const invoiceableStatuses: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.WARRANTIED];
    const constructionCompleted = order.constructionRecord?.status === ConstructionTaskStatus.COMPLETED;
    if (!invoiceableStatuses.includes(order.status) && !constructionCompleted) {
      throw new BadRequestException("已完工订单才能申请发票");
    }
    if ((order.amount?.outstandingCents ?? 1) > 0) {
      throw new BadRequestException("订单未收齐，不能申请发票");
    }
    const invoice = await this.prisma.invoice.create({
      data: {
        storeId: order.storeId,
        orderId: order.id,
        title: dto.title,
        taxNo: dto.taxNo,
        amountCents: dto.amountCents,
        appliedById: actor.id,
        logs: { create: { status: InvoiceStatus.APPLIED, note: "发票申请", createdById: actor.id } }
      }
    });
    return invoice;
  }

  async issue(user: AuthenticatedInvoiceUser, id: string, dto: IssueInvoiceDto) {
    const actor = await this.withStoreMember(user);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { order: { select: { orderNo: true } } }
    });
    if (!invoice) throw new NotFoundException("发票不存在");
    if (!PermissionPolicy.canManageInvoice(actor, invoice.storeId)) throw new ForbiddenException("无权限");
    const fileUrl = dto.fileUrl ?? (await this.invoicePdf.generate(invoice, dto.invoiceNo));
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.ISSUED, invoiceNo: dto.invoiceNo, fileUrl, issuedAt: new Date() }
    });
    await this.prisma.invoiceLog.create({
      data: { invoiceId: id, status: InvoiceStatus.ISSUED, note: dto.note, createdById: actor.id }
    });
    return updated;
  }

  async void(user: AuthenticatedInvoiceUser, id: string, dto: InvoiceActionDto) {
    return this.transition(user, id, InvoiceStatus.VOIDED, dto.note);
  }

  async reissue(user: AuthenticatedInvoiceUser, id: string, dto: IssueInvoiceDto) {
    const updated = await this.issue(user, id, dto);
    return this.prisma.invoice.update({ where: { id: updated.id }, data: { status: InvoiceStatus.REISSUED } });
  }

  async send(user: AuthenticatedInvoiceUser, id: string, dto: SendInvoiceDto) {
    const actor = await this.withStoreMember(user);
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("发票不存在");
    if (!PermissionPolicy.canManageInvoice(actor, invoice.storeId)) throw new ForbiddenException("无权限");
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
        createdById: actor.id
      }
    });
    return invoice;
  }

  async list(user: AuthenticatedInvoiceUser, query: ListInvoicesDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) throw new ForbiddenException("无权限");
    const where = buildInvoiceListScope(actor, query.storeId);
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
        }
      }
    });
  }

  private async transition(user: AuthenticatedInvoiceUser, id: string, status: InvoiceStatus, note?: string) {
    const actor = await this.withStoreMember(user);
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("发票不存在");
    if (!PermissionPolicy.canManageInvoice(actor, invoice.storeId)) throw new ForbiddenException("无权限");
    const updated = await this.prisma.invoice.update({ where: { id }, data: { status } });
    await this.prisma.invoiceLog.create({ data: { invoiceId: id, status, note, createdById: actor.id } });
    return updated;
  }

  private async withStoreMember(user: AuthenticatedInvoiceUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

function buildInvoiceListScope(actor: UserWithStoreMember, storeId: string) {
  const where: { storeId: string; order?: { salesPersonId: string } } = { storeId };
  if (!actor.isAuditor && actor.storeMember?.position === StorePosition.SALES) {
    where.order = { salesPersonId: actor.id };
  }
  return where;
}

function buildSendInvoiceNote(dto: SendInvoiceDto) {
  return ["发票发送", `渠道：${dto.channel}`, `接收人：${dto.recipient}`, dto.note].filter(Boolean).join("；");
}
