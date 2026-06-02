/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InvoiceStatus, OrderStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { ApplyInvoiceDto, InvoiceActionDto, IssueInvoiceDto, ListInvoicesDto } from "./dto/invoice.dto";

export type AuthenticatedInvoiceUser = UserWithStoreMember & { username?: string };

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(user: AuthenticatedInvoiceUser, dto: ApplyInvoiceDto) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { amount: true } });
    if (!order) throw new NotFoundException("订单不存在");
    if (!PermissionPolicy.canApplyInvoice(actor, order.storeId)) throw new ForbiddenException("无权限");
    const invoiceableStatuses: OrderStatus[] = [OrderStatus.COMPLETED, OrderStatus.WARRANTIED];
    if (!invoiceableStatuses.includes(order.status)) {
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
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException("发票不存在");
    if (!PermissionPolicy.canManageInvoice(actor, invoice.storeId)) throw new ForbiddenException("无权限");
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.ISSUED, invoiceNo: dto.invoiceNo, issuedAt: new Date() }
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

  async list(user: AuthenticatedInvoiceUser, query: ListInvoicesDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) throw new ForbiddenException("无权限");
    return this.prisma.invoice.findMany({ where: { storeId: query.storeId }, orderBy: { createdAt: "desc" }, include: { logs: true } });
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
