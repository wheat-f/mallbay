import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { CapacityReservationStatus, Prisma, PricingApprovalStatus, PricingApprovalType, SalesQuoteStatus, StoreStatus } from "@prisma/client";
import type { UserWithStoreMember } from "../permissions/domain/access-types";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { multiplyMoneyCents } from "../pricing/domain/money";
import { CapacityReservationService } from "../construction/capacity-reservation.service";
import { ConstructionLocation, ConstructionType } from "@prisma/client";
import { evaluatePricingGuard, type PricingCalculationResult, type PricingProtectionPolicy } from "../pricing/domain/pricing-engine";
import type { PricingAuthenticatedUser } from "../pricing/pricing.service";
import { CreateSalesQuoteDto, ExportSalesQuoteDetailsDto, ListSalesQuotesDto, RecalculateSalesQuoteDto, ReviewSalesQuoteDto, SubmitSalesQuoteDto, WithdrawSalesQuoteDto } from "./dto/sales-quote.dto";
import { OrderLifecycle } from "../orders/domain/order-lifecycle";
import { AuditLogService } from "../observability/audit-log.service";
import { AuditEventWriter } from "../observability/audit-event-writer";
import type { AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";
import { fingerprintCommand } from "../orders/domain/order-lifecycle-command";

@Injectable()
export class SalesQuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacityReservations: CapacityReservationService,
    private readonly orderLifecycle: OrderLifecycle,
    @Optional() private readonly audit?: AuditLogService,
    @Optional() private readonly auditWriter?: AuditEventWriter,
    @Optional() private readonly accessContext?: AccessContext
  ) {}

  async create(user: PricingAuthenticatedUser, rawIdempotencyKey: string | undefined, dto: CreateSalesQuoteDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canOrdersWrite(actor, dto.storeId, actor.id)) throw new ForbiddenException("无权限");
    const idempotencyKey = rawIdempotencyKey?.trim();
    if (!idempotencyKey) throw new BadRequestException({ code: "COMMAND_ID_REQUIRED", message: "缺少报价创建标识" });
    const requestFingerprint = fingerprintCommand("CREATE_SALES_QUOTE", dto.storeId, dto);
    const existingIntent = await this.prisma.salesQuote.findUnique({
      where: { storeId_idempotencyActorId_idempotencyKey: { storeId: dto.storeId, idempotencyActorId: actor.id, idempotencyKey } },
      include: { items: true, approvals: true }
    });
    if (existingIntent) {
      if (existingIntent.requestFingerprint !== requestFingerprint) {
        throw new ConflictException({ code: "COMMAND_ID_CONFLICT", message: "该报价创建标识已绑定不同输入" });
      }
      return existingIntent;
    }
    const executionStoreId = dto.executionStoreId?.trim() || dto.storeId;
    if (executionStoreId !== dto.storeId) {
      const [sourceStore, executionStore] = await Promise.all([
        this.prisma.store.findUnique({
          where: { id: dto.storeId },
          select: { financialEntityId: true, crossStoreConstructionEnabled: true, status: true }
        }),
        this.prisma.store.findUnique({
          where: { id: executionStoreId },
          select: { financialEntityId: true, crossStoreConstructionEnabled: true, status: true }
        })
      ]);
      if (!sourceStore || !executionStore) throw new BadRequestException("来源门店或执行门店不存在");
      if (
        sourceStore.financialEntityId !== executionStore.financialEntityId ||
        !sourceStore.crossStoreConstructionEnabled ||
        !executionStore.crossStoreConstructionEnabled ||
        sourceStore.status !== StoreStatus.PUBLISHED ||
        executionStore.status !== StoreStatus.PUBLISHED
      ) {
        throw new BadRequestException("只能选择同一财务主体下已启用跨店施工的正式门店");
      }
    }
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
      costEstimate?: CostEstimateSnapshot;
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
    const finalConstructionChargeCents = resolveFinalConstructionChargeCents(dto);
    const rawCostEstimate = readCostEstimate(output);
    const usesTemporaryCost = rawCostEstimate.costCompleteness !== "COMPLETE" && dto.temporaryCostCents !== undefined;
    if (usesTemporaryCost && (!await this.canStoreWrite(actor, dto.storeId) || !dto.temporaryCostReason?.trim())) {
      throw new BadRequestException("仅店长可填写本单临时成本，且必须说明成本依据");
    }
    if (rawCostEstimate.costCompleteness !== "COMPLETE" && !usesTemporaryCost) {
      throw new BadRequestException("预计成本尚未完整；请补齐成本标准，或由店长填写本单临时成本并提交审批");
    }
    const costEstimate = usesTemporaryCost
      ? { ...rawCostEstimate, estimatedTotalCostCents: dto.temporaryCostCents!, costCompleteness: "TEMPORARY" as const }
      : rawCostEstimate;
    const guard = evaluatePricingGuard(
      output.calculation,
      {
        lines: finalLines,
        laborCostCents: finalConstructionChargeCents,
        estimatedCostCents: (costEstimate.costCompleteness === "COMPLETE" || costEstimate.costCompleteness === "TEMPORARY")
          ? costEstimate.estimatedTotalCostCents ?? undefined
          : undefined
      },
      output.protectionPolicy
    );
    if (guard.decision === "BLOCKED") throw new BadRequestException("成交价低于保护范围，不能提交报价");
    if (guard.decision === "NORMAL" && !usesTemporaryCost) throw new BadRequestException("当前成交价无需报价审批，可直接生成正式订单");
    if (!usesTemporaryCost && !dto.adjustmentReasonCode?.trim() && !dto.adjustmentReasonText?.trim()) {
      throw new BadRequestException("提交报价审批必须填写改价原因");
    }

    // A temporary cost is an exceptional cost source and may never remain a
    // draft that can later bypass quote approval.
    const submitForApproval = usesTemporaryCost || dto.submitForApproval !== false;
    const finalProductAmountCents = dto.items.reduce((sum, item, index) => sum + multiplyMoneyCents(item.finalUnitPriceCents, output.calculation.lines[index].quantity), 0);
    const marginCheck = guard.checks.find((check) => check.scope === "MARGIN");
    const approvalType = usesTemporaryCost || marginCheck?.decision === "APPROVAL_REQUIRED" ? PricingApprovalType.MARGIN : PricingApprovalType.DEVIATION;
    const validUntil = new Date(Date.now() + (dto.validHours ?? output.protectionPolicy.softHoldHours ?? 24) * 60 * 60 * 1000);
    try {
      const { quote } = await this.prisma.$transaction(async (tx) => {
      const quote = await tx.salesQuote.create({
        data: {
        storeId: dto.storeId,
        executionStoreId,
        quoteNo: createQuoteNo(),
        customerId: dto.customerId,
        vehicleId: dto.vehicleId,
        salesPersonId: actor.id,
        idempotencyKey,
        idempotencyActorId: actor.id,
        requestFingerprint,
        pricingCalculationId: snapshot.id,
        status: submitForApproval ? SalesQuoteStatus.PENDING_APPROVAL : SalesQuoteStatus.DRAFT,
        vehicleClassSnapshot: vehicleClassSnapshot as Prisma.InputJsonValue,
        suggestedProductAmountCents: output.calculation.suggestedProductAmountCents,
        suggestedLaborCostCents: output.calculation.suggestedLaborCostCents,
        suggestedConstructionChargeCents: output.calculation.suggestedLaborCostCents,
        suggestedTotalCents: output.calculation.suggestedTotalCents,
        finalProductAmountCents,
        finalLaborCostCents: finalConstructionChargeCents,
        finalConstructionChargeCents,
        finalTotalCents: finalProductAmountCents + finalConstructionChargeCents,
        estimatedCostCents: costEstimate.estimatedTotalCostCents ?? undefined,
        estimatedMaterialCostCents: costEstimate.estimatedMaterialCostCents ?? undefined,
        estimatedConstructionCostCents: costEstimate.estimatedConstructionCostCents ?? undefined,
        estimatedTotalCostCents: costEstimate.estimatedTotalCostCents ?? undefined,
        costCompleteness: costEstimate.costCompleteness,
        temporaryCostCents: usesTemporaryCost ? dto.temporaryCostCents : undefined,
        temporaryCostReason: usesTemporaryCost ? dto.temporaryCostReason?.trim() : undefined,
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
        await this.capacityReservations.holdQuoteWithin(tx, {
          storeId: executionStoreId,
          quoteId: quote.id,
          appointmentDate: dto.appointmentDate,
          constructionLocation: dto.constructionLocation,
          constructionType: dto.constructionType,
          expiresAt: validUntil
        });
      }
      await tx.auditEvent.create({
        data: {
          action: submitForApproval ? "sales_quote_submitted" : "sales_quote_draft_created",
          actorId: actor.id,
          storeId: dto.storeId,
          targetType: "SalesQuote",
          targetId: quote.id,
          metadata: { storeId: dto.storeId, quoteNo: quote.quoteNo, approvalType }
        }
      });
      return { quote };
    });
      return quote;
    } catch (error) {
      if (isUniqueConflict(error)) {
        const concurrent = await this.prisma.salesQuote.findUnique({
          where: { storeId_idempotencyActorId_idempotencyKey: { storeId: dto.storeId, idempotencyActorId: actor.id, idempotencyKey } },
          include: { items: true, approvals: true }
        });
        if (concurrent) {
          if (concurrent.requestFingerprint !== requestFingerprint) throw new ConflictException({ code: "COMMAND_ID_CONFLICT", message: "该报价创建标识已绑定不同输入" });
          return concurrent;
        }
      }
      throw error;
    }
  }

  async list(user: PricingAuthenticatedUser, dto: ListSalesQuotesDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canOrdersRead(actor, dto.storeId)) throw new ForbiddenException("无权限");
    const isManager = await this.canStoreWrite(actor, dto.storeId);
    const where = {
      storeId: dto.storeId,
      ...(isManager ? {} : { salesPersonId: actor.id })
    };
    const quotes = await this.prisma.salesQuote.findMany({ where, orderBy: { createdAt: "desc" }, include: { approvals: true, items: true } });
    return await this.canFinanceWrite(actor, dto.storeId) ? quotes : quotes.map(redactQuoteCost);
  }

  async exportDetails(user: PricingAuthenticatedUser, dto: ExportSalesQuoteDetailsDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canOrdersRead(actor, dto.storeId)) throw new ForbiddenException("无权限");
    const canViewCosts = await this.canFinanceWrite(actor, dto.storeId);
    const isManager = await this.canStoreWrite(actor, dto.storeId);
    const quotes = await this.prisma.salesQuote.findMany({
      where: {
        storeId: dto.storeId,
        ...(isManager ? {} : { salesPersonId: actor.id })
      },
      orderBy: { createdAt: "desc" },
      include: {
        customer: { select: { name: true, companyName: true, contactPerson: true } },
        vehicle: { select: { carPlate: true, carModel: true } },
        items: { orderBy: { createdAt: "asc" } }
      }
    });
    const rows = quotes.flatMap((quote) => quote.items.map((item) => {
      const product = item.productSnapshot as { brand?: string; name?: string; model?: string; specification?: string } | null;
      const base = {
        quoteId: quote.id,
        quoteNo: quote.quoteNo,
        customerName: quote.customer?.companyName ?? quote.customer?.name ?? quote.customer?.contactPerson ?? "",
        vehicle: [quote.vehicle?.carPlate, quote.vehicle?.carModel].filter(Boolean).join(" / "),
        status: quote.status,
        createdAt: quote.createdAt,
        validUntil: quote.validUntil,
        productId: item.productId,
        productBrand: product?.brand ?? "",
        productName: product?.name ?? "",
        productModel: product?.model ?? "",
        productSpecification: product?.specification ?? "",
        quantity: decimalToNumber(item.quantity),
        salesUnit: item.salesUnit,
        suggestedUnitPriceCents: item.suggestedUnitPriceCents,
        finalUnitPriceCents: item.finalUnitPriceCents,
        finalAmountCents: item.finalAmountCents,
        suggestedConstructionChargeCents: quote.suggestedConstructionChargeCents ?? quote.suggestedLaborCostCents,
        finalConstructionChargeCents: quote.finalConstructionChargeCents ?? quote.finalLaborCostCents,
        quoteTotalCents: quote.finalTotalCents
      };
      return canViewCosts
        ? {
          ...base,
          estimatedMaterialCostCents: quote.estimatedMaterialCostCents,
          estimatedConstructionCostCents: quote.estimatedConstructionCostCents,
          estimatedTotalCostCents: quote.estimatedTotalCostCents,
          costCompleteness: quote.costCompleteness,
          temporaryCostCents: quote.temporaryCostCents,
          temporaryCostReason: quote.temporaryCostReason,
          estimatedMarginBps: quote.estimatedMarginBps
        }
        : base;
    }));
    const dimension = dto.exportDimension ?? "date";
    return rows.sort((left, right) => {
      if (dimension === "customer") return left.customerName.localeCompare(right.customerName, "zh-CN") || left.quoteNo.localeCompare(right.quoteNo);
      if (dimension === "product") return left.productName.localeCompare(right.productName, "zh-CN") || left.quoteNo.localeCompare(right.quoteNo);
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() || left.quoteNo.localeCompare(right.quoteNo);
    });
  }

  async get(user: PricingAuthenticatedUser, id: string, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!await this.canOrdersRead(actor, storeId)) throw new ForbiddenException("无权限");
    const isManager = await this.canStoreWrite(actor, storeId);
    const quote = await this.prisma.salesQuote.findFirst({
      where: {
        id,
        storeId,
        ...(isManager ? {} : { salesPersonId: actor.id })
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
    return await this.canFinanceWrite(actor, storeId) ? quote : redactQuoteCost(quote);
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
    if (!await this.canQuoteActor(actor, dto.storeId, quote.salesPersonId)) {
      throw new ForbiddenException("无权限提交该报价");
    }
    if (quote.status === SalesQuoteStatus.PENDING_APPROVAL) return this.get(user, id, dto.storeId);
    if (quote.status !== SalesQuoteStatus.DRAFT) throw new BadRequestException("只有草稿报价可以提交审批");
    const output = quote.pricingCalculation.outputSnapshot as unknown as { calculation: PricingCalculationResult; costEstimate?: CostEstimateSnapshot; protectionPolicy?: PricingProtectionPolicy | null };
    const input = quote.pricingCalculation.inputSnapshot as unknown as { constructionType: ConstructionType; constructionLocation: ConstructionLocation };
    if (!output.calculation || !output.protectionPolicy || !input.constructionType || !input.constructionLocation) {
      throw new BadRequestException("报价单价格或施工快照不完整");
    }
    if (quote.costCompleteness === "TEMPORARY" && (quote.temporaryCostCents === null || !quote.temporaryCostReason?.trim())) {
      throw new BadRequestException("临时成本报价缺少冻结的金额或成本依据，不能提交审批");
    }
    const guard = evaluatePricingGuard(output.calculation, {
      lines: quote.items.map((item, index) => ({ id: output.calculation.lines[index]?.id ?? item.id, unitPriceCents: item.finalUnitPriceCents })),
      laborCostCents: quote.finalConstructionChargeCents ?? quote.finalLaborCostCents,
      estimatedCostCents: quote.costCompleteness === "COMPLETE" || quote.costCompleteness === "TEMPORARY"
        ? quote.estimatedTotalCostCents ?? quote.estimatedCostCents ?? undefined
        : undefined
    }, output.protectionPolicy);
    if (guard.decision === "BLOCKED") throw new BadRequestException("成交价低于保护范围，不能提交报价");
    if (guard.decision === "NORMAL" && quote.costCompleteness !== "TEMPORARY") throw new BadRequestException("当前成交价无需报价审批，可直接生成正式订单");
    const marginCheck = guard.checks.find((check) => check.scope === "MARGIN");
    const approvalType = quote.costCompleteness === "TEMPORARY" || marginCheck?.decision === "APPROVAL_REQUIRED"
      ? PricingApprovalType.MARGIN
      : PricingApprovalType.DEVIATION;
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
    if (!await this.canStoreWrite(actor, dto.storeId)) throw new ForbiddenException("只有店长可以审批报价");
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
    if (!await this.canQuoteActor(actor, dto.storeId, quote.salesPersonId)) {
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
    if (!await this.canQuoteActor(actor, dto.storeId, quote.salesPersonId)) {
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
    const next = await this.create(user, `RECALCULATE:${id}:${Date.now()}`, {
      storeId: dto.storeId,
      executionStoreId: quote.executionStoreId,
      customerId: quote.customerId,
      vehicleId: quote.vehicleId ?? undefined,
      appointmentDate: quote.appointmentDate?.toISOString(),
      appointmentTimeSlot: quote.appointmentTimeSlot ?? undefined,
      constructionAddress: quote.constructionAddress ?? undefined,
      constructionType: pricingInput.constructionType,
      constructionLocation: pricingInput.constructionLocation,
      pricingCalculationId: dto.pricingCalculationId,
      items: dto.items,
      finalConstructionChargeCents: resolveFinalConstructionChargeCents(dto),
      temporaryCostCents: dto.temporaryCostCents,
      temporaryCostReason: dto.temporaryCostReason,
      adjustmentReasonCode: dto.adjustmentReasonCode,
      adjustmentReasonText: dto.adjustmentReasonText,
      validHours: dto.validHours
    });
    await this.recordAudit({ action: "sales_quote_recalculated", actorId: actor.id, targetType: "SalesQuote", targetId: next.id, metadata: { previousQuoteId: id, storeId: dto.storeId } });
    return { previousQuoteId: id, quote: next };
  }

  async convertToOrder(user: PricingAuthenticatedUser, id: string, commandId: string | undefined) {
    const actor = await this.withStoreMember(user);
    return this.orderLifecycle.createOrder(
      actor,
      { commandId: commandId ?? "", source: "QUOTE_CONVERSION" },
      { source: "APPROVED_QUOTE", quoteId: id }
    );
  }

  private async withStoreMember(user: PricingAuthenticatedUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private async canOrdersRead(actor: UserWithStoreMember, storeId: string) {
    if (!this.accessContext) throw new Error("SalesQuotesService access context is not configured");
    return this.accessContext.can({ userId: actor.id }, "orders", "read", { storeId });
  }

  private async canOrdersWrite(actor: UserWithStoreMember, storeId: string, ownerId?: string) {
    if (!this.accessContext) throw new Error("SalesQuotesService access context is not configured");
    return this.accessContext.can({ userId: actor.id }, "orders", "write", { storeId, ownerId });
  }

  private async canStoreWrite(actor: UserWithStoreMember, storeId: string) {
    if (!this.accessContext) throw new Error("SalesQuotesService access context is not configured");
    return this.accessContext.can({ userId: actor.id }, "store", "write", { storeId });
  }

  private async canFinanceWrite(actor: UserWithStoreMember, storeId: string) {
    if (!this.accessContext) throw new Error("SalesQuotesService access context is not configured");
    return this.accessContext.can({ userId: actor.id }, "finance", "write", { storeId });
  }

  private async canQuoteActor(actor: UserWithStoreMember, storeId: string, salesPersonId: string) {
    if (!await this.canOrdersRead(actor, storeId)) return false;
    return actor.id === salesPersonId || await this.canStoreWrite(actor, storeId);
  }

  private async recordAudit(event: AuditEvent) {
    if (this.auditWriter) return this.auditWriter.writeTransactional(this.prisma, event);
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
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

type CostEstimateSnapshot = {
  estimatedMaterialCostCents?: number | null;
  estimatedConstructionCostCents?: number | null;
  estimatedTotalCostCents?: number | null;
  costCompleteness?: "COMPLETE" | "TEMPORARY" | "MISSING";
};

function readCostEstimate(output: { costEstimate?: CostEstimateSnapshot }) {
  return {
    estimatedMaterialCostCents: output.costEstimate?.estimatedMaterialCostCents ?? null,
    estimatedConstructionCostCents: output.costEstimate?.estimatedConstructionCostCents ?? null,
    estimatedTotalCostCents: output.costEstimate?.estimatedTotalCostCents ?? null,
    costCompleteness: output.costEstimate?.costCompleteness ?? "MISSING" as const
  };
}

/** Sales users can see quote and approval outcomes but not internal cost or margin. */
function redactQuoteCost<T>(quote: T): Omit<T, "estimatedCostCents" | "estimatedMaterialCostCents" | "estimatedConstructionCostCents" | "estimatedTotalCostCents" | "costCompleteness" | "temporaryCostCents" | "temporaryCostReason" | "estimatedMarginBps"> {
  const safe = { ...(quote as object) } as Record<string, unknown>;
  for (const field of ["estimatedCostCents", "estimatedMaterialCostCents", "estimatedConstructionCostCents", "estimatedTotalCostCents", "costCompleteness", "temporaryCostCents", "temporaryCostReason", "estimatedMarginBps"]) {
    delete safe[field];
  }
  // The quote page needs the rule version/hash for traceability, but the
  // persisted calculation output also contains internal cost details.
  if (safe.pricingCalculation && typeof safe.pricingCalculation === "object") {
    const { outputSnapshot: _outputSnapshot, ...pricingCalculation } = safe.pricingCalculation as Record<string, unknown>;
    safe.pricingCalculation = pricingCalculation;
  }
  return safe as Omit<T, "estimatedCostCents" | "estimatedMaterialCostCents" | "estimatedConstructionCostCents" | "estimatedTotalCostCents" | "costCompleteness" | "temporaryCostCents" | "temporaryCostReason" | "estimatedMarginBps">;
}

function resolveFinalConstructionChargeCents(dto: Pick<CreateSalesQuoteDto | RecalculateSalesQuoteDto, "finalConstructionChargeCents" | "finalLaborCostCents">) {
  const value = dto.finalConstructionChargeCents ?? dto.finalLaborCostCents;
  if (value === undefined) throw new BadRequestException("本单施工收费不能为空");
  return value;
}
