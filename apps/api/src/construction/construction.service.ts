/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  ConstructionPhotoStage,
  ConstructionTaskStatus,
  CrossStoreTaskStatus,
  InventoryMovementType,
  LeaveRequestStatus,
  NotificationType,
  OrderStatus,
  Prisma,
  QualityCheckResult,
  StorePosition
} from "@prisma/client";
import type { UserWithStoreMember } from "../permissions/domain/access-types";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import type { MulterFile } from "../users/multer-file.type";
import { OssService } from "../users/oss.service";
import { ConstructionCostSettlementService } from "./construction-cost-settlement.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationDispatcher } from "../notifications/notification-dispatcher";
import { ensureBalanceTodos } from "../orders/domain/order-delivery";
import { OrderLifecycle } from "../orders/domain/order-lifecycle";
import {
  AssignOrderDto,
  CompleteConstructionDto,
  LeaveRequestDto,
  ListConstructionDto,
  OfflineLeavePayloadDto,
  OfflinePhotoPayloadDto,
  OfflineSyncDto,
  OfflineSyncOperationDto,
  OfflineTaskStatusPayloadDto,
  PickupConstructionMaterialDto,
  QualityCheckDto,
  RecordMaterialLossDto,
  StartConstructionDto,
  UpdateDailyCapacityDto,
  UpdateLeaveRequestDto,
  UploadConstructionPhotoDto,
  UpsertDailyCapacityDto,
  UpsertScheduleDto,
  UpsertWorkerProfileDto,
  VerifyMaterialBatchDto
} from "./dto/construction.dto";

