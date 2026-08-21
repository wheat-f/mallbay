import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ConstructionPhotoStage,
  ConstructionTaskStatus,
  CrossStoreTaskStatus,
  LeaveRequestStatus,
  NotificationType,
  OrderStatus,
  Prisma,
  QualityCheckResult,
  StorePosition
} from "@prisma/client";
import type { UserWithStoreMember } from "../../permissions/domain/access-types";
import { AccessContext } from "../../permissions/domain/access-context";
import type {
  AssignOrderDto,
  CompleteConstructionDto,
  QualityCheckDto,
  StartConstructionDto
} from "../../construction/dto/construction.dto";
import { ensureBalanceTodos } from "../domain/order-delivery";
import type { OrderLifecycleCommand } from "../domain/order-lifecycle";
import { multiplyMoneyCents } from "../../pricing/domain/money";

type OrderHeader = {
  id: string;
  storeId: string;
  executionStoreId: string | null;
  salesPersonId: string;
  status: OrderStatus;
  lifecycleVersion: number;
};

export type ConstructionLifecycleExecution = {
  payload: Record<string, unknown>;
  applied: boolean;
};

/**
 * Transaction-scoped implementation behind OrderLifecycle.
 *
 * It intentionally is not exported by a Nest module: transports learn only
 * OrderLifecycle, while this implementation owns construction state writes.
 */
@Injectable()
export class ConstructionLifecycleImplementation {
  constructor(private readonly accessContext: AccessContext) {}

  async assertAccess(
    tx: Prisma.TransactionClient,
    actor: UserWithStoreMember,
    order: Pick<OrderHeader, "id" | "executionStoreId" | "storeId">,
    command: Extract<OrderLifecycleCommand, { type: "DISPATCH" | "START_CONSTRUCTION" | "COMPLETE_CONSTRUCTION" | "QUALITY_CHECK" }>
  ) {
    const executionStoreId = order.executionStoreId ?? order.storeId;
    if (command.type === "DISPATCH" || command.type === "QUALITY_CHECK") {
      if (!await this.accessContext.can({ userId: actor.id }, "construction", "write", { storeId: executionStoreId })) {
        throw new ForbiddenException("无权限");
      }
      return;
    }
    const assignment = await tx.constructionAssignment.findFirst({
      where: { orderId: order.id, workerUserId: actor.id },
      select: { id: true }
    });
    if (assignment) return;
    if (!await this.accessContext.can({ userId: actor.id }, "construction", "write", { storeId: executionStoreId })) {
      throw new ForbiddenException("无权限");
    }
  }

  async execute(
    tx: Prisma.TransactionClient,
    actor: UserWithStoreMember,
    order: OrderHeader,
    command: OrderLifecycleCommand,
    expectedVersion: number
  ): Promise<ConstructionLifecycleExecution> {
    if (command.type === "DISPATCH") {
      return this.dispatch(tx, actor, order, command.input as AssignOrderDto, expectedVersion);
    }
    if (command.type === "START_CONSTRUCTION") {
      return this.start(tx, actor, order, command.input as StartConstructionDto, expectedVersion);
    }
    if (command.type === "COMPLETE_CONSTRUCTION") {
      return this.complete(tx, actor, order, command.input as CompleteConstructionDto, expectedVersion);
    }
    if (command.type === "QUALITY_CHECK") return this.qualityCheck(tx, actor, order, command.recordId, command.input as QualityCheckDto, expectedVersion);
    if (!("taskId" in command)) throw new BadRequestException("不支持的施工生命周期命令");
    return this.crossStore(tx, actor, order, command, expectedVersion);
  }

