import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { CapacityReservationStatus, Prisma, PricingApprovalStatus, PricingApprovalType, SalesQuoteStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { multiplyMoneyCents } from "../pricing/domain/money";
import { CapacityReservationService } from "../construction/capacity-reservation.service";
import { ConstructionLocation, ConstructionType } from "@prisma/client";
import { evaluatePricingGuard, type PricingCalculationResult, type PricingProtectionPolicy } from "../pricing/domain/pricing-engine";
import type { PricingAuthenticatedUser } from "../pricing/pricing.service";
import { CreateSalesQuoteDto, ListSalesQuotesDto, RecalculateSalesQuoteDto, ReviewSalesQuoteDto, SubmitSalesQuoteDto, WithdrawSalesQuoteDto } from "./dto/sales-quote.dto";
import { CreateOrderUseCase } from "../orders/use-cases/create-order.use-case";
import { AuditLogService } from "../observability/audit-log.service";
import type { AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";

@Injectable()
export class SalesQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacityReservations: CapacityReservationService,
    private readonly createOrderUseCase: CreateOrderUseCase,
    @Optional() private readonly audit?: AuditLogService
  ) {}

  async create(user: PricingAuthenticatedUser, dto: CreateSalesQuoteDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canCreateOrder(actor, dto.storeId)) throw new ForbiddenException("无权限");
    if (dto.appointmentDate && !dto.appointmentTimeSlot) throw new BadRequestException("预约时段不能为空");
    if (!dto.appointmentDate && dto.appointmentTimeSlot) throw new BadRequestException("预约日期不能为空");
    if (dto.constructionLocation === ConstructionLocation.OUTSIDE && !dto.constructionAddress?.trim()) {
      throw new BadRequestException("外出地址不能为空");
    }

    const snapshot = await this.prisma.pricingCalculation.findFirst({
      where: { id: dto.pricingCalculationId, storeId: dto.storeId },
      include: { ruleSet: { include: { protectionPolicy: true } } }
    });
    if (!snapshot) throw new BadRequestException("价格试算快照不存在");
    const output = snapshot.outputSnapshot as unknown as {
      calculation: PricingCalculationResult;
      protectionPolicy?: PricingProtectionPolicy | null;
    };
    const pricingInputSnapshot = snapshot.inputSnapshot as unknown as { vehicleClassCode?: string };
    const vehicleClassSnapshot = pricingInputSnapshot.vehicleClassCode
      ? await this.prisma.vehiclePriceClass.findFirst({ where: { storeId: dto.storeId, code: pricingInputSnapshot.vehicleClassCode }, select: { id: true, code: true, name: true } })
      : null;
    if (!output.calculation || !output.protectionPolicy) throw new BadRequestException("价格试算快照不完整");
    if (output.calculation.lines.length !== dto.items.length) throw new BadRequestException("报价产品行与试算快照不一致");

    const customer = await this.prisma.customer.findFirst({ where: { id: dto.customerId, storeId: dto.storeId } });
    if (!customer) throw new NotFoundException("客户不存在");
    if (dto.vehicleId) {
      const vehicle = await this.prisma.customerVehicle.findFirst({ where: { id: dto.vehicleId, customerId: dto.customerId } });
      if (!vehicle) throw new BadRequestException("车辆不属于该客户");
    }

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({ where: { id: { in: productIds }, storeId: dto.storeId } });
    if (products.length !== new Set(productIds).size) throw new BadRequestException("报价包含不存在的产品");
    const productsById = new Map(products.map((product) => [product.id, product]));
    const finalLines = dto.items.map((item, index) => {
      const line = output.calculation.lines[index];
      if (!line || line.productId !== item.productId || line.quantity <= 0) {
        throw new BadRequestException("报价产品或数量已变化，请重新试算");
      }
      return { id: line.id, unitPriceCents: item.finalUnitPriceCents };
    });
    const guard = evaluatePricingGuard(
      output.calculation,
      { lines: finalLines, laborCostCents: dto.finalLaborCostCents, estimatedCostCents: dto.estimatedCostCents },
      output.protectionPolicy
    );
    if (guard.decision === "BLOCKED") throw new BadRequestException("成交价低于保护范围，不能提交报价");
    if (guard.decision === "NORMAL") throw new BadRequestException("当前成交价无需报价审批，可直接生成正式订单");
    if (!dto.adjustmentReasonCode?.trim() && !dto.adjustmentReasonText?.trim()) {
      throw new BadRequestException("提交报价审批必须填写改价原因");
    }

    const submitForApproval = dto.submitForApproval !== false;
    const finalProductAmountCents = dto.items.reduce((sum, item, index) => sum + multiplyMoneyCents(item.finalUnitPriceCents, output.calculation.lines[index].quantity), 0);
    const marginCheck = guard.checks.find((check) => check.scope === "MARGIN");
    const approvalType = marginCheck?.decision === "APPROVAL_REQUIRED" ? PricingApprovalType.MARGIN : PricingApprovalType.DEVIATION;
    const validUntil = new Date(Date.now() + (dto.validHours ?? output.protectionPolicy.softHoldHours ?? 24) * 60 * 60 * 1000);
    const quote = await this.prisma.salesQuote.create({
      data: {
        storeId: dto.storeId,
        quoteNo: createQuoteNo(),
        customerId: dto.customerId,
        vehicleId: dto.vehicleId,
        salesPersonId: actor.id,
        pricingCalculationId: snapshot.id,
        status: submitForApproval ? SalesQuoteStatus.PENDING_APPROVAL : SalesQuoteStatus.DRAFT,
        vehicleClassSnapshot: vehicleClassSnapshot as Prisma.InputJsonValue,
        suggestedProductAmountCents: output.calculation.suggestedProductAmountCents,
        suggestedLaborCostCents: output.calculation.suggestedLaborCostCents,
        suggestedTotalCents: output.calculation.suggestedTotalCents,
        finalProductAmountCents,
        finalLaborCostCents: dto.finalLaborCostCents,
        finalTotalCents: finalProductAmountCents + dto.finalLaborCostCents,
        estimatedCostCents: dto.estimatedCostCents,
        estimatedMarginBps: marginCheck?.marginBps,
        adjustmentReasonCode: dto.adjustmentReasonCode,
        adjustmentReasonText: dto.adjustmentReasonText,
        validUntil,
        appointmentDate: dto.appointmentDate ? new Date(dto.appointmentDate) : undefined,
        appointmentTimeSlot: dto.appointmentTimeSlot?.trim() || undefined,
        constructionAddress: dto.constructionAddress?.trim() || undefined,
        items: {
          create: dto.items.map((item, index) => {
            const product = productsById.get(item.productId)!;
            const line = output.calculation.lines[index];
            return {
              productId: product.id,
              productSnapshot: {
                id: product.id,
                brand: product.brand,
                name: product.name,
                model: product.model,
                category: product.category,
                specification: product.specification,
                salesUnit: product.salesUnit,
                basePriceCents: product.basePriceCents
              } as Prisma.InputJsonValue,
              quantity: line.quantity,
              salesUnit: product.salesUnit,
              basePriceCents: product.basePriceCents,
              suggestedUnitPriceCents: line.suggestedUnitPriceCents,
              finalUnitPriceCents: item.finalUnitPriceCents,
              suggestedAmountCents: line.suggestedAmountCents,
              finalAmountCents: multiplyMoneyCents(item.finalUnitPriceCents, line.quantity),
              minimumPriceCents: line.minimumPriceCents,
              calculationSnapshot: line as unknown as Prisma.InputJsonValue
            };
          })
        },
        ...(submitForApproval ? { approvals: { create: { approvalType, submittedById: actor.id } } } : {})
      },
      include: { items: true, approvals: true }
    });
    if (submitForApproval) {
      try {
        await this.capacityReservations.holdQuote({
          storeId: dto.storeId,
          quoteId: quote.id,
          appointmentDate: dto.appointmentDate,
          constructionLocation: dto.constructionLocation,
          constructionType: dto.constructionType,
          expiresAt: validUntil
        });
      } catch (error) {
        await this.prisma.salesQuote.delete({ where: { id: quote.id } });
        throw error;
      }
    }
    await this.recordAudit({ action: submitForApproval ? "sales_quote_submitted" : "sales_quote_draft_created", actorId: actor.id, targetType: "SalesQuote", targetId: quote.id, metadata: { storeId: dto.storeId, quoteNo: quote.quoteNo, approvalType } });
    return quote;
  }

  async list(user: PricingAuthenticatedUser, dto: ListSalesQuotesDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, dto.storeId)) throw new ForbiddenException("无权限");
    const where = {
      storeId: dto.storeId,
      ...(PermissionPolicy.isStoreManager(actor, dto.storeId) ? {} : { salesPersonId: actor.id })
    };
    return this.prisma.salesQuote.findMany({ where, orderBy: { createdAt: "desc" }, include: { approvals: true, items: true } });
  }

  async get(user: PricingAuthenticatedUser, id: string, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, storeId)) throw new ForbiddenException("无权限");
    const quote = await this.prisma.salesQuote.findFirst({
      where: {
        id,
        storeId,
        ...(PermissionPolicy.isStoreManager(actor, storeId) ? {} : { salesPersonId: actor.id })
      },
      include: {
        items: true,
        approvals: { orderBy: { submittedAt: "desc" } },
        capacityReservation: true,
        customer: { select: { id: true, name: true } },
        vehicle: true,
        salesPerson: { select: { id: true, username: true, nickname: true } },
        convertedOrder: { select: { id: true, orderNo: true } },
        pricingCalculation: { select: { ruleSetVersion: true, inputHash: true, outputSnapshot: true } }
      }
    });
    if (!quote) throw new NotFoundException("报价单不存在");
    return quote;
  }

  async submit(user: PricingAuthenticatedUser, id: string, dto: SubmitSalesQuoteDto) {
    const actor = await this.withStoreMember(user);
    const quote = await this.prisma.salesQuote.findFirst({
      where: { id, storeId: dto.storeId },
      include: {
        items: true,
        approvals: { where: { status: PricingApprovalStatus.PENDING } },
        pricingCalculation: { select: { inputSnapshot: true, outputSnapshot: true } }
      }
    });
    if (!quote) throw new NotFoundException("报价单不存在");
    if (!PermissionPolicy.canViewStoreData(actor, dto.storeId) || (quote.salesPersonId !== actor.id && !PermissionPolicy.isStoreManager(actor, dto.storeId))) {
      throw new ForbiddenException("无权限提交该报价");
    }
    if (quote.status === SalesQuoteStatus.PENDING_APPROVAL) return this.get(user, id, dto.storeId);
    if (quote.status !== SalesQuoteStatus.DRAFT) throw new BadRequestException("只有草稿报价可以提交审批");
    const output = quote.pricingCalculation.outputSnapshot as unknown as { calculation: PricingCalculationResult; protectionPolicy?: PricingProtectionPolicy | null };
    const input = quote.pricingCalculation.inputSnapshot as unknown as { constructionType: ConstructionType; constructionLocation: ConstructionLocation };
    if (!output.calculation || !output.protectionPolicy || !input.constructionType || !input.constructionLocation) {
      throw new BadRequestException("报价单价格或施工快照不完整");
    }
    const guard = evaluatePricingGuard(output.calculation, {
      lines: quote.items.map((item, index) => ({ id: output.calculation.lines[index]?.id ?? item.id, unitPriceCents: item.finalUnitPriceCents })),
      laborCostCents: quote.finalLaborCostCents,
      estimatedCostCents: quote.estimatedCostCents ?? undefined
    }, output.protectionPolicy);
    if (guard.decision === "BLOCKED") throw new BadRequestException("成交价低于保护范围，不能提交报价");
    if (guard.decision === "NORMAL") throw new BadRequestException("当前成交价无需报价审批，可直接生成正式订单");
    const marginCheck = guard.checks.find((check) => check.scope === "MARGIN");
    const approvalType = marginCheck?.decision === "APPROVAL_REQUIRED" ? PricingApprovalType.MARGIN : PricingApprovalType.DEVIATION;
    const validUntil = new Date(Date.now() + (output.protectionPolicy.softHoldHours ?? 24) * 60 * 60 * 1000);
    await this.capacityReservations.holdQuote({
      storeId: dto.storeId,
      quoteId: quote.id,
      appointmentDate: quote.appointmentDate?.toISOString(),
      constructionLocation: input.constructionLocation,
      constructionType: input.constructionType,
      expiresAt: validUntil
    });
    try {
      const submitted = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.salesQuote.updateMany({
          where: { id, storeId: dto.storeId, status: SalesQuoteStatus.DRAFT },
          data: { status: SalesQuoteStatus.PENDING_APPROVAL, validUntil }
        });
        if (claimed.count !== 1) throw new BadRequestException("报价单已被其他操作处理");
        await tx.pricingApproval.create({ data: { quoteId: id, approvalType, submittedById: actor.id } });
        return tx.salesQuote.findUnique({ where: { id }, include: { items: true, approvals: true, capacityReservation: true } });
      });
      await this.recordAudit({ action: "sales_quote_submitted", actorId: actor.id, targetType: "SalesQuote", targetId: id, metadata: { storeId: dto.storeId, quoteNo: quote.quoteNo, approvalType } });
      return submitted;
    } catch (error) {
      await this.capacityReservations.releaseQuote(id, "SUBMIT_FAILED");
      throw error;
    }
  }

  async expirePending(now = new Date()) {
    const expired = await this.prisma.salesQuote.findMany({
      where: { status: SalesQuoteStatus.PENDING_APPROVAL, validUntil: { lte: now } },
      select: { id: true }
    });
    for (const quote of expired) {
      const claimed = await this.prisma.salesQuote.updateMany({
        where: { id: quote.id, status: SalesQuoteStatus.PENDING_APPROVAL },
        data: { status: SalesQuoteStatus.EXPIRED }
      });
      if (claimed.count === 1) {
        await this.capacityReservations.releaseQuote(quote.id, "EXPIRED", CapacityReservationStatus.EXPIRED);
        await this.recordAudit({ action: "sales_quote_expired", targetType: "SalesQuote", targetId: quote.id });
      }
    }
    return expired.length;
  }

  async review(user: PricingAuthenticatedUser, id: string, approve: boolean, dto: ReviewSalesQuoteDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.isStoreManager(actor, dto.storeId)) throw new ForbiddenException("只有店长可以审批报价");
    const quote = await this.prisma.salesQuote.findFirst({ where: { id, storeId: dto.storeId }, include: { approvals: { where: { status: PricingApprovalStatus.PENDING }, orderBy: { submittedAt: "desc" }, take: 1 } } });
    if (!quote) throw new NotFoundException("报价单不存在");
    if (quote.status !== SalesQuoteStatus.PENDING_APPROVAL || quote.validUntil <= new Date()) throw new BadRequestException("报价单不在可审批状态");
    const approval = quote.approvals[0];
    if (!approval) throw new BadRequestException("报价单缺少待审批记录");
    const status = approve ? SalesQuoteStatus.APPROVED : SalesQuoteStatus.REJECTED;
    const reviewed = await this.prisma.$transaction(async (tx) => {
      const claimedApproval = await tx.pricingApproval.updateMany({
        where: { id: approval.id, status: PricingApprovalStatus.PENDING },
        data: {
          status: approve ? PricingApprovalStatus.APPROVED : PricingApprovalStatus.REJECTED,
          reviewedById: actor.id,
          reviewNote: dto.reviewNote?.trim() || undefined,
          reviewedAt: new Date()
        }
      });
      if (claimedApproval.count !== 1) throw new BadRequestException("报价审批已被其他操作处理");
      const claimedQuote = await tx.salesQuote.updateMany({
        where: { id, storeId: dto.storeId, status: SalesQuoteStatus.PENDING_APPROVAL },
        data: { status, approvedAt: approve ? new Date() : undefined }
      });
      if (claimedQuote.count !== 1) throw new BadRequestException("报价单已被其他操作处理");
      return tx.salesQuote.findUnique({ where: { id }, include: { items: true, approvals: true } });
    });
    if (approve) await this.capacityReservations.confirmQuote(id);
    else await this.capacityReservations.releaseQuote(id, "APPROVED_REJECTED");
    await this.recordAudit({ action: approve ? "sales_quote_approved" : "sales_quote_rejected", actorId: actor.id, targetType: "SalesQuote", targetId: id, metadata: { storeId: dto.storeId, reviewNote: dto.reviewNote?.trim() || undefined } });
    return reviewed;
  }

  async withdraw(user: PricingAuthenticatedUser, id: string, dto: WithdrawSalesQuoteDto) {
    const actor = await this.withStoreMember(user);
    const quote = await this.prisma.salesQuote.findFirst({ where: { id, storeId: dto.storeId }, include: { capacityReservation: true } });
    if (!quote) throw new NotFoundException("报价单不存在");
    if (!PermissionPolicy.canViewStoreData(actor, dto.storeId) || (quote.salesPersonId !== actor.id && !PermissionPolicy.isStoreManager(actor, dto.storeId))) {
      throw new ForbiddenException("无权限撤回该报价");
    }
    const withdrawableStatuses: SalesQuoteStatus[] = [SalesQuoteStatus.DRAFT, SalesQuoteStatus.PENDING_APPROVAL];
    if (!withdrawableStatuses.includes(quote.status)) {
      throw new BadRequestException("当前报价状态不允许撤回");
    }
    const updated = await this.prisma.salesQuote.updateMany({
      where: { id, storeId: dto.storeId, status: { in: [SalesQuoteStatus.DRAFT, SalesQuoteStatus.PENDING_APPROVAL] } },
      data: { status: SalesQuoteStatus.WITHDRAWN }
    });
    if (updated.count !== 1) throw new BadRequestException("报价单已被其他操作处理");
    await this.capacityReservations.releaseQuote(id, dto.reason?.trim() || "WITHDRAWN");
    await this.recordAudit({ action: "sales_quote_withdrawn", actorId: actor.id, targetType: "SalesQuote", targetId: id, metadata: { storeId: dto.storeId, reason: dto.reason?.trim() || "WITHDRAWN" } });
    return this.prisma.salesQuote.findUnique({ where: { id }, include: { items: true, approvals: true } });
  }

  async recalculate(user: PricingAuthenticatedUser, id: string, dto: RecalculateSalesQuoteDto) {
    const actor = await this.withStoreMember(user);
    const quote = await this.prisma.salesQuote.findFirst({ where: { id, storeId: dto.storeId }, include: { capacityReservation: true } });
    if (!quote) throw new NotFoundException("报价单不存在");
    if (!PermissionPolicy.canViewStoreData(actor, dto.storeId) || (quote.salesPersonId !== actor.id && !PermissionPolicy.isStoreManager(actor, dto.storeId))) {
      throw new ForbiddenException("无权限重算该报价");
    }
    const recalculableStatuses: SalesQuoteStatus[] = [SalesQuoteStatus.PENDING_APPROVAL, SalesQuoteStatus.REJECTED, SalesQuoteStatus.EXPIRED, SalesQuoteStatus.WITHDRAWN];
    if (!recalculableStatuses.includes(quote.status)) {
      throw new BadRequestException("当前报价状态不允许重算");
    }
    const input = await this.prisma.pricingCalculation.findUnique({ where: { id: quote.pricingCalculationId }, select: { inputSnapshot: true } });
    const pricingInput = input?.inputSnapshot as unknown as { constructionType: ConstructionType; constructionLocation: ConstructionLocation } | undefined;
    if (!pricingInput) throw new BadRequestException("报价单缺少施工条件快照");

    // A recalculation creates a new immutable quote version. The previous quote
    // remains as a withdrawn audit record and its capacity hold is released first.
    if (quote.status === SalesQuoteStatus.PENDING_APPROVAL) {
      await this.withdraw(user, id, { storeId: dto.storeId, reason: "RECALCULATED" });
    }
    const next = await this.create(user, {
      storeId: dto.storeId,
      customerId: quote.customerId,
      vehicleId: quote.vehicleId ?? undefined,
      appointmentDate: quote.appointmentDate?.toISOString(),
      appointmentTimeSlot: quote.appointmentTimeSlot ?? undefined,
      constructionAddress: quote.constructionAddress ?? undefined,
      constructionType: pricingInput.constructionType,
      constructionLocation: pricingInput.constructionLocation,
      pricingCalculationId: dto.pricingCalculationId,
      items: dto.items,
      finalLaborCostCents: dto.finalLaborCostCents,
      estimatedCostCents: dto.estimatedCostCents,
      adjustmentReasonCode: dto.adjustmentReasonCode,
      adjustmentReasonText: dto.adjustmentReasonText,
      validHours: dto.validHours
    });
    await this.recordAudit({ action: "sales_quote_recalculated", actorId: actor.id, targetType: "SalesQuote", targetId: next.id, metadata: { previousQuoteId: id, storeId: dto.storeId } });
    return { previousQuoteId: id, quote: next };
  }

  async convertToOrder(user: PricingAuthenticatedUser, id: string) {
    const actor = await this.withStoreMember(user);
    const quote = await this.prisma.salesQuote.findFirst({
      where: { id },
      include: { items: true, capacityReservation: true }
    });
    if (!quote) throw new NotFoundException("报价单不存在");
    if (!PermissionPolicy.canViewStoreData(actor, quote.storeId)) throw new ForbiddenException("无权限");
    if (quote.salesPersonId !== actor.id && !PermissionPolicy.isStoreManager(actor, quote.storeId)) {
      throw new ForbiddenException("只有报价销售或店长可以转订单");
    }
    if (quote.convertedOrderId) return { orderId: quote.convertedOrderId, quoteId: quote.id };
    if (quote.status !== SalesQuoteStatus.APPROVED || quote.validUntil <= new Date()) {
      throw new BadRequestException("只有有效的已批准报价单可以转订单");
    }

    const input = await this.prisma.pricingCalculation.findUnique({ where: { id: quote.pricingCalculationId }, select: { inputSnapshot: true } });
    const pricingInput = input?.inputSnapshot as unknown as { constructionType: ConstructionType; constructionLocation: ConstructionLocation } | undefined;
    if (!pricingInput) throw new BadRequestException("报价单缺少施工快照");

    // Mark conversion in progress using the existing terminal status so a second
    // request cannot create a duplicate order while the first request is running.
    const claimed = await this.prisma.salesQuote.updateMany({
      where: { id: quote.id, status: SalesQuoteStatus.APPROVED, convertedOrderId: null },
      data: { status: SalesQuoteStatus.CONVERTED }
    });
    if (claimed.count !== 1) throw new BadRequestException("报价单正在转订单或已完成转单");

    try {
      const order = await this.createOrderUseCase.execute(actor, {
        storeId: quote.storeId,
        customerId: quote.customerId,
        vehicleId: quote.vehicleId ?? undefined,
        salesPersonId: quote.salesPersonId,
        constructionType: pricingInput.constructionType,
        constructionLocation: pricingInput.constructionLocation,
        constructionAddress: quote.constructionAddress ?? undefined,
        appointmentDate: quote.appointmentDate?.toISOString(),
        appointmentTimeSlot: quote.appointmentTimeSlot ?? undefined,
        items: quote.items.map((item) => ({ productId: item.productId, quantity: decimalToNumber(item.quantity), unitPriceCents: item.finalUnitPriceCents })),
        laborCostCents: quote.finalLaborCostCents,
        pricingCalculationId: quote.pricingCalculationId,
        capacityReservationId: quote.capacityReservation?.id,
        estimatedCostCents: quote.estimatedCostCents ?? undefined,
        remark: `由报价单 ${quote.quoteNo} 转入`
      }, { approvedQuote: true });
      await this.prisma.salesQuote.update({ where: { id: quote.id }, data: { convertedOrderId: order.id } });
      await this.recordAudit({ action: "sales_quote_converted", actorId: actor.id, targetType: "SalesQuote", targetId: quote.id, metadata: { orderId: order.id, storeId: quote.storeId } });
      return { orderId: order.id, quoteId: quote.id };
    } catch (error) {
      await this.prisma.salesQuote.update({ where: { id: quote.id }, data: { status: SalesQuoteStatus.APPROVED } });
      throw error;
    }
  }

  private async withStoreMember(user: PricingAuthenticatedUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private async recordAudit(event: AuditEvent) {
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }
}

function createQuoteNo() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `SQ${stamp}${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
}


function decimalToNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") return value.toNumber();
  return Number(value);
}