export type AuthenticatedConstructionUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class ConstructionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(OssService) private readonly oss?: OssService,
    @Optional() private readonly costSettlements?: ConstructionCostSettlementService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly orderLifecycle?: OrderLifecycle,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcher,
    @Optional() private readonly accessContext?: AccessContext
  ) {
    this.orderLifecycle?.registerConstructionHandler(async (actor, orderId, command) => {
      if (command.type === "DISPATCH") return this.assignOrderInternal(actor, orderId, command.input as AssignOrderDto);
      if (command.type === "START_CONSTRUCTION") return this.startOrderInternal(actor, orderId, command.input as StartConstructionDto);
      if (command.type === "COMPLETE_CONSTRUCTION") return this.completeOrderForOrderInternal(actor, orderId, command.input as CompleteConstructionDto);
      if (command.type === "QUALITY_CHECK") return this.qualityCheckInternal(actor, command.recordId, command.input as QualityCheckDto);
      throw new BadRequestException("不支持的施工履约状态");
    });
  }

  private canAccess(actor: AuthenticatedConstructionUser | UserWithStoreMember, capability: string, action: string, storeId: string, ownerId?: string) {
    if (!this.accessContext) throw new Error("ConstructionService access context is not configured");
    return this.accessContext.can(actor.id, capability, action, { storeId, ownerId });
  }

  async listCapacities(user: AuthenticatedConstructionUser, query: ListConstructionDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "construction", "read", query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.dailyCapacity.findMany({
      where: {
        storeId: query.storeId,
        date: buildDateRange(query.from, query.to)
      },
      orderBy: { date: "asc" },
      include: { reservations: { select: { id: true, sourceType: true, status: true, expiresAt: true, quoteId: true, orderId: true } } }
    });
  }

  async upsertCapacity(user: AuthenticatedConstructionUser, dto: UpsertDailyCapacityDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "construction", "write", dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const date = normalizeDate(dto.date);
    return this.prisma.dailyCapacity.upsert({
      where: { storeId_date: { storeId: dto.storeId, date } },
      create: {
        storeId: dto.storeId,
        date,
        inStoreCapacity: dto.inStoreCapacity,
        outsideCapacity: dto.outsideCapacity,
        heatFilmCapacity: dto.heatFilmCapacity,
        inspectionCapacity: dto.inspectionCapacity
      },
      update: {
        inStoreCapacity: dto.inStoreCapacity,
        outsideCapacity: dto.outsideCapacity,
        heatFilmCapacity: dto.heatFilmCapacity,
        inspectionCapacity: dto.inspectionCapacity
      }
    });
  }

  async updateCapacity(user: AuthenticatedConstructionUser, id: string, dto: UpdateDailyCapacityDto) {
    const actor = await this.withStoreMember(user);
    const capacity = await this.prisma.dailyCapacity.findUnique({ where: { id } });
    if (!capacity) {
      throw new NotFoundException("施工容量不存在");
    }
    if (!await this.canAccess(actor, "construction", "write", capacity.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.dailyCapacity.update({ where: { id }, data: dto });
  }

  async listAssignments(user: AuthenticatedConstructionUser, query: ListConstructionDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "construction", "read", query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const where: Prisma.ConstructionRecordWhereInput = { storeId: query.storeId };
    const roles = await this.rolesFor(actor, query.storeId);
    if (roles.has("SALES")) where.order = { salesPersonId: actor.id };
    if (roles.has("CONSTRUCTION") || roles.has("APPRENTICE")) where.assignments = { some: { workerUserId: actor.id } };
    return this.prisma.constructionRecord.findMany({
      where,
      orderBy: { dispatchedAt: "desc" },
      include: constructionRecordInclude
    });
  }

  async assignOrder(user: AuthenticatedConstructionUser, orderId: string, dto: AssignOrderDto) {
    const actor = await this.withStoreMember(user);
    if (this.orderLifecycle) {
      return this.orderLifecycle.transition(actor, orderId, { type: "DISPATCH", input: dto });
    }
    return this.assignOrderInternal(actor, orderId, dto);
  }

  private async assignOrderInternal(actor: UserWithStoreMember, orderId: string, dto: AssignOrderDto) {
    const workerIds = [...new Set(dto.workerUserIds)];
    if (workerIds.length < 1 || workerIds.length > 3) {
      throw new BadRequestException("施工人员必须为 1 到 3 人");
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException("订单不存在");
      }
      const executionStoreId = order.executionStoreId ?? order.storeId;
      if (!await this.canAccess(actor, "construction", "write", executionStoreId)) {
        throw new ForbiddenException("无权限");
      }
      if (order.status !== OrderStatus.PENDING_DISPATCH) {
        throw new BadRequestException("只有待派单订单可以派单");
      }
      const existingRecord = await tx.constructionRecord.findUnique({
        where: { orderId },
        select: { id: true }
      });
      if (existingRecord) {
        throw new BadRequestException("该订单已生成施工工单，请刷新施工列表");
      }

      const executionStore = order.storeId === executionStoreId
        ? { financialEntityId: "" }
        : await tx.store.findUnique({
          where: { id: executionStoreId },
          select: { financialEntityId: true }
        });
      if (!executionStore) {
        throw new NotFoundException("执行门店不存在");
      }
      const members = await tx.storeMember.findMany({
        where: {
          userId: { in: workerIds },
          position: { in: [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE] },
          store: { financialEntityId: executionStore.financialEntityId }
        }
      });
      if (members.length !== workerIds.length) {
        throw new BadRequestException("施工人员必须属于同一财务主体内的有效施工岗位");
      }

      const assignmentDate = order.appointmentDate ?? new Date();
      for (const workerId of workerIds) {
        const leave = await tx.leaveRequest.findFirst({
          where: {
            workerId,
            status: LeaveRequestStatus.APPROVED,
            startDate: { lte: assignmentDate },
            endDate: { gte: assignmentDate }
          }
        });
        if (leave) {
          throw new BadRequestException("施工人员请假中，不能派单");
        }
      }

      const record = await tx.constructionRecord.create({
        data: {
          storeId: executionStoreId,
          orderId,
          dispatchedById: actor.id,
          status: ConstructionTaskStatus.DISPATCHED
        }
      });
      await tx.constructionAssignment.createMany({
        data: workerIds.map((workerUserId) => ({
          recordId: record.id,
          orderId,
          workerUserId
        }))
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DISPATCHED }
      });
      if (order.storeId !== executionStoreId) {
        await tx.crossStoreConstructionTask.updateMany({
          where: { orderId, status: CrossStoreTaskStatus.READY_TO_DISPATCH },
          data: {
            status: CrossStoreTaskStatus.DISPATCHED,
            dispatchedAt: new Date(),
            version: { increment: 1 }
          }
        });
      }
      return record;
    });
  }

  async startOrder(user: AuthenticatedConstructionUser, orderId: string, dto: StartConstructionDto = {}) {
    const actor = await this.withStoreMember(user);
    if (this.orderLifecycle) {
      return this.orderLifecycle.transition(actor, orderId, { type: "START_CONSTRUCTION", input: dto });
    }
    return this.startOrderInternal(actor, orderId, dto);
  }

  private async startOrderInternal(actor: UserWithStoreMember, orderId: string, dto: StartConstructionDto = {}) {
    const record = await this.findRecordForOrder(orderId);
    await this.assertAssignedWorker(actor, record);
    if (record.order.status !== OrderStatus.DISPATCHED) {
      throw new BadRequestException("只有已派单订单可以开工");
    }
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: OrderStatus.IN_CONSTRUCTION } });
      await tx.crossStoreConstructionTask.updateMany({
        where: { orderId, status: CrossStoreTaskStatus.DISPATCHED },
        data: {
          status: CrossStoreTaskStatus.IN_CONSTRUCTION,
          constructionStartedAt: startedAt,
          version: { increment: 1 }
        }
      });
      return tx.constructionRecord.update({
        where: { id: record.id },
        data: { startedAt, status: ConstructionTaskStatus.IN_CONSTRUCTION }
      });
    });
  }

  async uploadPhoto(
    user: AuthenticatedConstructionUser,
    recordId: string,
    dto: UploadConstructionPhotoDto,
    file?: MulterFile
  ) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecord(recordId);
    const assignedWorkerId = this.getAssignedWorkerId(actor.id, record);
    if (
      assignedWorkerId !== actor.id &&
      !(await this.canAccess(actor, "construction", "write", record.storeId)) &&
      !(await this.canAccess(actor, "construction", "write", record.storeId, assignedWorkerId))
    ) {
      throw new ForbiddenException("无权限");
    }
    const url = dto.url ?? (file ? await this.oss?.uploadConstructionPhoto(record.storeId, record.orderId, file) : undefined);
    if (!url) {
      throw new BadRequestException("请上传施工照片");
    }
    return this.prisma.constructionPhoto.create({
      data: {
        recordId,
        stage: dto.stage,
        url,
        uploadedById: actor.id,
        takenAt: dto.takenAt ? new Date(dto.takenAt) : undefined
      }
    });
  }

  async completeOrder(user: AuthenticatedConstructionUser, recordId: string, dto: CompleteConstructionDto) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecord(recordId);
    if (this.orderLifecycle) {
      return this.orderLifecycle.transition(actor, record.orderId, { type: "COMPLETE_CONSTRUCTION", input: dto });
    }
    return this.completeRecord(actor, record, dto);
  }

  async completeOrderForOrder(user: AuthenticatedConstructionUser, orderId: string, dto: CompleteConstructionDto) {
    const actor = await this.withStoreMember(user);
    if (this.orderLifecycle) {
      return this.orderLifecycle.transition(actor, orderId, { type: "COMPLETE_CONSTRUCTION", input: dto });
    }
    return this.completeOrderForOrderInternal(actor, orderId, dto);
  }

  private async completeOrderForOrderInternal(actor: UserWithStoreMember, orderId: string, dto: CompleteConstructionDto) {
    const record = await this.findRecordForOrder(orderId);
    return this.completeRecord(actor, record, dto);
  }

  private async completeRecord(
    actor: UserWithStoreMember,
    record: ConstructionRecordWithRelations,
    dto: CompleteConstructionDto
  ) {
    await this.assertAssignedWorker(actor, record);
    if (record.order.status !== OrderStatus.IN_CONSTRUCTION) {
      throw new BadRequestException("只有施工中订单可以完工");
    }
    const stages = new Set(record.photos.map((photo) => photo.stage));
    if (!stages.has(ConstructionPhotoStage.BEFORE) || !stages.has(ConstructionPhotoStage.AFTER)) {
      throw new BadRequestException("完工前必须上传施工前和施工后照片");
    }
    await this.assertLockedMaterialsPickedUp(record.orderId);
    const completedAt = dto.completedAt ? new Date(dto.completedAt) : new Date();
    const startedAt = record.startedAt ?? completedAt;
    const actualMinutes = Math.max(0, Math.round((completedAt.getTime() - startedAt.getTime()) / 60000));
    const overtimeMinutes = Math.max(0, actualMinutes - 8 * 60);

    const isCrossStore = record.order.storeId !== (record.order.executionStoreId ?? record.order.storeId);
    const updated = isCrossStore
      ? await this.prisma.$transaction(async (tx) => {
        const completedRecord = await tx.constructionRecord.update({
          where: { id: record.id },
          data: { status: ConstructionTaskStatus.COMPLETED, completedAt, actualMinutes, overtimeMinutes }
        });
        await tx.crossStoreConstructionTask.updateMany({
          where: { orderId: record.orderId, status: { in: [CrossStoreTaskStatus.DISPATCHED, CrossStoreTaskStatus.IN_CONSTRUCTION] } },
          data: { status: CrossStoreTaskStatus.PENDING_SOURCE_ACCEPTANCE, submittedForAcceptanceAt: completedAt, version: { increment: 1 } }
        });
        return completedRecord;
      })
      : await this.prisma.constructionRecord.update({
        where: { id: record.id },
        data: { status: ConstructionTaskStatus.COMPLETED, completedAt, actualMinutes, overtimeMinutes }
      });
    await this.createCommissionSnapshots(actor.id, record);
    await this.costSettlements?.initializeForCompletedRecord(record.id, actor.id);
    if (isCrossStore) {
      const recipients = await this.prisma.storeMember.findMany({
        where: { storeId: record.order.storeId, position: StorePosition.MANAGER },
        select: { userId: true }
      });
      await Promise.all(recipients.map(({ userId }) => this.dispatchNotification(
        userId,
        NotificationType.CROSS_STORE_TASK_SUBMITTED,
        { orderId: record.orderId, constructionRecordId: record.id }
      )));
    }
    return updated;
  }

  private async assertLockedMaterialsPickedUp(orderId: string) {
    const allocations = await this.prisma.orderInventoryAllocation.findMany({
      where: { orderId },
      select: { id: true }
    });
    if (allocations.length === 0) return;

    const allocationIds = allocations.map((allocation) => allocation.id);
    const pickupMovements = await this.prisma.inventoryMovement.findMany({
      where: {
        orderId,
        sourceType: "CONSTRUCTION_MATERIAL_PICKUP",
        sourceId: { in: allocationIds }
      },
      select: { sourceId: true }
    });
    const pickedAllocationIds = new Set(pickupMovements.map((movement) => movement.sourceId).filter(Boolean));
    if (pickedAllocationIds.size < allocationIds.length) {
      throw new BadRequestException("请先领取已锁定的施工物料");
    }
  }

  async qualityCheck(user: AuthenticatedConstructionUser, recordId: string, dto: QualityCheckDto) {
    const actor = await this.withStoreMember(user);
    if (this.orderLifecycle) {
      const record = await this.findRecord(recordId);
      return this.orderLifecycle.transition(actor, record.orderId, { type: "QUALITY_CHECK", recordId, input: dto });
    }
    return this.qualityCheckInternal(actor, recordId, dto);
  }

  private async qualityCheckInternal(actor: UserWithStoreMember, recordId: string, dto: QualityCheckDto) {
    const record = await this.findRecord(recordId);
    if (!await this.canAccess(actor, "construction", "write", record.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const checkedAt = new Date();
    if (dto.result === QualityCheckResult.REWORK_REQUIRED) {
      if (!dto.note?.trim()) throw new BadRequestException("质检不通过必须填写返工原因");
      if (!dto.responsibilityType?.trim()) throw new BadRequestException("质检不通过必须填写责任类型");
    }
    const isRecheck = record.qualityResult === QualityCheckResult.REWORK_REQUIRED;
    const update = dto.result === QualityCheckResult.REWORK_REQUIRED
      ? {
          qualityResult: dto.result,
          qualityNote: dto.note,
          qualityCheckedById: actor.id,
          qualityCheckedAt: checkedAt,
          status: ConstructionTaskStatus.IN_CONSTRUCTION,
          reworkCount: { increment: 1 },
          currentReworkReason: dto.note!.trim(),
          currentResponsibilityType: dto.responsibilityType?.trim() ?? null
        }
      : {
          qualityResult: dto.result,
          qualityNote: dto.note,
          qualityCheckedById: actor.id,
          qualityCheckedAt: checkedAt,
          status: ConstructionTaskStatus.COMPLETED,
          currentReworkReason: null,
          currentResponsibilityType: null
        };
    const transaction = (this.prisma as unknown as {
      $transaction?: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
    }).$transaction ?? (async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => fn(this.prisma as never));
    const updated = await transaction(async (tx: Prisma.TransactionClient) => {
      if (dto.result === QualityCheckResult.REWORK_REQUIRED) {
        await tx.order.update({ where: { id: record.orderId }, data: { status: OrderStatus.IN_CONSTRUCTION } });
      }
      const next = await tx.constructionRecord.update({ where: { id: recordId }, data: update });
      if (typeof tx.constructionQualityHistory?.create === "function") {
        await tx.constructionQualityHistory.create({
          data: {
            storeId: record.storeId,
            recordId: record.id,
            orderId: record.orderId,
            result: dto.result,
            note: dto.note?.trim() || null,
            responsibilityType: dto.responsibilityType?.trim() || null,
            checkedById: actor.id,
            checkedAt: checkedAt
          }
        });
      }
      if (dto.result === QualityCheckResult.PASS && typeof tx.orderAmount?.findUnique === "function") {
        const amount = await tx.orderAmount.findUnique({
          where: { orderId: record.orderId },
          select: { outstandingCents: true }
        });
        // 质检只形成质量事实；最终交付必须由归属门店店长/管理员
        // 通过订单 final-delivery command 显式执行。
        if (amount && typeof tx.notification?.createMany === "function") {
          await (this.orderLifecycle?.ensureBalanceTodos(tx, record.orderId) ?? ensureBalanceTodos(tx, record.orderId));
        }
      }
      const events = dto.result === QualityCheckResult.REWORK_REQUIRED
        ? ["QUALITY_CHECK_FAILED", "REWORK_STARTED"]
        : (isRecheck ? ["REWORK_COMPLETED", "QUALITY_RECHECKED"] : ["QUALITY_CHECK_PASSED"]);
      for (const action of events) {
        if (!tx.auditEvent?.create) continue;
        await tx.auditEvent.create({
          data: {
            action,
            actorId: actor.id,
            storeId: record.storeId,
            targetType: "order",
            targetId: record.orderId,
            metadata: {
              orderId: record.orderId,
              constructionRecordId: record.id,
              originalQualityResult: record.qualityResult,
              recheckResult: dto.result,
              reworkReason: dto.note ?? null,
              responsibilityType: dto.responsibilityType ?? null
            }
          }
        });
      }
      return next;
    });
    return updated;
  }

  async listQualityHistory(user: AuthenticatedConstructionUser, recordId: string) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecord(recordId);
    const assignedWorkerId = this.getAssignedWorkerId(actor.id, record);
    if (
      !await this.canAccess(actor, "construction", "write", record.storeId) &&
      assignedWorkerId !== actor.id &&
      !await this.canAccess(actor, "construction", "write", record.storeId, assignedWorkerId)
    ) {
      throw new ForbiddenException("无权限");
    }
    const history = await this.prisma.constructionQualityHistory?.findMany({
      where: { recordId },
      orderBy: [{ checkedAt: "asc" }, { createdAt: "asc" }]
    });
    return {
      recordId,
      current: {
        result: record.qualityResult,
        note: record.qualityNote,
        checkedAt: record.qualityCheckedAt
      },
      history: history ?? [],
      historyAvailable: history !== undefined
    };
  }
  async getOrderMaterials(user: AuthenticatedConstructionUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecordForOrder(orderId);
    await this.assertCanAccessOrderMaterials(actor, record);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: {
            product: true,
            inventoryAllocations: {
              include: { batch: true },
              orderBy: { lockedAt: "desc" }
            }
          }
        },
        inventoryMovements: {
          where: {
            sourceType: { in: ["CONSTRUCTION_MATERIAL_VERIFY", "CONSTRUCTION_MATERIAL_PICKUP", "CONSTRUCTION_MATERIAL_LOSS"] }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!order) {
      throw new NotFoundException("订单不存在");
    }

    const verifiedBatchIds = new Set(
      order.inventoryMovements
        .filter((movement) => movement.sourceType === "CONSTRUCTION_MATERIAL_VERIFY" && movement.batchId)
        .map((movement) => movement.batchId)
    );
    const pickedAllocationIds = new Set(
      order.inventoryMovements
        .filter((movement) => movement.sourceType === "CONSTRUCTION_MATERIAL_PICKUP" && movement.sourceId)
        .map((movement) => movement.sourceId)
    );

    const materials = order.items.map((item) => {
      const batches = item.inventoryAllocations.map((allocation) => ({
        allocationId: allocation.id,
        batchId: allocation.batchId,
        batchNo: allocation.batch.batchNo,
        supplierName: allocation.batch.supplierName,
        unit: allocation.batch.unit,
        lockedQuantity: decimalToNumber(allocation.lockedQuantity),
        outboundQuantity: decimalToNumber(allocation.outboundQuantity),
        availableQuantity: decimalToNumber(allocation.batch.availableQuantity),
        status: allocation.status,
        verified: verifiedBatchIds.has(allocation.batchId),
        pickedUp: pickedAllocationIds.has(allocation.id)
      }));
      return {
        orderItemId: item.id,
        productId: item.productId,
        productLabel: formatProductLabel(item.product),
        quantity: item.quantity,
        unit: item.product.salesUnit,
        requiredQuantity: item.quantity,
        allocatedQuantity: batches.reduce((sum, batch) => sum + batch.lockedQuantity, 0),
        pickedQuantity: batches.filter((batch) => batch.pickedUp).reduce((sum, batch) => sum + batch.lockedQuantity, 0),
        verifiedQuantity: batches.filter((batch) => batch.verified).length,
        batches
      };
    });

    return {
      order: {
        id: order.id,
        orderNo: order.orderNo,
        status: order.status,
        constructionType: order.constructionType,
        constructionLocation: order.constructionLocation,
        appointmentDate: order.appointmentDate,
        appointmentTimeSlot: order.appointmentTimeSlot
      },
      summary: {
        requiredItems: materials.length,
        allocatedBatches: materials.reduce((sum, item) => sum + item.batches.length, 0),
        verifiedBatches: materials.reduce((sum, item) => sum + item.batches.filter((batch) => batch.verified).length, 0),
        pickedBatches: materials.reduce((sum, item) => sum + item.batches.filter((batch) => batch.pickedUp).length, 0),
        photoCount: record.photos.length
      },
      materials
    };
  }

  async verifyMaterialBatch(user: AuthenticatedConstructionUser, orderId: string, dto: VerifyMaterialBatchDto) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecordForOrder(orderId);
    await this.assertCanAccessOrderMaterials(actor, record);
    const allocation = await this.prisma.orderInventoryAllocation.findFirst({
      where: { orderId, batchId: dto.batchId },
      include: { batch: true }
    });
    if (!allocation) {
      throw new NotFoundException("订单未锁定该批次");
    }
    await this.prisma.inventoryMovement.create({
      data: {
        storeId: allocation.storeId,
        batchId: allocation.batchId,
        productId: allocation.productId,
        orderId,
        movementType: InventoryMovementType.STOCK_ADJUST,
        quantity: 0,
        unit: allocation.batch.unit,
        sourceType: "CONSTRUCTION_MATERIAL_VERIFY",
        sourceId: allocation.id,
        createdById: actor.id,
        note: dto.note ?? `施工物料批次核验：${allocation.batch.batchNo}`
      }
    });
    return this.getOrderMaterials(user, orderId);
  }

  async pickupMaterials(user: AuthenticatedConstructionUser, orderId: string, dto: PickupConstructionMaterialDto) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecordForOrder(orderId);
    await this.assertCanAccessOrderMaterials(actor, record);
    const allocationIds = [...new Set(dto.allocationIds)];
    const allocations = await this.prisma.orderInventoryAllocation.findMany({
      where: { orderId, id: { in: allocationIds } },
      include: { batch: true }
    });
    if (allocations.length !== allocationIds.length) {
      throw new BadRequestException("存在不属于该订单的锁定批次");
    }
    const existingPickupMovements = await this.prisma.inventoryMovement.findMany({
      where: {
        orderId,
        sourceType: "CONSTRUCTION_MATERIAL_PICKUP",
        sourceId: { in: allocationIds }
      },
      select: { sourceId: true }
    });
    const pickedAllocationIds = new Set(existingPickupMovements.map((movement) => movement.sourceId).filter(Boolean));
    const pendingAllocations = allocations.filter((allocation) => !pickedAllocationIds.has(allocation.id));
    if (pendingAllocations.length > 0) {
      await this.prisma.inventoryMovement.createMany({
        data: pendingAllocations.map((allocation) => ({
          storeId: allocation.storeId,
          batchId: allocation.batchId,
          productId: allocation.productId,
          orderId,
          movementType: InventoryMovementType.STOCK_ADJUST,
          quantity: 0,
          unit: allocation.batch.unit,
          sourceType: "CONSTRUCTION_MATERIAL_PICKUP",
          sourceId: allocation.id,
          createdById: actor.id,
          note: dto.note ?? `施工领取物料：${allocation.batch.batchNo}`
        }))
      });
    }
    return this.getOrderMaterials(user, orderId);
  }

  async recordMaterialLoss(user: AuthenticatedConstructionUser, orderId: string, dto: RecordMaterialLossDto) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecordForOrder(orderId);
    await this.assertCanAccessOrderMaterials(actor, record);
    await this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.findFirst({
        where: { id: dto.batchId, allocations: { some: { orderId } } }
      });
      if (!batch) {
        throw new NotFoundException("订单未锁定该批次");
      }
      if (dto.quantity > decimalToNumber(batch.availableQuantity)) {
        throw new BadRequestException("损耗数量超出可用库存");
      }
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          availableQuantity: { decrement: dto.quantity },
          outboundQuantity: { increment: dto.quantity }
        }
      });
      await tx.inventoryMovement.create({
        data: {
          storeId: batch.storeId,
          batchId: batch.id,
          productId: batch.productId,
          orderId,
          movementType: InventoryMovementType.DAMAGE_OUT,
          quantity: dto.quantity,
          unit: batch.unit,
          sourceType: "CONSTRUCTION_MATERIAL_LOSS",
          sourceId: orderId,
          createdById: actor.id,
          note: dto.note ?? "施工现场损耗"
        }
      });
    });
    return this.getOrderMaterials(user, orderId);
  }

  async upsertWorker(user: AuthenticatedConstructionUser, dto: UpsertWorkerProfileDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "construction", "write", dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.constructionWorkerProfile.upsert({
      where: { userId: dto.userId },
      create: {
        storeId: dto.storeId,
        userId: dto.userId,
        canWorkOutside: dto.canWorkOutside ?? false,
        skillTags: dto.skillTags ?? [],
        isActive: dto.isActive ?? true
      },
      update: {
        canWorkOutside: dto.canWorkOutside,
        skillTags: dto.skillTags,
        isActive: dto.isActive
      }
    });
  }

  async listWorkers(user: AuthenticatedConstructionUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "construction", "read", storeId)) {
      throw new ForbiddenException("无权限");
    }
    const profiles = await this.prisma.constructionWorkerProfile.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { username: true, nickname: true } } }
    });
    const constructionMembers = await this.prisma.storeMember.findMany({
      where: {
        storeId,
        position: { in: [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE] }
      },
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { username: true, nickname: true } } }
    });
    const memberPositions = new Map(constructionMembers.map((member) => [member.userId, member.position]));
    const profiledWorkers = profiles
      .filter((profile) => memberPositions.has(profile.userId))
      .map((profile) => ({ ...profile, position: memberPositions.get(profile.userId)! }));
    const profiledWorkerUserIds = new Set(profiledWorkers.map((profile) => profile.userId));
    const profilelessMembers = constructionMembers
      .filter((member) => !profiledWorkerUserIds.has(member.userId))
      .map((member) => ({
        storeId,
        userId: member.userId,
        canWorkOutside: false,
        skillTags: [],
        isActive: true,
        position: member.position,
        user: member.user
      }));

    return [...profiledWorkers, ...profilelessMembers];
  }

  async createLeave(user: AuthenticatedConstructionUser, dto: LeaveRequestDto) {
    const actor = await this.withStoreMember(user);
    if (actor.id !== dto.workerId) {
      throw new ForbiddenException("无权限");
    }
    const worker = await this.prisma.storeMember.findFirst({
      where: {
        storeId: dto.storeId,
        userId: dto.workerId,
        position: { in: [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE, StorePosition.SCHEDULER] }
      },
      select: { position: true }
    });
    if (!worker) throw new BadRequestException("请假申请人必须是本门店施工团队成员");
    const leaveType = await this.prisma.dictionaryItem.findFirst({
      where: {
        code: dto.leaveType.trim(),
        status: "ACTIVE",
        dictionary: { storeId: dto.storeId, code: "LEAVE_TYPE", status: "ACTIVE" }
      },
      select: { code: true }
    });
    if (!leaveType) throw new BadRequestException("请假类型无效或已停用，请从当前有效类型中选择");
    const leave = await this.prisma.leaveRequest.create({
      data: {
        storeId: dto.storeId,
        workerId: dto.workerId,
        startDate: normalizeDate(dto.startDate),
        endDate: normalizeDate(dto.endDate),
        leaveType: leaveType.code,
        reason: dto.reason,
        status: LeaveRequestStatus.PENDING
      }
    });
    const approvers = await this.prisma.storeMember.findMany({
      where: {
        storeId: dto.storeId,
        position: worker.position === StorePosition.SCHEDULER ? StorePosition.MANAGER : StorePosition.SCHEDULER
      },
      select: { userId: true }
    });
    await Promise.all(approvers.map((approver) => this.dispatchNotification(approver.userId, "LEAVE_APPROVAL_REQUIRED", {
      storeId: dto.storeId,
      leaveId: leave.id,
      workerId: dto.workerId,
      leaveType: dto.leaveType.trim(),
      startDate: leave.startDate.toISOString(),
      endDate: leave.endDate.toISOString(),
      approvalPath: worker.position === StorePosition.SCHEDULER ? "MANAGER" : "SCHEDULER"
    })));
    return leave;
  }

  async listLeaves(user: AuthenticatedConstructionUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "construction", "read", storeId)) {
      throw new ForbiddenException("无权限");
    }
    const canReviewLeaves = await this.canAccess(actor, "construction", "write", storeId);
    return this.prisma.leaveRequest.findMany({
      where: { storeId, ...(canReviewLeaves ? {} : { workerId: actor.id }) },
      orderBy: { createdAt: "desc" },
      include: {
        worker: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
        reviewedBy: { select: { id: true, username: true, nickname: true } }
      }
    });
  }

  async updateLeave(user: AuthenticatedConstructionUser, id: string, dto: UpdateLeaveRequestDto) {
    const actor = await this.withStoreMember(user);
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) {
      throw new NotFoundException("请假记录不存在");
    }
    if (leave.status !== LeaveRequestStatus.PENDING) {
      throw new BadRequestException("该请假申请已处理，不能重复审批");
    }
    if (dto.status === "REJECTED" && !dto.reviewNote?.trim()) {
      throw new BadRequestException("驳回请填写审批意见");
    }
    const applicantMember = await this.prisma.storeMember.findFirst({ where: { storeId: leave.storeId, userId: leave.workerId }, select: { position: true } });
    const isApplicantSupervisor = applicantMember?.position === StorePosition.SCHEDULER;
    const canReview = isApplicantSupervisor
      ? await this.canAccess(actor, "store", "write", leave.storeId)
      : await this.canAccess(actor, "construction", "write", leave.storeId);
    if (!canReview || actor.id === leave.workerId) {
      throw new ForbiddenException("无权限");
    }
    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: dto.status as LeaveRequestStatus,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote?.trim() || undefined
      },
      include: {
        worker: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
        reviewedBy: { select: { id: true, username: true, nickname: true } }
      }
    });
    await this.dispatchNotification(leave.workerId, dto.status === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED", {
      storeId: leave.storeId,
      leaveId: leave.id,
      reviewNote: dto.reviewNote?.trim() || "",
      reviewedById: actor.id
    });
    return updated;
  }

  async upsertSchedule(user: AuthenticatedConstructionUser, dto: UpsertScheduleDto) {
    const actor = await this.withStoreMember(user);
    const roles = await this.rolesFor(actor, dto.storeId);
    const canUpdateOwnSchedule = Boolean((roles.has("CONSTRUCTION") || roles.has("APPRENTICE")) && actor.id === dto.workerId);
    if (!await this.canAccess(actor, "construction", "write", dto.storeId) && !canUpdateOwnSchedule) {
      throw new ForbiddenException("无权限");
    }
    const date = normalizeDate(dto.date);
    return this.prisma.schedule.upsert({
      where: { workerId_date: { workerId: dto.workerId, date } },
      create: { storeId: dto.storeId, workerId: dto.workerId, date, status: dto.status, note: dto.note },
      update: { status: dto.status, note: dto.note }
    });
  }

  async listSchedules(user: AuthenticatedConstructionUser, query: ListConstructionDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "construction", "read", query.storeId)) {
      throw new ForbiddenException("无权限");
    }

    const roles = await this.rolesFor(actor, query.storeId);
    const isWorker = roles.has("CONSTRUCTION") || roles.has("APPRENTICE");
    if (!isWorker && !await this.canAccess(actor, "construction", "write", query.storeId)) {
      throw new ForbiddenException("无权限");
    }

    return this.prisma.schedule.findMany({
      where: {
        storeId: query.storeId,
        date: buildDateRange(query.from, query.to),
        workerId: isWorker && !this.isAdministrator(roles) ? actor.id : undefined
      },
      orderBy: { date: "asc" },
      include: { worker: { select: { username: true, nickname: true } } }
    });
  }

  async syncOfflineOperations(user: AuthenticatedConstructionUser, dto: OfflineSyncDto) {
    const items = [];
    for (const operation of dto.operations) {
      try {
        const result = await this.applyOfflineOperation(user, operation);
        items.push({ clientOperationId: operation.clientOperationId, status: "SYNCED" as const, result });
      } catch (error) {
        items.push({
          clientOperationId: operation.clientOperationId,
          status: "FAILED" as const,
          message: error instanceof Error ? error.message : "同步失败"
        });
      }
    }
    return { items };
  }

  private async applyOfflineOperation(user: AuthenticatedConstructionUser, operation: OfflineSyncOperationDto) {
    if (operation.type === "PHOTO_UPLOAD") {
      const payload = operation.payload as OfflinePhotoPayloadDto;
      return this.uploadPhoto(user, payload.recordId, {
        stage: payload.stage,
        url: payload.url,
        takenAt: payload.takenAt
      });
    }
    if (operation.type === "TASK_STATUS") {
      const payload = operation.payload as OfflineTaskStatusPayloadDto;
      if (payload.status === ConstructionTaskStatus.IN_CONSTRUCTION) {
        return this.startOrder(user, payload.orderId, { startedAt: payload.startedAt });
      }
      if (payload.status === ConstructionTaskStatus.COMPLETED) {
        return this.completeOrderForOrder(user, payload.orderId, { completedAt: payload.completedAt });
      }
      throw new BadRequestException("不支持的离线施工状态");
    }
    if (operation.type === "LEAVE_REQUEST") {
      const payload = operation.payload as OfflineLeavePayloadDto;
      return this.createLeave(user, {
        storeId: payload.storeId,
        workerId: payload.workerId ?? user.id,
        startDate: payload.startDate,
        endDate: payload.endDate,
        leaveType: payload.leaveType,
        reason: payload.reason
      });
    }
    throw new BadRequestException("不支持的离线操作类型");
  }

  private async findRecordForOrder(orderId: string) {
    const record = await this.prisma.constructionRecord.findUnique({
      where: { orderId },
      include: constructionRecordInclude
    });
    if (!record) {
      throw new NotFoundException("施工记录不存在");
    }
    return record;
  }

  private async findRecord(recordId: string) {
    const record = await this.prisma.constructionRecord.findUnique({
      where: { id: recordId },
      include: constructionRecordInclude
    });
    if (!record) {
      throw new NotFoundException("施工记录不存在");
    }
    return record;
  }

  private getAssignedWorkerId(userId: string, record: ConstructionRecordWithRelations) {
    const assignment = record.assignments.find((item) => item.workerUserId === userId);
    return assignment?.workerUserId ?? "";
  }

  private async assertAssignedWorker(user: UserWithStoreMember, record: ConstructionRecordWithRelations) {
    const assignedWorkerId = this.getAssignedWorkerId(user.id, record);
    if (
      assignedWorkerId !== user.id &&
      !await this.canAccess(user, "construction", "write", record.storeId, assignedWorkerId)
    ) {
      throw new ForbiddenException("无权限");
    }
  }

  private async assertCanAccessOrderMaterials(user: UserWithStoreMember, record: ConstructionRecordWithRelations) {
    const assignedWorkerId = this.getAssignedWorkerId(user.id, record);
    if (
      !await this.canAccess(user, "construction", "write", record.storeId) &&
      assignedWorkerId !== user.id &&
      !await this.canAccess(user, "construction", "write", record.storeId, assignedWorkerId)
    ) {
      throw new ForbiddenException("无权限");
    }
  }

  private async createCommissionSnapshots(createdById: string, record: ConstructionRecordWithRelations) {
    const existing = await this.prisma.workerCommissionSnapshot.findFirst({
      where: { recordId: record.id }
    });
    if (existing) {
      return;
    }
    const workerIds = record.assignments.map((assignment) => assignment.workerUserId);
    const actualCommissions = workerIds.length && typeof this.prisma.workerCommission?.findMany === "function"
      ? await this.prisma.workerCommission.findMany({
        where: { orderId: record.orderId, workerUserId: { in: workerIds } },
        select: { workerUserId: true, finalAmountCents: true, calculationNote: true }
      })
      : [];
    const commissionByWorker = new Map(actualCommissions.map((item) => [item.workerUserId, item]));
    await this.prisma.workerCommissionSnapshot.createMany({
      data: record.assignments.map((assignment) => ({
        recordId: record.id,
        orderId: record.orderId,
        workerUserId: assignment.workerUserId,
        amountCents: commissionByWorker.get(assignment.workerUserId)?.finalAmountCents ?? 0,
        calculationNote: commissionByWorker.get(assignment.workerUserId)?.calculationNote ?? "完工时尚无个人提成，成本确认时以财务维护的实际提成为准",
        createdById
      }))
    });
  }

  private async withStoreMember(user: AuthenticatedConstructionUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) {
      return user;
    }

    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });

    return {
      id: user.id,
      isAuditor: user.isAuditor,
      storeMember: member
    };
  }

  private async rolesFor(actor: UserWithStoreMember, storeId: string) {
    if (!this.accessContext) throw new Error("ConstructionService access context is not configured");
    const resolution = await this.accessContext.resolve(actor.id, { storeId });
    return new Set(resolution.roles.map((role) => role.roleCode));
  }

  private isAdministrator(roles: Set<string>) {
    return roles.has("HQ_ADMIN") || roles.has("PLATFORM_ADMIN") || roles.has("AUDITOR");
  }

  private dispatchNotification(userId: string, type: keyof typeof NotificationType, payload: object) {
    return this.notificationDispatcher?.dispatch({ userId, type, payload })
      ?? this.notifications?.send(userId, type, payload);
  }
}

const constructionRecordInclude = {
  order: {
    include: {
      customer: true,
      vehicle: true,
      items: { include: { product: true } }
    }
  },
  assignments: true,
  photos: true
} satisfies Prisma.ConstructionRecordInclude;

type ConstructionRecordWithRelations = Prisma.ConstructionRecordGetPayload<{
  include: typeof constructionRecordInclude;
}>;

function normalizeDate(value: string) {
  const datePart = value.includes("T") ? value.slice(0, 10) : value;
  return new Date(`${datePart}T00:00:00.000Z`);
}

function buildDateRange(from?: string, to?: string) {
  if (!from && !to) {
    return undefined;
  }
  return {
    gte: from ? normalizeDate(from) : undefined,
    lte: to ? normalizeDate(to) : undefined
  };
}

function decimalToNumber(value: Prisma.Decimal | number | string) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value.toNumber();
}

function formatProductLabel(product: { brand: string; name: string; model: string; specification?: string | null }) {
  return [
    product.brand,
    product.name,
    product.model,
    product.specification
  ].filter(Boolean).join(" / ");
}
