import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ConstructionCostAdjustmentStatus, ConstructionCostSettlementStatus, InventoryMovementType, Prisma } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { AuditLogService, type AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";
import { PrismaService } from "../prisma/prisma.service";
import { multiplyMoneyCents } from "../pricing/domain/money";
import type { AuthenticatedConstructionUser } from "./construction.service";
import { ApproveCostAdjustmentDto, BatchConfirmCostSettlementDto, ConfirmCostSettlementDto, CreateCostAdjustmentDto, ListCostSettlementsDto, WorkCostDeclarationDto } from "./dto/construction.dto";

const settlementInclude = Prisma.validator<Prisma.ConstructionCostSettlementInclude>()({
  order: { include: { amount: true, vehicle: true } },
  constructionRecord: { include: { assignments: true } },
  workerLines: { include: { worker: { select: { id: true, nickname: true, username: true } } }, orderBy: { createdAt: "asc" } },
  adjustments: { orderBy: { createdAt: "asc" } },
  exceptions: { orderBy: { createdAt: "asc" } }
});

@Injectable()
export class ConstructionCostSettlementService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditLogService) {}

  async initializeForCompletedRecord(recordId: string, actorId?: string) {
    const existing = await this.prisma.constructionCostSettlement.findFirst({ where: { constructionRecordId: recordId } });
    if (existing) return existing;
    const record = await this.prisma.constructionRecord.findUnique({
      where: { id: recordId },
      include: {
        assignments: true,
        order: { include: { amount: true } }
      }
    });
    if (!record) throw new NotFoundException("施工记录不存在");
    const snapshot = readPricingSnapshot(record.order.amount?.pricingOutputSnapshot);
    const standardWorkMinutes = snapshot.costEstimate.standardWorkMinutes ?? 0;
    const assignedIds = record.assignments.map((assignment) => assignment.workerUserId);
    const members = assignedIds.length ? await this.prisma.storeMember.findMany({ where: { storeId: record.storeId, userId: { in: assignedIds } }, select: { userId: true, position: true } }) : [];
    const commissionSnapshots = assignedIds.length ? await this.prisma.workerCommissionSnapshot.findMany({ where: { recordId, workerUserId: { in: assignedIds } }, select: { workerUserId: true, amountCents: true } }) : [];
    const memberByUser = new Map(members.map((member) => [member.userId, member]));
    const commissionByUser = new Map(commissionSnapshots.map((line) => [line.workerUserId, line.amountCents]));
    const rateByPosition = new Map((snapshot.costEstimate.positionCostRates ?? []).map((rate) => [rate.positionTypeCode, rate.hourlyCostCents]));
    const minutesPerWorker = assignedIds.length ? Math.ceil(standardWorkMinutes / assignedIds.length) : 0;
    const settlement = await this.prisma.constructionCostSettlement.create({
      data: {
        storeId: record.storeId,
        orderId: record.orderId,
        constructionRecordId: record.id,
        standardWorkMinutes,
        confirmedWorkMinutes: standardWorkMinutes,
        estimatedMaterialCostCents: record.order.amount?.estimatedMaterialCostCents ?? null,
        estimatedConstructionCostCents: record.order.amount?.estimatedConstructionCostCents ?? null,
        sourceSnapshot: {
          pricingCalculationId: record.order.amount?.pricingCalculationId ?? null,
          costEstimate: snapshot.costEstimate,
          protectionPolicy: snapshot.protectionPolicy
        } as Prisma.InputJsonValue,
        workerLines: {
          create: assignedIds.map((workerUserId) => {
            const positionTypeCode = memberByUser.get(workerUserId)?.position ?? "CONSTRUCTION";
            const hourlyCostCentsSnapshot = rateByPosition.get(positionTypeCode) ?? 0;
            return {
              workerUserId,
              positionTypeCode,
              standardMinutes: minutesPerWorker,
              confirmedMinutes: minutesPerWorker,
              hourlyCostCentsSnapshot,
              baseCostCents: multiplyMoneyCents(hourlyCostCentsSnapshot, minutesPerWorker / 60),
              commissionCents: commissionByUser.get(workerUserId) ?? 0
            };
          })
        }
      },
      include: settlementInclude
    });
    await this.recordAudit({ action: "construction_cost_settlement_created", actorId, targetType: "ConstructionCostSettlement", targetId: settlement.id, metadata: { storeId: record.storeId, orderId: record.orderId } });
    return settlement;
  }

  async list(user: AuthenticatedConstructionUser, dto: ListCostSettlementsDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanViewCosts(actor, dto.storeId);
    const settlements = await this.prisma.constructionCostSettlement.findMany({
      where: { storeId: dto.storeId, ...(dto.status ? { status: dto.status as ConstructionCostSettlementStatus } : {}) },
      include: settlementInclude,
      orderBy: { updatedAt: "desc" }
    });
    return settlements.map((settlement) => this.presentSettlement(actor, settlement));
  }

  async get(user: AuthenticatedConstructionUser, id: string) {
    const actor = await this.withStoreMember(user);
    const settlement = await this.find(id);
    this.assertCanViewCosts(actor, settlement.storeId);
    return this.presentSettlement(actor, settlement);
  }

  async declare(user: AuthenticatedConstructionUser, id: string, dto: WorkCostDeclarationDto) {
    const actor = await this.withStoreMember(user);
    const settlement = await this.find(id);
    if (settlement.status !== ConstructionCostSettlementStatus.PENDING_CONFIRMATION) throw new BadRequestException("成本已确认，不能直接修改工时申报");
    const workerLine = settlement.workerLines.find((line) => line.workerUserId === actor.id);
    if (!workerLine || !PermissionPolicy.canWorkOnConstructionTask(actor, settlement.storeId, actor.id)) throw new ForbiddenException("只能申报本人施工任务的工时偏差");
    if (dto.declaredWorkMinutes !== workerLine.standardMinutes && !dto.varianceReasonCode?.trim()) throw new BadRequestException("申报工时与标准工时不一致时，必须选择偏差原因");
    const updated = await this.prisma.constructionCostWorkerLine.update({
      where: { id: workerLine.id },
      data: { declaredMinutes: dto.declaredWorkMinutes, varianceReasonCode: dto.varianceReasonCode, varianceReasonText: dto.varianceReasonText }
    });
    await this.recordAudit({ action: "construction_cost_declared", actorId: actor.id, targetType: "ConstructionCostSettlement", targetId: id, metadata: { storeId: settlement.storeId, declaredWorkMinutes: dto.declaredWorkMinutes } });
    // 施工员只需要确认自己的申报结果；岗位小时成本、基础成本、提成和补贴属于财务可见的
    // 个人薪酬明细，不能随着申报接口回传给施工员。
    return {
      id: updated.id,
      workerUserId: updated.workerUserId,
      standardMinutes: updated.standardMinutes,
      declaredMinutes: updated.declaredMinutes,
      varianceReasonCode: updated.varianceReasonCode,
      varianceReasonText: updated.varianceReasonText
    };
  }

  async getOwnDeclaration(user: AuthenticatedConstructionUser, recordId: string) {
    const actor = await this.withStoreMember(user);
    const settlement = await this.prisma.constructionCostSettlement.findUnique({
      where: { constructionRecordId: recordId },
      include: {
        constructionRecord: { include: { assignments: true } },
        workerLines: { where: { workerUserId: actor.id } }
      }
    });
    if (!settlement) throw new NotFoundException("该施工任务尚未生成成本确认记录");
    if (!PermissionPolicy.canWorkOnConstructionTask(actor, settlement.storeId, actor.id) || !settlement.constructionRecord.assignments.some((item) => item.workerUserId === actor.id)) throw new ForbiddenException("只能查看本人施工任务的工时申报");
    const workerLine = settlement.workerLines[0];
    if (!workerLine) throw new ForbiddenException("当前施工任务未分配到本人");
    return {
      id: settlement.id,
      status: settlement.status,
      standardMinutes: workerLine.standardMinutes,
      declaredMinutes: workerLine.declaredMinutes,
      varianceReasonCode: workerLine.varianceReasonCode,
      varianceReasonText: workerLine.varianceReasonText
    };
  }

  async confirm(user: AuthenticatedConstructionUser, id: string, dto: ConfirmCostSettlementDto, options: { allowAbnormal?: boolean } = {}) {
    const actor = await this.withStoreMember(user);
    const settlement = await this.find(id);
    this.assertCanConfirm(actor, settlement.storeId);
    if (settlement.status !== ConstructionCostSettlementStatus.PENDING_CONFIRMATION) throw new BadRequestException("只有待确认成本可以直接确认");
    const abnormal = isAbnormal(settlement);
    if (abnormal && !options.allowAbnormal) throw new BadRequestException("异常成本必须逐单进入详情确认");
    assertConfirmLines(settlement.workerLines, dto.workerLines);
    assertVarianceReasons(settlement.workerLines, dto.workerLines);
    assertManualConstructionChargeAllocation(
      dto.workerLines,
      settlement.order.amount?.constructionChargeCents ?? settlement.order.amount?.laborCostCents ?? 0
    );
    const actualMaterial = await this.calculateActualMaterialCost(settlement.orderId);
    if (actualMaterial.hasMissingCost) throw new BadRequestException("订单存在尚未补录实际入库价的出库批次，请采购员补录后再确认成本");
    const actualMaterialCostCents = actualMaterial.totalCents;
    // Personal commission is maintained by the commission module. A manager
    // confirming work hours must not be able to replace it through the browser
    // payload; read the current authoritative amount and freeze it on the
    // worker cost line together with the confirmed hours.
    const actualCommissions = typeof this.prisma.workerCommission?.findMany === "function"
      ? await this.prisma.workerCommission.findMany({
        where: {
          orderId: settlement.orderId,
          workerUserId: { in: settlement.workerLines.map((line) => line.workerUserId) }
        },
        select: { workerUserId: true, finalAmountCents: true }
      })
      : [];
    const commissionByWorker = new Map(actualCommissions.map((line) => [line.workerUserId, line.finalAmountCents]));
    const confirmedWorkMinutes = dto.workerLines.reduce((sum, line) => sum + line.confirmedMinutes, 0);
    const lineByWorker = new Map(dto.workerLines.map((line) => [line.workerUserId, line]));
    const workerLines = settlement.workerLines.map((line) => {
      const input = lineByWorker.get(line.workerUserId)!;
      const baseCostCents = multiplyMoneyCents(line.hourlyCostCentsSnapshot, input.confirmedMinutes / 60);
      return {
        id: line.id,
        ...input,
        baseCostCents,
        // Intentionally ignore dto.commissionCents; only the finance-managed
        // commission record is authoritative for actual cost settlement.
        commissionCents: commissionByWorker.get(line.workerUserId) ?? 0
      };
    });
    const actualConstructionCostCents = workerLines.reduce((sum, line) => sum + line.baseCostCents + (line.commissionCents ?? 0) + (line.allowanceCents ?? 0), 0);
    const actualTotalCostCents = actualMaterialCostCents + actualConstructionCostCents;
    const revenue = settlement.order.amount?.totalAmountCents ?? 0;
    const actualGrossProfitCents = revenue - actualTotalCostCents;
    const actualGrossMarginBps = revenue > 0 ? Math.floor((actualGrossProfitCents * 10000) / revenue) : -10000;
    const source = settlement.sourceSnapshot as unknown as PricingSnapshot;
    const exception = buildCostException(settlement, actualTotalCostCents, actualGrossMarginBps, source.protectionPolicy);
    const updated = await this.prisma.$transaction(async (tx) => {
      // 用状态条件抢占本次确认，避免两个店长请求同时根据同一份待确认数据
      // 重复写入工时、异常和审计。后续任一步失败会回滚这个状态转换。
      const transitioned = await tx.constructionCostSettlement.updateMany({
        where: { id, status: ConstructionCostSettlementStatus.PENDING_CONFIRMATION },
        data: {
          status: ConstructionCostSettlementStatus.CONFIRMED,
          declaredWorkMinutes: settlement.workerLines.reduce((sum, line) => sum + (line.declaredMinutes ?? line.standardMinutes), 0),
          confirmedWorkMinutes,
          actualMaterialCostCents,
          actualConstructionCostCents,
          actualTotalCostCents,
          actualGrossProfitCents,
          actualGrossMarginBps,
          confirmedById: actor.id,
          confirmedAt: new Date(),
          sourceSnapshot: {
            ...(settlement.sourceSnapshot as Prisma.JsonObject),
            actualMaterialCostLines: actualMaterial.lines,
            actualCommissionSnapshots: actualCommissions
          } as Prisma.InputJsonValue
        }
      });
      if (transitioned.count !== 1) throw new BadRequestException("该成本已被其他操作确认，请刷新后重试");
      for (const line of workerLines) {
        await tx.constructionCostWorkerLine.update({
          where: { id: line.id },
          data: {
            confirmedMinutes: line.confirmedMinutes,
            baseCostCents: line.baseCostCents,
            commissionCents: line.commissionCents ?? 0,
            allowanceCents: line.allowanceCents ?? 0,
            manualConstructionChargeCents: line.manualConstructionChargeCents,
            varianceReasonCode: line.varianceReasonCode,
            varianceReasonText: line.varianceReasonText
          }
        });
      }
      if (exception) await tx.orderCostException.create({ data: { settlementId: settlement.id, ...exception } });
      const confirmed = await tx.constructionCostSettlement.findUnique({ where: { id }, include: settlementInclude });
      if (!confirmed) throw new NotFoundException("施工成本结算记录不存在");
      return confirmed;
    });
    await this.recordAudit({ action: "construction_cost_confirmed", actorId: actor.id, targetType: "ConstructionCostSettlement", targetId: id, metadata: { storeId: settlement.storeId, abnormal, actualTotalCostCents } });
    return this.presentSettlement(actor, updated);
  }

  async batchConfirm(user: AuthenticatedConstructionUser, dto: BatchConfirmCostSettlementDto) {
    const actor = await this.withStoreMember(user);
    const ids = [...new Set(dto.settlementIds)];
    const settlements = await this.prisma.constructionCostSettlement.findMany({ where: { id: { in: ids } }, include: settlementInclude });
    if (settlements.length !== ids.length) throw new NotFoundException("存在不存在的成本确认记录");
    for (const settlement of settlements) {
      this.assertCanConfirm(actor, settlement.storeId);
      if (isAbnormal(settlement)) throw new BadRequestException("批量确认不支持异常成本记录，请逐单确认");
    }
    return Promise.all(settlements.map((settlement) => this.confirm(user, settlement.id, {
      workerLines: settlement.workerLines.map((line) => ({
        workerUserId: line.workerUserId,
        confirmedMinutes: line.standardMinutes,
        commissionCents: line.commissionCents,
        allowanceCents: line.allowanceCents,
        ...(line.manualConstructionChargeCents != null ? { manualConstructionChargeCents: line.manualConstructionChargeCents } : {})
      }))
    })));
  }

  async createAdjustment(user: AuthenticatedConstructionUser, id: string, dto: CreateCostAdjustmentDto) {
    const actor = await this.withStoreMember(user);
    const settlement = await this.find(id);
    // 店长和财务都可以在确认后发起调整；审批与财务结算仍由财务/管理员控制。
    this.assertCanViewCosts(actor, settlement.storeId);
    if (settlement.status === ConstructionCostSettlementStatus.PENDING_CONFIRMATION) throw new BadRequestException("确认前请直接修改成本，不需要调整单");
    if (settlement.status === ConstructionCostSettlementStatus.SETTLED) throw new BadRequestException("财务结算后已冻结，不能创建调整单");
    const idempotencyKey = dto.idempotencyKey?.trim() || undefined;
    if (idempotencyKey) {
      const existing = await this.prisma.constructionCostAdjustment.findFirst({ where: { settlementId: id, idempotencyKey } });
      if (existing) return existing;
    }
    let adjustment;
    try {
      adjustment = await this.prisma.constructionCostAdjustment.create({
        data: {
          settlementId: id,
          idempotencyKey,
          adjustmentType: dto.adjustmentType,
          amountCents: dto.amountCents,
          reasonCode: dto.reasonCode,
          reasonText: dto.reasonText,
          requestedById: actor.id
        }
      });
    } catch (error) {
      // 唯一约束是并发重试的最终防线；命中后读取首次成功创建的调整单。
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.constructionCostAdjustment.findFirst({ where: { settlementId: id, idempotencyKey } });
        if (existing) return existing;
      }
      throw error;
    }
    await this.recordAudit({ action: "construction_cost_adjustment_created", actorId: actor.id, targetType: "ConstructionCostAdjustment", targetId: adjustment.id, metadata: { storeId: settlement.storeId, settlementId: id } });
    return adjustment;
  }

  async approveAdjustment(user: AuthenticatedConstructionUser, id: string, dto: ApproveCostAdjustmentDto) {
    const actor = await this.withStoreMember(user);
    const adjustment = await this.prisma.constructionCostAdjustment.findUnique({ where: { id }, include: { settlement: true } });
    if (!adjustment) throw new NotFoundException("成本调整单不存在");
    if (!this.isFinanceOrAdmin(actor, adjustment.settlement.storeId)) throw new ForbiddenException("只有财务可以审批成本调整单");
    if (adjustment.status !== ConstructionCostAdjustmentStatus.PENDING) throw new BadRequestException("成本调整单已处理");
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedCount = await tx.constructionCostAdjustment.updateMany({
        where: { id, status: ConstructionCostAdjustmentStatus.PENDING },
        data: { status: dto.status, approvedById: actor.id, approvedAt: new Date() }
      });
      if (updatedCount.count !== 1) throw new BadRequestException("成本调整单已被其他操作处理，请刷新后重试");

      // 已结算订单的实际入库价补录不能覆盖已冻结的历史快照。财务批准
      // 材料成本差异单后，再将差异单独结算进实际材料成本和毛利。
      if (dto.status === ConstructionCostAdjustmentStatus.APPROVED
        && adjustment.settlement.status === ConstructionCostSettlementStatus.SETTLED
        && isMaterialReceiptCostAdjustment(adjustment.adjustmentType)) {
        const settlement = await tx.constructionCostSettlement.findUnique({
          where: { id: adjustment.settlementId },
          include: { order: { include: { amount: true } } }
        });
        if (!settlement) throw new NotFoundException("施工成本结算记录不存在");
        const actualMaterialCostCents = settlement.actualMaterialCostCents + adjustment.amountCents;
        const actualTotalCostCents = actualMaterialCostCents + settlement.actualConstructionCostCents;
        const revenue = settlement.order.amount?.totalAmountCents ?? 0;
        await tx.constructionCostSettlement.update({
          where: { id: settlement.id },
          data: {
            actualMaterialCostCents,
            actualTotalCostCents,
            actualGrossProfitCents: revenue - actualTotalCostCents,
            actualGrossMarginBps: revenue > 0 ? Math.floor(((revenue - actualTotalCostCents) * 10000) / revenue) : -10000
          }
        });
        await tx.constructionCostAdjustment.update({
          where: { id },
          data: { status: ConstructionCostAdjustmentStatus.SETTLED, settledAt: new Date() }
        });
      }
      return tx.constructionCostAdjustment.findUnique({ where: { id } });
    });
    if (!updated) throw new NotFoundException("成本调整单不存在");
    await this.recordAudit({ action: "construction_cost_adjustment_approved", actorId: actor.id, targetType: "ConstructionCostAdjustment", targetId: id, metadata: { storeId: adjustment.settlement.storeId, status: dto.status } });
    return updated;
  }

  async settle(user: AuthenticatedConstructionUser, id: string) {
    const actor = await this.withStoreMember(user);
    const settlement = await this.find(id);
    if (!this.isFinanceOrAdmin(actor, settlement.storeId)) throw new ForbiddenException("只有财务可以结算成本");
    if (settlement.status !== ConstructionCostSettlementStatus.CONFIRMED) throw new BadRequestException("只有已确认成本可以财务结算");
    const adjustments = settlement.adjustments.filter((item) => item.status === ConstructionCostAdjustmentStatus.APPROVED);
    const materialAdjustmentTotal = adjustments.filter((item) => isMaterialReceiptCostAdjustment(item.adjustmentType)).reduce((sum, item) => sum + item.amountCents, 0);
    const constructionAdjustmentTotal = adjustments.filter((item) => !isMaterialReceiptCostAdjustment(item.adjustmentType)).reduce((sum, item) => sum + item.amountCents, 0);
    const actualMaterialCostCents = settlement.actualMaterialCostCents + materialAdjustmentTotal;
    const actualConstructionCostCents = settlement.actualConstructionCostCents + constructionAdjustmentTotal;
    const actualTotalCostCents = actualMaterialCostCents + actualConstructionCostCents;
    const revenue = settlement.order.amount?.totalAmountCents ?? 0;
    const settled = await this.prisma.$transaction(async (tx) => {
      // 财务结算也以状态为条件进行原子迁移，重复点击或并发请求都不能重复结算。
      const transitioned = await tx.constructionCostSettlement.updateMany({
        where: { id, status: ConstructionCostSettlementStatus.CONFIRMED },
        data: {
          status: ConstructionCostSettlementStatus.SETTLED,
          actualMaterialCostCents,
          actualConstructionCostCents,
          actualTotalCostCents,
          actualGrossProfitCents: revenue - actualTotalCostCents,
          actualGrossMarginBps: revenue > 0 ? Math.floor(((revenue - actualTotalCostCents) * 10000) / revenue) : -10000,
          settledById: actor.id,
          settledAt: new Date()
        }
      });
      if (transitioned.count !== 1) throw new BadRequestException("该成本已被其他操作结算，请刷新后重试");
      if (adjustments.length) await tx.constructionCostAdjustment.updateMany({ where: { id: { in: adjustments.map((item) => item.id) } }, data: { status: ConstructionCostAdjustmentStatus.SETTLED, settledAt: new Date() } });
      const finalised = await tx.constructionCostSettlement.findUnique({ where: { id }, include: settlementInclude });
      if (!finalised) throw new NotFoundException("施工成本结算记录不存在");
      return finalised;
    });
    await this.recordAudit({ action: "construction_cost_settled", actorId: actor.id, targetType: "ConstructionCostSettlement", targetId: id, metadata: { storeId: settlement.storeId, constructionAdjustmentTotal, materialAdjustmentTotal } });
    return settled;
  }

  async compareOrder(user: AuthenticatedConstructionUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    const settlement = await this.prisma.constructionCostSettlement.findUnique({ where: { orderId }, include: settlementInclude });
    if (!settlement) throw new NotFoundException("订单尚未生成施工成本结算记录");
    this.assertCanViewCosts(actor, settlement.storeId);
    return { settlement: this.presentSettlement(actor, settlement), estimatedTotalCostCents: (settlement.estimatedMaterialCostCents ?? 0) + (settlement.estimatedConstructionCostCents ?? 0), varianceCents: settlement.actualTotalCostCents - ((settlement.estimatedMaterialCostCents ?? 0) + (settlement.estimatedConstructionCostCents ?? 0)) };
  }

  async exportDetails(user: AuthenticatedConstructionUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanViewCosts(actor, storeId);
    const settlements = await this.prisma.constructionCostSettlement.findMany({ where: { storeId }, include: settlementInclude, orderBy: { updatedAt: "desc" } });
    const canViewDetailedLaborCosts = this.canViewDetailedLaborCosts(actor, storeId);
    return settlements.flatMap((settlement) => settlement.workerLines.map((line) => ({
      orderNo: settlement.order.orderNo,
      vehicle: [settlement.order.vehicle?.carPlate, settlement.order.vehicle?.carModel].filter(Boolean).join(" / "),
      status: settlement.status,
      workerName: line.worker.nickname ?? line.worker.username ?? line.workerUserId,
      positionTypeCode: line.positionTypeCode,
      standardMinutes: line.standardMinutes,
      declaredMinutes: line.declaredMinutes ?? line.standardMinutes,
      confirmedMinutes: line.confirmedMinutes,
      ...(canViewDetailedLaborCosts ? {
        hourlyCostCents: line.hourlyCostCentsSnapshot,
        baseCostCents: line.baseCostCents,
        commissionCents: line.commissionCents,
        allowanceCents: line.allowanceCents
      } : {}),
      estimatedMaterialCostCents: settlement.estimatedMaterialCostCents,
      estimatedConstructionCostCents: settlement.estimatedConstructionCostCents,
      actualMaterialCostCents: settlement.actualMaterialCostCents,
      actualConstructionCostCents: settlement.actualConstructionCostCents,
      actualTotalCostCents: settlement.actualTotalCostCents,
      actualGrossMarginBps: settlement.actualGrossMarginBps,
      exceptions: settlement.exceptions.map((exception) => exception.exceptionType).join("、")
    })));
  }

  private async calculateActualMaterialCost(orderId: string) {
    const movements = await this.prisma.inventoryMovement.findMany({ where: { orderId, movementType: { in: [InventoryMovementType.ORDER_OUT, InventoryMovementType.DAMAGE_OUT] } }, include: { batch: { select: { unitCostCents: true } } } });
    return summarizeActualMaterialCost(movements);
  }

  private async find(id: string) {
    const settlement = await this.prisma.constructionCostSettlement.findUnique({ where: { id }, include: settlementInclude });
    if (!settlement) throw new NotFoundException("施工成本结算记录不存在");
    return settlement;
  }

  private assertCanViewCosts(user: UserWithStoreMember, storeId: string) {
    if (!PermissionPolicy.canManageFinance(user, storeId)) throw new ForbiddenException("无权限查看内部成本");
  }

  private assertCanConfirm(user: UserWithStoreMember, storeId: string) {
    if (!PermissionPolicy.isStoreManager(user, storeId)) throw new ForbiddenException("只有店长可以确认施工成本");
  }

  private isFinanceOrAdmin(user: UserWithStoreMember, storeId: string) {
    return Boolean(user.isAuditor || (user.storeMember?.storeId === storeId && user.storeMember.position === "FINANCE"));
  }

  /** 店长确认工时只需人员和工时；个人岗位成本、提成及补贴仅财务/管理员可见。 */
  private presentSettlement<T extends { storeId: string; workerLines: Array<Record<string, unknown>> }>(user: UserWithStoreMember, settlement: T) {
    if (this.canViewDetailedLaborCosts(user, settlement.storeId)) return settlement;
    return {
      ...settlement,
      workerLines: settlement.workerLines.map(({ hourlyCostCentsSnapshot: _hourlyCost, baseCostCents: _baseCost, commissionCents: _commission, allowanceCents: _allowance, ...line }) => line)
    };
  }

  private canViewDetailedLaborCosts(user: UserWithStoreMember, storeId: string) {
    return this.isFinanceOrAdmin(user, storeId);
  }

  private async withStoreMember(user: AuthenticatedConstructionUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private async recordAudit(event: AuditEvent) {
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }
}

