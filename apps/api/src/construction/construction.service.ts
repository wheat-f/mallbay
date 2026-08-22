/* eslint-disable @typescript-eslint/consistent-type-imports */
import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  ConstructionEvidenceStatus,
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
import { InventoryLedger, toInventoryLedgerTransaction } from "../inventory/domain/inventory-ledger";
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
    private readonly orderLifecycle: OrderLifecycle,
    @Optional() @Inject(OssService) private readonly oss?: OssService,
    @Optional() private readonly costSettlements?: ConstructionCostSettlementService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcher,
    @Optional() private readonly accessContext?: AccessContext,
    private readonly inventoryLedger?: InventoryLedger
  ) {}

  private canAccess(actor: AuthenticatedConstructionUser | UserWithStoreMember, capability: string, action: string, storeId: string, ownerId?: string) {
    if (!this.accessContext) throw new Error("ConstructionService access context is not configured");
    return this.accessContext.can({ userId: actor.id }, capability, action, { storeId, ownerId });
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
    const ownership = await this.getOwnershipFacts(actor, query.storeId);
    if (ownership.sales) where.order = { salesPersonId: actor.id };
    if (ownership.worker) where.assignments = { some: { workerUserId: actor.id } };
    return this.prisma.constructionRecord.findMany({
      where,
      orderBy: { dispatchedAt: "desc" },
      include: constructionRecordInclude
    });
  }

  async assignOrder(user: AuthenticatedConstructionUser, orderId: string, dto: AssignOrderDto, context: { commandId: string; expectedVersion: number }) {
    const actor = await this.withStoreMember(user);
    return this.orderLifecycle.transition(actor, orderId, { type: "DISPATCH", input: dto }, { ...context, source: "CONSTRUCTION_WEB" });
  }

  async startOrder(user: AuthenticatedConstructionUser, orderId: string, dto: StartConstructionDto = {}, context: { commandId: string; expectedVersion: number }) {
    const actor = await this.withStoreMember(user);
    return this.orderLifecycle.transition(actor, orderId, { type: "START_CONSTRUCTION", input: dto }, { ...context, source: "CONSTRUCTION_WEB" });
  }

  async uploadPhoto(
    user: AuthenticatedConstructionUser,
    recordId: string,
    dto: UploadConstructionPhotoDto,
    file?: MulterFile,
    clientOperationId?: string
  ) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecord(recordId);
    const operationId = clientOperationId?.trim() || undefined;
    const requestFingerprint = buildConstructionEvidenceFingerprint(recordId, actor.id, dto, file);
    if (operationId) {
      const existing = await this.prisma.constructionPhoto.findUnique({ where: { clientOperationId: operationId } });
      if (existing) {
        assertConstructionEvidenceReplay(existing, {
          actorId: actor.id,
          recordId,
          stage: dto.stage,
          requestFingerprint
        });
        return toConstructionPhotoResponse(existing);
      }
    }
    if (record.status === ConstructionTaskStatus.DISPATCHED && dto.stage !== ConstructionPhotoStage.BEFORE) {
      throw new BadRequestException({ code: "EVIDENCE_STAGE_NOT_ALLOWED", message: "正式开工前只能上传 BEFORE 验车证据" });
    }
    const assignedWorkerId = this.getAssignedWorkerId(actor.id, record);
    if (
      assignedWorkerId !== actor.id &&
      !(await this.canAccess(actor, "construction", "write", record.storeId)) &&
      !(await this.canAccess(actor, "construction", "write", record.storeId, assignedWorkerId))
    ) {
      throw new ForbiddenException("无权限");
    }
    const uploadedObject = !dto.url && file
      ? await this.oss?.uploadConstructionPhoto(record.storeId, record.orderId, file, operationId)
      : undefined;
    const url = dto.url ?? uploadedObject;
    if (!url) {
      throw new BadRequestException("请上传施工照片");
    }
    try {
      const photo = await this.prisma.constructionPhoto.create({
        data: {
          recordId,
          stage: dto.stage,
          url,
          uploadedById: actor.id,
          clientOperationId: operationId,
          requestFingerprint,
          status: ConstructionEvidenceStatus.APPLIED,
          takenAt: dto.takenAt ? new Date(dto.takenAt) : undefined
        }
      });
      return toConstructionPhotoResponse(photo);
    } catch (error) {
      if (operationId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.constructionPhoto.findUnique({ where: { clientOperationId: operationId } });
        if (existing) {
          assertConstructionEvidenceReplay(existing, {
            actorId: actor.id,
            recordId,
            stage: dto.stage,
            requestFingerprint
          });
          return toConstructionPhotoResponse(existing);
        }
      }
      if (uploadedObject) {
        await this.oss?.removeConstructionPhoto(uploadedObject).catch(() => undefined);
      }
      throw error;
    }
  }

  async completeOrder(user: AuthenticatedConstructionUser, recordId: string, dto: CompleteConstructionDto, context: { commandId: string; expectedVersion: number }) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecord(recordId);
    return this.orderLifecycle.transition(actor, record.orderId, { type: "COMPLETE_CONSTRUCTION", input: dto }, { ...context, source: "CONSTRUCTION_WEB" });
  }

  async completeOrderForOrder(user: AuthenticatedConstructionUser, orderId: string, dto: CompleteConstructionDto, context: { commandId: string; expectedVersion: number }) {
    const actor = await this.withStoreMember(user);
    return this.orderLifecycle.transition(actor, orderId, { type: "COMPLETE_CONSTRUCTION", input: dto }, { ...context, source: "CONSTRUCTION_WEB" });
  }

  async qualityCheck(user: AuthenticatedConstructionUser, recordId: string, dto: QualityCheckDto, context: { commandId: string; expectedVersion: number }) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecord(recordId);
    return this.orderLifecycle.transition(actor, record.orderId, { type: "QUALITY_CHECK", recordId, input: dto }, { ...context, source: "CONSTRUCTION_WEB" });
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
    await this.prisma.$transaction(async (tx) => {
      await this.inventoryLedger!.verifyMaterialWithin(toInventoryLedgerTransaction(tx), {
        allocationId: allocation.id,
        orderId,
        batchId: allocation.batchId,
        productId: allocation.productId,
        storeId: allocation.storeId,
        unit: allocation.batch.unit,
        actorId: actor.id,
        note: dto.note ?? `施工物料批次核验：${allocation.batch.batchNo}`
      });
      await this.invalidateOrderLifecycleFact(tx, orderId, "CONSTRUCTION_MATERIAL_VERIFY", allocation.id, { allocationId: allocation.id });
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
      await this.prisma.$transaction(async (tx) => {
        await this.inventoryLedger!.pickupMaterialsWithin(toInventoryLedgerTransaction(tx), {
          orderId,
          allocations: pendingAllocations,
          actorId: actor.id,
          note: dto.note
        });
        await this.invalidateOrderLifecycleFact(tx, orderId, "CONSTRUCTION_MATERIAL_PICKUP", pendingAllocations.map((allocation) => allocation.id).join(","), { allocationIds: pendingAllocations.map((allocation) => allocation.id) });
      });
    }
    return this.getOrderMaterials(user, orderId);
  }

  async recordMaterialLoss(user: AuthenticatedConstructionUser, orderId: string, dto: RecordMaterialLossDto) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecordForOrder(orderId);
    await this.assertCanAccessOrderMaterials(actor, record);
    await this.prisma.$transaction(async (tx) => {
      await this.inventoryLedger!.recordMaterialLossWithin(toInventoryLedgerTransaction(tx), {
        orderId,
        batchId: dto.batchId,
        quantity: dto.quantity,
        actorId: actor.id,
        note: dto.note
      });
      await this.invalidateOrderLifecycleFact(tx, orderId, "CONSTRUCTION_MATERIAL_LOSS", dto.batchId, { batchId: dto.batchId, quantity: dto.quantity });
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

  async createLeave(user: AuthenticatedConstructionUser, dto: LeaveRequestDto, rawClientOperationId?: string) {
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
    const clientOperationId = (rawClientOperationId ?? dto.clientOperationId)?.trim() || undefined;
    if (clientOperationId) {
      const existing = await this.prisma.leaveRequest.findUnique({ where: { clientOperationId } });
      if (existing) {
        const startDate = normalizeDate(dto.startDate);
        const endDate = normalizeDate(dto.endDate);
        const sameInput = existing.storeId === dto.storeId
          && existing.workerId === dto.workerId
          && existing.startDate.getTime() === startDate.getTime()
          && existing.endDate.getTime() === endDate.getTime()
          && existing.leaveType === leaveType.code
          && (existing.reason ?? "") === (dto.reason?.trim() ?? "");
        if (!sameInput) throw new ConflictException({ code: "COMMAND_ID_CONFLICT", message: "请假命令标识已用于不同输入" });
        return existing;
      }
    }
    const leave = await this.prisma.leaveRequest.create({
      data: {
        clientOperationId,
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
    const ownership = await this.getOwnershipFacts(actor, dto.storeId);
    const canUpdateOwnSchedule = Boolean(ownership.worker && actor.id === dto.workerId);
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

    const ownership = await this.getOwnershipFacts(actor, query.storeId);
    const isWorker = ownership.worker;
    if (!isWorker && !await this.canAccess(actor, "construction", "write", query.storeId)) {
      throw new ForbiddenException("无权限");
    }

    return this.prisma.schedule.findMany({
      where: {
        storeId: query.storeId,
        date: buildDateRange(query.from, query.to),
        workerId: isWorker && !ownership.global ? actor.id : undefined
      },
      orderBy: { date: "asc" },
      include: { worker: { select: { username: true, nickname: true } } }
    });
  }

  async syncOfflineOperations(user: AuthenticatedConstructionUser, dto: OfflineSyncDto) {
    const items: Array<{
      clientOperationId: string;
      status: "APPLIED" | "REPLAYED" | "CONFLICT" | "RETRYABLE_FAILURE" | "REJECTED";
      code?: string;
      message?: string;
      result?: unknown;
    }> = [];
    for (const operation of dto.operations) {
      try {
        const outcome = await this.applyOfflineOperation(user, operation);
        items.push({
          clientOperationId: operation.clientOperationId,
          status: outcome.replayed ? "REPLAYED" : "APPLIED",
          result: outcome.result
        });
      } catch (error) {
        const failure = classifyOfflineFailure(error);
        items.push({
          clientOperationId: operation.clientOperationId,
          status: failure.status,
          code: failure.code,
          message: failure.message
        });
      }
    }
    return { items };
  }

  private async applyOfflineOperation(user: AuthenticatedConstructionUser, operation: OfflineSyncOperationDto): Promise<{ result: unknown; replayed: boolean }> {
    if (operation.type === "PHOTO_UPLOAD") {
      const payload = operation.payload as OfflinePhotoPayloadDto;
      const existing = await this.prisma.constructionPhoto.findUnique({ where: { clientOperationId: operation.clientOperationId } });
      const result = await this.uploadPhoto(user, payload.recordId, {
        stage: payload.stage,
        url: payload.url,
        takenAt: payload.takenAt
      }, undefined, operation.clientOperationId);
      return { result, replayed: Boolean(existing) };
    }
    if (operation.type === "TASK_STATUS") {
      const payload = operation.payload as OfflineTaskStatusPayloadDto;
      const order = await this.prisma.order.findUnique({ where: { id: payload.orderId }, select: { storeId: true } });
      const existing = order
        ? await this.prisma.orderLifecycleCommandRecord.findUnique({
          where: { storeId_commandId: { storeId: order.storeId, commandId: operation.clientOperationId } },
          select: { status: true }
        })
        : null;
      if (payload.status === ConstructionTaskStatus.IN_CONSTRUCTION) {
        const result = await this.startOrder(user, payload.orderId, { startedAt: payload.startedAt }, {
          commandId: operation.clientOperationId,
          expectedVersion: payload.expectedVersion
        });
        return { result, replayed: Boolean(existing) };
      }
      if (payload.status === ConstructionTaskStatus.COMPLETED) {
        const result = await this.completeOrderForOrder(user, payload.orderId, { completedAt: payload.completedAt }, {
          commandId: operation.clientOperationId,
          expectedVersion: payload.expectedVersion
        });
        return { result, replayed: Boolean(existing) };
      }
      throw new BadRequestException("不支持的离线施工状态");
    }
    if (operation.type === "LEAVE_REQUEST") {
      const payload = operation.payload as OfflineLeavePayloadDto;
      const existing = await this.prisma.leaveRequest.findUnique({ where: { clientOperationId: operation.clientOperationId } });
      const result = await this.createLeave(user, {
        storeId: payload.storeId,
        workerId: payload.workerId ?? user.id,
        startDate: payload.startDate,
        endDate: payload.endDate,
        leaveType: payload.leaveType,
        reason: payload.reason
      }, operation.clientOperationId);
      return { result, replayed: Boolean(existing) };
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

  private async invalidateOrderLifecycleFact(
    tx: Prisma.TransactionClient,
    orderId: string,
    sourceType: string,
    sourceKey: string,
    sourceRefs: Prisma.InputJsonObject
  ) {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { lifecycleVersion: true } });
    if (!order) throw new NotFoundException("订单不存在");
    const updated = await tx.order.updateMany({
      where: { id: orderId, lifecycleVersion: order.lifecycleVersion },
      data: { lifecycleVersion: { increment: 1 } }
    });
    if (updated.count !== 1) throw new BadRequestException("订单履约事实已被其他操作更新，请刷新后重试");
    await tx.orderLifecycleVersionChange.create({
      data: {
        orderId,
        beforeVersion: order.lifecycleVersion,
        afterVersion: order.lifecycleVersion + 1,
        sourceType,
        sourceKey,
        sourceRefs
      }
    });
  }

  private async withStoreMember(user: AuthenticatedConstructionUser): Promise<UserWithStoreMember> {
    return user;
  }

  private async getOwnershipFacts(actor: UserWithStoreMember, storeId: string) {
    if (!this.accessContext) throw new Error("ConstructionService access context is not configured");
    const [construction, sales, worker] = await Promise.all([
      this.accessContext.scope({ userId: actor.id }, "construction", "read", { storeId }),
      this.accessContext.scope({ userId: actor.id }, "orders", "read", { storeId, ownerId: actor.id }),
      this.accessContext.scope({ userId: actor.id }, "after-sales", "write", { storeId, ownerId: actor.id })
    ]);
    return {
      sales: sales.allowed && sales.ownerId === actor.id,
      worker: worker.allowed && worker.ownerId === actor.id,
      global: construction.allowed && construction.global
    };
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
  // Keep command identity/fingerprint internal to the evidence implementation;
  // transport adapters only expose business-safe photo fields.
  photos: { select: { id: true, stage: true, url: true, uploadedById: true, takenAt: true, status: true } }
} satisfies Prisma.ConstructionRecordInclude;

function buildConstructionEvidenceFingerprint(
  recordId: string,
  actorId: string,
  dto: UploadConstructionPhotoDto,
  file?: MulterFile
) {
  const content = file?.buffer ?? Buffer.from(dto.url?.trim() ?? "", "utf8");
  return createHash("sha256")
    .update(JSON.stringify({
      recordId,
      actorId,
      stage: dto.stage,
      takenAt: dto.takenAt ? new Date(dto.takenAt).toISOString() : null,
      contentSha256: createHash("sha256").update(content).digest("hex")
    }))
    .digest("hex");
}

function assertConstructionEvidenceReplay(
  existing: {
    recordId: string;
    uploadedById?: string;
    stage?: ConstructionPhotoStage;
    requestFingerprint?: string;
    status?: ConstructionEvidenceStatus;
  },
  expected: { actorId: string; recordId: string; stage: ConstructionPhotoStage; requestFingerprint: string }
) {
  if (existing.status === ConstructionEvidenceStatus.REVOKED) {
    throw new ConflictException({ code: "EVIDENCE_REVOKED", message: "该施工证据已撤销，不能重放" });
  }
  if (
    existing.recordId !== expected.recordId ||
    (existing.uploadedById && existing.uploadedById !== expected.actorId) ||
    (existing.stage && existing.stage !== expected.stage) ||
    (existing.requestFingerprint && existing.requestFingerprint !== expected.requestFingerprint)
  ) {
    throw new ConflictException({ code: "COMMAND_ID_CONFLICT", message: "照片命令标识已绑定不同施工证据输入" });
  }
}

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

function classifyOfflineFailure(error: unknown): {
  status: "CONFLICT" | "RETRYABLE_FAILURE" | "REJECTED";
  code?: string;
  message: string;
} {
  const response = error instanceof HttpException ? error.getResponse() : undefined;
  const statusCode = error instanceof HttpException ? error.getStatus() : 500;
  const responseObject = response && typeof response === "object" ? response as { code?: unknown; message?: unknown } : undefined;
  const code = typeof responseObject?.code === "string" ? responseObject.code : undefined;
  const message = typeof responseObject?.message === "string"
    ? responseObject.message
    : typeof response === "string"
      ? response
      : error instanceof Error
        ? error.message
        : "同步失败";

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return { status: "CONFLICT", code: "COMMAND_ID_CONFLICT", message: "该离线命令标识已被其他请求占用，请使用原输入重试" };
  }
  if (code === "COMMAND_ID_CONFLICT" || code === "LIFECYCLE_VERSION_CONFLICT") {
    return { status: "CONFLICT", code, message };
  }
  if (statusCode >= 500) return { status: "RETRYABLE_FAILURE", code, message };
  return { status: "REJECTED", code, message };
}

function toConstructionPhotoResponse(photo: {
  id: string;
  recordId?: string | null;
  stage?: ConstructionPhotoStage | null;
  url?: string | null;
  uploadedById?: string | null;
  takenAt?: Date | null;
  status?: ConstructionEvidenceStatus | null;
}) {
  const response: {
    id: string;
    recordId?: string | null;
    stage?: ConstructionPhotoStage | null;
    url?: string | null;
    uploadedById?: string | null;
    takenAt?: Date | null;
    status?: ConstructionEvidenceStatus | null;
  } = { id: photo.id };
  if ("recordId" in photo) response.recordId = photo.recordId;
  if ("stage" in photo) response.stage = photo.stage;
  if ("url" in photo) response.url = photo.url;
  if ("uploadedById" in photo) response.uploadedById = photo.uploadedById;
  if ("takenAt" in photo) response.takenAt = photo.takenAt;
  if ("status" in photo) response.status = photo.status;
  return response;
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