  private async crossStore(
    tx: Prisma.TransactionClient,
    actor: UserWithStoreMember,
    order: OrderHeader,
    command: Extract<OrderLifecycleCommand, { taskId: string }>,
    expectedVersion: number
  ): Promise<ConstructionLifecycleExecution> {
    const task = await tx.crossStoreConstructionTask.findUnique({ where: { id: command.taskId } });
    if (!task || task.orderId !== order.id) throw new NotFoundException("跨门店施工任务不存在");
    if (task.version !== command.taskVersion) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "跨店任务已被其他操作更新，请刷新后重试" });
    const now = new Date();
    let targetStatus: CrossStoreTaskStatus;
    let allowed: CrossStoreTaskStatus[];
    let data: Prisma.CrossStoreConstructionTaskUpdateManyMutationInput;
    let notificationStoreId: string;
    let notificationType: NotificationType;
    if (command.type === "ACCEPT_CROSS_STORE_TASK") {
      targetStatus = CrossStoreTaskStatus.READY_TO_DISPATCH;
      allowed = [CrossStoreTaskStatus.PENDING_ACCEPTANCE];
      data = { status: targetStatus, acceptedById: actor.id, acceptedAt: now, rejectionReason: null };
      notificationStoreId = task.sourceStoreId; notificationType = NotificationType.CROSS_STORE_TASK_ACCEPTED;
    } else if (command.type === "REJECT_CROSS_STORE_TASK") {
      targetStatus = CrossStoreTaskStatus.REJECTED;
      allowed = [CrossStoreTaskStatus.PENDING_ACCEPTANCE];
      data = { status: targetStatus, rejectionReason: command.input.reason.trim() };
      notificationStoreId = task.sourceStoreId; notificationType = NotificationType.CROSS_STORE_TASK_REJECTED;
    } else if (command.type === "CANCEL_CROSS_STORE_TASK") {
      targetStatus = CrossStoreTaskStatus.CANCELLED;
      allowed = [CrossStoreTaskStatus.PENDING_ACCEPTANCE, CrossStoreTaskStatus.READY_TO_DISPATCH, CrossStoreTaskStatus.DISPATCHED];
      data = { status: targetStatus, cancellationReason: command.input.reason.trim(), cancelledById: actor.id, cancelledAt: now };
      notificationStoreId = task.executionStoreId; notificationType = NotificationType.CROSS_STORE_TASK_CANCELLED;
    } else if (command.type === "SUBMIT_CROSS_STORE_ACCEPTANCE") {
      targetStatus = CrossStoreTaskStatus.PENDING_SOURCE_ACCEPTANCE;
      allowed = [CrossStoreTaskStatus.DISPATCHED, CrossStoreTaskStatus.IN_CONSTRUCTION];
      data = { status: targetStatus, submittedForAcceptanceAt: now, requirementsSnapshot: mergeSnapshotRemark(task.requirementsSnapshot, command.input.remark) };
      notificationStoreId = task.sourceStoreId; notificationType = NotificationType.CROSS_STORE_TASK_SUBMITTED;
    } else {
      targetStatus = CrossStoreTaskStatus.COMPLETED;
      allowed = [CrossStoreTaskStatus.PENDING_SOURCE_ACCEPTANCE];
      data = { status: targetStatus, sourceAcceptedById: actor.id, completedAt: now };
      notificationStoreId = task.executionStoreId; notificationType = NotificationType.CROSS_STORE_TASK_COMPLETED;
    }
    if (task.status === targetStatus) return { payload: { taskId: task.id, status: task.status, outcome: "ALREADY_SATISFIED" }, applied: false };
    if (!allowed.includes(task.status)) throw new BadRequestException({ code: "COMMAND_PRECONDITION_FAILED", message: "跨店任务当前状态不允许该操作" });
    await this.advanceOrder(tx, order.id, expectedVersion, order.status, {});
    const updated = await tx.crossStoreConstructionTask.updateMany({
      where: { id: task.id, version: command.taskVersion, status: { in: allowed } },
      data: { ...data, version: { increment: 1 } }
    });
    if (updated.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "跨店任务已被其他操作更新，请刷新后重试" });
    const recipients = await tx.storeMember.findMany({ where: { storeId: notificationStoreId, position: { in: [StorePosition.MANAGER, StorePosition.SCHEDULER] } }, select: { userId: true } });
    await tx.notification.createMany({ data: recipients.map(({ userId }) => ({ userId, type: notificationType, todoKey: `${userId}:${task.id}:${command.type}`, payload: { taskId: task.id, orderId: order.id } })), skipDuplicates: true });
    await this.audit(tx, actor.id, order, command.type, { taskId: task.id, beforeStatus: task.status, afterStatus: targetStatus });
    return { payload: { taskId: task.id, status: targetStatus, outcome: "APPLIED" }, applied: true };
  }

  private async dispatch(
    tx: Prisma.TransactionClient,
    actor: UserWithStoreMember,
    order: OrderHeader,
    dto: AssignOrderDto,
    expectedVersion: number
  ): Promise<ConstructionLifecycleExecution> {
    const workerIds = [...new Set(dto.workerUserIds)].sort();
    if (workerIds.length < 1 || workerIds.length > 3) {
      throw new BadRequestException("施工人员必须为 1 到 3 人");
    }
    const existing = await tx.constructionRecord.findUnique({
      where: { orderId: order.id },
      include: { assignments: { select: { workerUserId: true } } }
    });
    if (existing) {
      const existingIds = existing.assignments.map((item) => item.workerUserId).sort();
      if (existing.status === ConstructionTaskStatus.DISPATCHED && sameStrings(existingIds, workerIds)) {
        return { payload: { orderId: order.id, constructionRecordId: existing.id, status: existing.status, outcome: "ALREADY_SATISFIED" }, applied: false };
      }
      throw new BadRequestException({ code: "COMMAND_PRECONDITION_FAILED", message: "该订单已有不同的施工派工事实，请刷新后处理" });
    }
    if (order.status !== OrderStatus.PENDING_DISPATCH) {
      throw new BadRequestException({ code: "COMMAND_PRECONDITION_FAILED", message: "只有待派单订单可以派单" });
    }

    const executionStoreId = order.executionStoreId ?? order.storeId;
    const executionStore = order.storeId === executionStoreId
      ? await tx.store.findUnique({ where: { id: order.storeId }, select: { financialEntityId: true } })
      : await tx.store.findUnique({ where: { id: executionStoreId }, select: { financialEntityId: true } });
    if (!executionStore) throw new NotFoundException("执行门店不存在");
    const members = await tx.storeMember.findMany({
      where: {
        userId: { in: workerIds },
        position: { in: [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE] },
        store: { financialEntityId: executionStore.financialEntityId }
      },
      select: { userId: true }
    });
    if (members.length !== workerIds.length) {
      throw new BadRequestException("施工人员必须属于同一财务主体内的有效施工岗位");
    }
    const appointmentDate = await tx.order.findUnique({ where: { id: order.id }, select: { appointmentDate: true } });
    const assignmentDate = appointmentDate?.appointmentDate ?? new Date();
    const leave = await tx.leaveRequest.findFirst({
      where: {
        workerId: { in: workerIds },
        status: LeaveRequestStatus.APPROVED,
        startDate: { lte: assignmentDate },
        endDate: { gte: assignmentDate }
      },
      select: { id: true }
    });
    if (leave) throw new BadRequestException("施工人员请假中，不能派单");

    await this.advanceOrder(tx, order.id, expectedVersion, OrderStatus.PENDING_DISPATCH, { status: OrderStatus.DISPATCHED });
    const record = await tx.constructionRecord.create({
      data: { storeId: executionStoreId, orderId: order.id, dispatchedById: actor.id, status: ConstructionTaskStatus.DISPATCHED }
    });
    await tx.constructionAssignment.createMany({
      data: workerIds.map((workerUserId) => ({ recordId: record.id, orderId: order.id, workerUserId }))
    });
    if (order.storeId !== executionStoreId) {
      const task = await tx.crossStoreConstructionTask.updateMany({
        where: { orderId: order.id, status: CrossStoreTaskStatus.READY_TO_DISPATCH },
        data: { status: CrossStoreTaskStatus.DISPATCHED, dispatchedAt: new Date(), version: { increment: 1 } }
      });
      if (task.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "跨店任务已被其他操作更新，请刷新后重试" });
    }
    await this.audit(tx, actor.id, order, "CONSTRUCTION_DISPATCHED", { constructionRecordId: record.id, workerUserIds: workerIds });
    return { payload: { orderId: order.id, constructionRecordId: record.id, status: record.status, outcome: "APPLIED" }, applied: true };
  }

  private async start(
    tx: Prisma.TransactionClient,
    actor: UserWithStoreMember,
    order: OrderHeader,
    dto: StartConstructionDto,
    expectedVersion: number
  ): Promise<ConstructionLifecycleExecution> {
    const record = await tx.constructionRecord.findUnique({ where: { orderId: order.id }, include: { assignments: true } });
    if (!record) throw new NotFoundException("施工记录不存在");
    const requestedStartedAt = dto.startedAt ? new Date(dto.startedAt) : null;
    if (record.startedAt || record.status === ConstructionTaskStatus.IN_CONSTRUCTION) {
      if (!requestedStartedAt || (record.startedAt && record.startedAt.getTime() === requestedStartedAt.getTime())) {
        return { payload: { orderId: order.id, constructionRecordId: record.id, status: record.status, startedAt: record.startedAt, outcome: "ALREADY_SATISFIED" }, applied: false };
      }
      throw new BadRequestException({ code: "COMMAND_PRECONDITION_FAILED", message: "施工已按不同开工时间开始，不能覆盖" });
    }
    if (order.status !== OrderStatus.DISPATCHED || record.status !== ConstructionTaskStatus.DISPATCHED) {
      throw new BadRequestException({ code: "COMMAND_PRECONDITION_FAILED", message: "只有已派单订单可以开工" });
    }
    await this.assertMaterialsPickedUp(tx, order.id);
    const startedAt = requestedStartedAt ?? new Date();
    await this.advanceOrder(tx, order.id, expectedVersion, OrderStatus.DISPATCHED, { status: OrderStatus.IN_CONSTRUCTION });
    await tx.constructionRecord.update({ where: { id: record.id }, data: { startedAt, status: ConstructionTaskStatus.IN_CONSTRUCTION } });
    if (order.storeId !== (order.executionStoreId ?? order.storeId)) {
      const task = await tx.crossStoreConstructionTask.updateMany({
        where: { orderId: order.id, status: CrossStoreTaskStatus.DISPATCHED },
        data: { status: CrossStoreTaskStatus.IN_CONSTRUCTION, constructionStartedAt: startedAt, version: { increment: 1 } }
      });
      if (task.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "跨店任务已被其他操作更新，请刷新后重试" });
    }
    await this.audit(tx, actor.id, order, "CONSTRUCTION_STARTED", { constructionRecordId: record.id, startedAt: startedAt.toISOString() });
    return { payload: { orderId: order.id, constructionRecordId: record.id, status: ConstructionTaskStatus.IN_CONSTRUCTION, startedAt, outcome: "APPLIED" }, applied: true };
  }

  private async complete(
    tx: Prisma.TransactionClient,
    actor: UserWithStoreMember,
    order: OrderHeader,
    dto: CompleteConstructionDto,
    expectedVersion: number
  ): Promise<ConstructionLifecycleExecution> {
    const record = await tx.constructionRecord.findUnique({
      where: { orderId: order.id },
      include: { assignments: true, photos: true }
    });
    if (!record) throw new NotFoundException("施工记录不存在");
    const requestedCompletedAt = dto.completedAt ? new Date(dto.completedAt) : null;
    if (record.status === ConstructionTaskStatus.COMPLETED) {
      const obligations = await Promise.all([
        tx.workerCommissionSnapshot.count({ where: { recordId: record.id } }),
        tx.constructionCostSettlement.count({ where: { constructionRecordId: record.id } })
      ]);
      if (obligations[0] !== record.assignments.length || obligations[1] !== 1) {
        throw new ConflictException({ code: "HISTORICAL_VERIFICATION_REQUIRED", message: "完工同步事实不完整，已转入核验，不能在重试中补写" });
      }
      if (!requestedCompletedAt || (record.completedAt && record.completedAt.getTime() === requestedCompletedAt.getTime())) {
        return { payload: { orderId: order.id, constructionRecordId: record.id, status: record.status, completedAt: record.completedAt, outcome: "ALREADY_SATISFIED" }, applied: false };
      }
      throw new BadRequestException({ code: "COMMAND_PRECONDITION_FAILED", message: "施工已按不同完工时间完成，不能覆盖" });
    }
    if (order.status !== OrderStatus.IN_CONSTRUCTION || record.status !== ConstructionTaskStatus.IN_CONSTRUCTION) {
      throw new BadRequestException({ code: "COMMAND_PRECONDITION_FAILED", message: "只有施工中或返工中的订单可以完工" });
    }
    const stages = new Set(record.photos.map((photo) => photo.stage));
    if (!stages.has(ConstructionPhotoStage.BEFORE)) {
      throw new BadRequestException({ code: "BEFORE_EVIDENCE_REQUIRED", message: "完工前必须上传施工前照片" });
    }
    if (!stages.has(ConstructionPhotoStage.AFTER)) {
      throw new BadRequestException({ code: "AFTER_EVIDENCE_REQUIRED", message: "完工前必须上传施工后照片" });
    }
    await this.assertMaterialsPickedUp(tx, order.id);
    const completedAt = requestedCompletedAt ?? new Date();
    const startedAt = record.startedAt ?? completedAt;
    const actualMinutes = Math.max(0, Math.round((completedAt.getTime() - startedAt.getTime()) / 60000));
    const overtimeMinutes = Math.max(0, actualMinutes - 8 * 60);
    await this.advanceOrder(tx, order.id, expectedVersion, OrderStatus.IN_CONSTRUCTION, {});
    await tx.constructionRecord.update({
      where: { id: record.id },
      data: { status: ConstructionTaskStatus.COMPLETED, completedAt, actualMinutes, overtimeMinutes }
    });
    const isCrossStore = order.storeId !== (order.executionStoreId ?? order.storeId);
    if (isCrossStore) {
      const task = await tx.crossStoreConstructionTask.updateMany({
        where: { orderId: order.id, status: { in: [CrossStoreTaskStatus.DISPATCHED, CrossStoreTaskStatus.IN_CONSTRUCTION] } },
        data: { status: CrossStoreTaskStatus.PENDING_SOURCE_ACCEPTANCE, submittedForAcceptanceAt: completedAt, version: { increment: 1 } }
      });
      if (task.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "跨店任务已被其他操作更新，请刷新后重试" });
    }
    if (record.qualityResult !== QualityCheckResult.REWORK_REQUIRED) {
      await this.createCommissionSnapshots(tx, actor.id, order.id, record.id, record.assignments.map((item) => item.workerUserId));
      await this.createCostSettlement(tx, order.id, record.id, record.storeId, record.assignments.map((item) => item.workerUserId));
    } else {
      const [snapshotCount, settlementCount] = await Promise.all([
        tx.workerCommissionSnapshot.count({ where: { recordId: record.id } }),
        tx.constructionCostSettlement.count({ where: { constructionRecordId: record.id } })
      ]);
      if (snapshotCount !== record.assignments.length || settlementCount !== 1) {
        throw new ConflictException({ code: "HISTORICAL_VERIFICATION_REQUIRED", message: "返工订单的首次完工同步事实不完整，不能继续推进" });
      }
    }
    if (isCrossStore) {
      const recipients = await tx.storeMember.findMany({ where: { storeId: order.storeId, position: StorePosition.MANAGER }, select: { userId: true } });
      await tx.notification.createMany({
        data: recipients.map(({ userId }) => ({
          userId,
          type: NotificationType.CROSS_STORE_TASK_SUBMITTED,
          todoKey: `${userId}:${order.id}:CROSS_STORE_TASK_SUBMITTED:${record.id}`,
          payload: { orderId: order.id, constructionRecordId: record.id }
        })),
        skipDuplicates: true
      });
    }
    await this.audit(tx, actor.id, order, "CONSTRUCTION_COMPLETED", { constructionRecordId: record.id, completedAt: completedAt.toISOString() });
    return { payload: { orderId: order.id, constructionRecordId: record.id, status: ConstructionTaskStatus.COMPLETED, completedAt, outcome: "APPLIED" }, applied: true };
  }

  private async qualityCheck(
    tx: Prisma.TransactionClient,
    actor: UserWithStoreMember,
    order: OrderHeader,
    recordId: string,
    dto: QualityCheckDto,
    expectedVersion: number
  ): Promise<ConstructionLifecycleExecution> {
    const record = await tx.constructionRecord.findUnique({ where: { id: recordId } });
    if (!record || record.orderId !== order.id) throw new NotFoundException("施工记录不存在");
    if (record.status !== ConstructionTaskStatus.COMPLETED) {
      throw new BadRequestException({ code: "COMMAND_PRECONDITION_FAILED", message: "只有已完工待质检的任务可以质检" });
    }
    // A new command is a new business intent. Once a record has passed
    // quality, accepting another PASS/REWORK command would append a second
    // history row and mutate the same fact without a new rework cycle. Same
    // command retries are handled by OrderLifecycle's command replay before
    // reaching this implementation.
    if (record.qualityResult === QualityCheckResult.PASS) {
      throw new BadRequestException({ code: "COMMAND_PRECONDITION_FAILED", message: "质检已通过，必须先发生返工并重新完工后才能复检" });
    }
    if (dto.result === QualityCheckResult.REWORK_REQUIRED) {
      if (!dto.note?.trim()) throw new BadRequestException("质检不通过必须填写返工原因");
      if (!dto.responsibilityType?.trim()) throw new BadRequestException("质检不通过必须填写责任类型");
    }
    await this.advanceOrder(tx, order.id, expectedVersion, OrderStatus.IN_CONSTRUCTION, {
      ...(dto.result === QualityCheckResult.REWORK_REQUIRED ? { status: OrderStatus.IN_CONSTRUCTION } : {})
    });
    const checkedAt = new Date();
    const isRecheck = record.qualityResult === QualityCheckResult.REWORK_REQUIRED;
    await tx.constructionRecord.update({
      where: { id: record.id },
      data: dto.result === QualityCheckResult.REWORK_REQUIRED
        ? {
          qualityResult: dto.result,
          qualityNote: dto.note,
          qualityCheckedById: actor.id,
          qualityCheckedAt: checkedAt,
          status: ConstructionTaskStatus.IN_CONSTRUCTION,
          reworkCount: { increment: 1 },
          currentReworkReason: dto.note!.trim(),
          currentResponsibilityType: dto.responsibilityType!.trim()
        }
        : {
          qualityResult: dto.result,
          qualityNote: dto.note,
          qualityCheckedById: actor.id,
          qualityCheckedAt: checkedAt,
          status: ConstructionTaskStatus.COMPLETED,
          currentReworkReason: null,
          currentResponsibilityType: null
        }
    });
    await tx.constructionQualityHistory.create({
      data: {
        storeId: record.storeId,
        recordId: record.id,
        orderId: order.id,
        result: dto.result,
        note: dto.note?.trim() || null,
        responsibilityType: dto.responsibilityType?.trim() || null,
        checkedById: actor.id,
        checkedAt
      }
    });
    if (dto.result === QualityCheckResult.PASS) await ensureBalanceTodos(tx, order.id);
    const actions = dto.result === QualityCheckResult.REWORK_REQUIRED
      ? ["QUALITY_CHECK_FAILED", "REWORK_STARTED"]
      : (isRecheck ? ["REWORK_COMPLETED", "QUALITY_RECHECKED"] : ["QUALITY_CHECK_PASSED"]);
    for (const action of actions) {
      await this.audit(tx, actor.id, order, action, { constructionRecordId: record.id, result: dto.result });
    }
    return { payload: { orderId: order.id, constructionRecordId: record.id, result: dto.result, checkedAt, outcome: "APPLIED" }, applied: true };
  }

  private async advanceOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    expectedVersion: number,
    expectedStatus: OrderStatus,
    data: Prisma.OrderUpdateManyMutationInput
  ) {
    const updated = await tx.order.updateMany({
      where: { id: orderId, lifecycleVersion: expectedVersion, status: expectedStatus },
      data: { ...data, lifecycleVersion: { increment: 1 } }
    });
    if (updated.count !== 1) {
      throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "订单已被其他操作更新，请刷新后重试" });
    }
  }

  private async assertMaterialsPickedUp(tx: Prisma.TransactionClient, orderId: string) {
    const allocations = await tx.orderInventoryAllocation.findMany({ where: { orderId, status: "LOCKED" }, select: { id: true } });
    if (!allocations.length) return;
    const movements = await tx.inventoryMovement.findMany({
      where: { orderId, sourceType: "CONSTRUCTION_MATERIAL_PICKUP", sourceId: { in: allocations.map((item) => item.id) } },
      select: { sourceId: true }
    });
    const picked = new Set(movements.map((item) => item.sourceId).filter(Boolean));
    if (picked.size !== allocations.length) {
      throw new BadRequestException({ code: "MATERIAL_PICKUP_REQUIRED", message: "请先领取已锁定的施工物料" });
    }
  }

  private async createCommissionSnapshots(
    tx: Prisma.TransactionClient,
    actorId: string,
    orderId: string,
    recordId: string,
    workerIds: string[]
  ) {
    const commissions = workerIds.length ? await tx.workerCommission.findMany({
      where: { orderId, workerUserId: { in: workerIds } },
      select: { workerUserId: true, finalAmountCents: true, calculationNote: true }
    }) : [];
    const byWorker = new Map(commissions.map((item) => [item.workerUserId, item]));
    await tx.workerCommissionSnapshot.createMany({
      data: workerIds.map((workerUserId) => ({
        recordId,
        orderId,
        workerUserId,
        amountCents: byWorker.get(workerUserId)?.finalAmountCents ?? 0,
        calculationNote: byWorker.get(workerUserId)?.calculationNote ?? "完工时尚无个人提成，成本确认时以财务维护的实际提成为准",
        createdById: actorId
      }))
    });
  }

  private async createCostSettlement(
    tx: Prisma.TransactionClient,
    orderId: string,
    recordId: string,
    storeId: string,
    workerIds: string[]
  ) {
    const orderAmount = await tx.orderAmount.findUnique({ where: { orderId } });
    const snapshot = readPricingSnapshot(orderAmount?.pricingOutputSnapshot);
    const standardWorkMinutes = snapshot.costEstimate.standardWorkMinutes ?? 0;
    const members = workerIds.length ? await tx.storeMember.findMany({
      where: { userId: { in: workerIds } },
      select: { userId: true, position: true }
    }) : [];
    const commissions = workerIds.length ? await tx.workerCommissionSnapshot.findMany({
      where: { recordId, workerUserId: { in: workerIds } },
      select: { workerUserId: true, amountCents: true }
    }) : [];
    const memberByUser = new Map(members.map((item) => [item.userId, item]));
    const commissionByUser = new Map(commissions.map((item) => [item.workerUserId, item.amountCents]));
    const rates = new Map((snapshot.costEstimate.positionCostRates ?? []).map((item) => [item.positionTypeCode, item.hourlyCostCents]));
    const minutesPerWorker = workerIds.length ? Math.ceil(standardWorkMinutes / workerIds.length) : 0;
    await tx.constructionCostSettlement.create({
      data: {
        storeId,
        orderId,
        constructionRecordId: recordId,
        standardWorkMinutes,
        confirmedWorkMinutes: standardWorkMinutes,
        estimatedMaterialCostCents: orderAmount?.estimatedMaterialCostCents ?? null,
        estimatedConstructionCostCents: orderAmount?.estimatedConstructionCostCents ?? null,
        sourceSnapshot: {
          pricingCalculationId: orderAmount?.pricingCalculationId ?? null,
          costEstimate: snapshot.costEstimate,
          protectionPolicy: snapshot.protectionPolicy
        } as Prisma.InputJsonValue,
        workerLines: {
          create: workerIds.map((workerUserId) => {
            const positionTypeCode = memberByUser.get(workerUserId)?.position ?? "CONSTRUCTION";
            const hourlyCostCentsSnapshot = rates.get(positionTypeCode) ?? 0;
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
      }
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    order: Pick<OrderHeader, "id" | "storeId">,
    action: string,
    metadata: Prisma.InputJsonObject
  ) {
    return tx.auditEvent.create({
      data: { action, actorId, storeId: order.storeId, targetType: "order", targetId: order.id, metadata }
    });
  }
}

function sameStrings(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

type PricingSnapshot = {
  costEstimate: {
    standardWorkMinutes?: number | null;
    positionCostRates?: Array<{ positionTypeCode: string; hourlyCostCents: number }>;
  };
  protectionPolicy?: { minimumMarginBps?: number } | null;
};

function readPricingSnapshot(value: Prisma.JsonValue | null | undefined): PricingSnapshot {
  const snapshot = value && typeof value === "object" ? value as Partial<PricingSnapshot> : {};
  return { costEstimate: snapshot.costEstimate ?? {}, protectionPolicy: snapshot.protectionPolicy ?? null };
}

function mergeSnapshotRemark(snapshot: Prisma.JsonValue, remark: string): Prisma.InputJsonValue {
  const base = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot as Prisma.JsonObject : {};
  return { ...base, executionAcceptanceRemark: remark.trim() };
}