type PricingSnapshot = { costEstimate: { standardWorkMinutes?: number | null; positionCostRates?: Array<{ positionTypeCode: string; hourlyCostCents: number }> }; protectionPolicy?: { minimumMarginBps?: number } | null };

function readPricingSnapshot(value: Prisma.JsonValue | null | undefined): PricingSnapshot {
  const snapshot = value && typeof value === "object" ? value as Partial<PricingSnapshot> : {};
  return { costEstimate: snapshot.costEstimate ?? {}, protectionPolicy: snapshot.protectionPolicy ?? null };
}

export function assertConfirmLines(existing: Array<{ workerUserId: string }>, proposed: Array<{ workerUserId: string }>) {
  const existingIds = new Set(existing.map((line) => line.workerUserId));
  const proposedIds = new Set(proposed.map((line) => line.workerUserId));
  if (existingIds.size !== proposed.length || proposedIds.size !== proposed.length || proposed.some((line) => !existingIds.has(line.workerUserId))) throw new BadRequestException("确认工时必须覆盖所有已派工人员且不能重复");
}

export function assertVarianceReasons(existing: Array<{ workerUserId: string; standardMinutes: number }>, proposed: Array<{ workerUserId: string; confirmedMinutes: number; varianceReasonCode?: string }>) {
  const standardMinutesByWorker = new Map(existing.map((line) => [line.workerUserId, line.standardMinutes]));
  const missingReason = proposed.some((line) => line.confirmedMinutes !== standardMinutesByWorker.get(line.workerUserId) && !line.varianceReasonCode?.trim());
  if (missingReason) throw new BadRequestException("确认工时与标准工时不一致时，必须选择偏差原因");
}

/** 手工施工金额必须对所有已派工人员同时填写，并与本单对客施工收费完全一致。 */
export function assertManualConstructionChargeAllocation(
  proposed: Array<{ manualConstructionChargeCents?: number }>,
  constructionChargeCents: number
) {
  const entered = proposed.filter((line) => line.manualConstructionChargeCents != null);
  if (entered.length === 0) return;
  if (entered.length !== proposed.length) throw new BadRequestException("手工分摊施工金额时必须填写每位施工人员的金额");
  const allocated = entered.reduce((sum, line) => sum + (line.manualConstructionChargeCents ?? 0), 0);
  if (allocated !== constructionChargeCents) throw new BadRequestException("手工分摊施工金额合计必须等于本单施工收费");
}

export function summarizeActualMaterialCost(movements: Array<{
  id: string;
  batchId: string;
  productId: string;
  movementType: InventoryMovementType;
  quantity: Prisma.Decimal | number;
  batch: { unitCostCents: number | null };
}>) {
  const lines = movements.map((movement) => {
    const quantity = decimalToNumber(movement.quantity);
    const unitCostCents = movement.batch.unitCostCents;
    return {
      movementId: movement.id,
      batchId: movement.batchId,
      productId: movement.productId,
      movementType: movement.movementType,
      quantity,
      unitCostCents,
      costCents: unitCostCents == null ? 0 : multiplyMoneyCents(unitCostCents, quantity)
    };
  });
  return {
    totalCents: lines.reduce((sum, line) => sum + line.costCents, 0),
    hasMissingCost: lines.some((line) => line.unitCostCents == null),
    missingBatchIds: [...new Set(lines.filter((line) => line.unitCostCents == null).map((line) => line.batchId))],
    lines
  };
}

/** 采购实际入库价补录形成的差异，属于材料而非人工成本。 */
export function isMaterialReceiptCostAdjustment(adjustmentType: string) {
  return adjustmentType === "MATERIAL_RECEIPT_COST_DIFFERENCE";
}

export function isAbnormal(settlement: { workerLines: Array<{ standardMinutes: number; declaredMinutes: number | null }>; estimatedMaterialCostCents: number | null }) {
  return settlement.estimatedMaterialCostCents == null || settlement.workerLines.some((line) => line.declaredMinutes != null && line.declaredMinutes !== line.standardMinutes);
}

export function buildCostException(settlement: { estimatedMaterialCostCents: number | null; estimatedConstructionCostCents: number | null }, actualTotalCostCents: number, actualGrossMarginBps: number, policy?: { minimumMarginBps?: number } | null) {
  const expected = (settlement.estimatedMaterialCostCents ?? 0) + (settlement.estimatedConstructionCostCents ?? 0);
  if (policy?.minimumMarginBps !== undefined && actualGrossMarginBps < policy.minimumMarginBps) return { exceptionType: "ACTUAL_MARGIN_BELOW_THRESHOLD", expectedCents: policy.minimumMarginBps, actualCents: actualGrossMarginBps, varianceCents: actualGrossMarginBps - policy.minimumMarginBps };
  if (actualTotalCostCents > expected) return { exceptionType: "ACTUAL_COST_OVER_ESTIMATE", expectedCents: expected, actualCents: actualTotalCostCents, varianceCents: actualTotalCostCents - expected };
  return null;
}

function decimalToNumber(value: Prisma.Decimal | number | string) {
  return typeof value === "number" ? value : typeof value === "string" ? Number(value) : value.toNumber();
}
