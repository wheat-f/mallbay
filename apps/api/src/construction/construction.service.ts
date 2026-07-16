/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  ConstructionPhotoStage,
  ConstructionTaskStatus,
  InventoryMovementType,
  LeaveRequestStatus,
  OrderStatus,
  Prisma,
  QualityCheckResult,
  StorePosition
} from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import type { MulterFile } from "../users/multer-file.type";
import { OssService } from "../users/oss.service";
import { ConstructionCostSettlementService } from "./construction-cost-settlement.service";
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
    @Optional() private readonly costSettlements?: ConstructionCostSettlementService
  ) {}

  async listCapacities(user: AuthenticatedConstructionUser, query: ListConstructionDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) {
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
    if (!PermissionPolicy.canDispatchConstruction(actor, dto.storeId)) {
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
    if (!PermissionPolicy.canDispatchConstruction(actor, capacity.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.dailyCapacity.update({ where: { id }, data: dto });
  }

  async listAssignments(user: AuthenticatedConstructionUser, query: ListConstructionDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const where: Prisma.ConstructionRecordWhereInput = { storeId: query.storeId };
    if (!actor.isAuditor && actor.storeMember?.position === StorePosition.SALES) {
      where.order = { salesPersonId: actor.id };
    }
    if (
      !actor.isAuditor &&
      (actor.storeMember?.position === StorePosition.CONSTRUCTION ||
        actor.storeMember?.position === StorePosition.APPRENTICE)
    ) {
      where.assignments = { some: { workerUserId: actor.id } };
    }
    return this.prisma.constructionRecord.findMany({
      where,
      orderBy: { dispatchedAt: "desc" },
      include: constructionRecordInclude
    });
  }

  async assignOrder(user: AuthenticatedConstructionUser, orderId: string, dto: AssignOrderDto) {
    const actor = await this.withStoreMember(user);
    const workerIds = [...new Set(dto.workerUserIds)];
    if (workerIds.length < 1 || workerIds.length > 3) {
      throw new BadRequestException("施工人员必须为 1 到 3 人");
    }

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException("订单不存在");
      }
      if (!PermissionPolicy.canDispatchConstruction(actor, order.storeId)) {
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

      const members = await tx.storeMember.findMany({
        where: {
          storeId: order.storeId,
          userId: { in: workerIds },
          position: { in: [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE] }
        }
      });
      if (members.length !== workerIds.length) {
        throw new BadRequestException("施工人员必须属于本门店且岗位有效");
      }

      const assignmentDate = order.appointmentDate ?? new Date();
      for (const workerId of workerIds) {
        const leave = await tx.leaveRequest.findFirst({
          where: {
            storeId: order.storeId,
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
          storeId: order.storeId,
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
      return record;
    });
  }

  async startOrder(user: AuthenticatedConstructionUser, orderId: string, dto: StartConstructionDto = {}) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecordForOrder(orderId);
    this.assertAssignedWorker(actor, record);
    if (record.order.status !== OrderStatus.DISPATCHED) {
      throw new BadRequestException("只有已派单订单可以开工");
    }
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.IN_CONSTRUCTION } });
    return this.prisma.constructionRecord.update({
      where: { id: record.id },
      data: { startedAt, status: ConstructionTaskStatus.IN_CONSTRUCTION }
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
    if (!PermissionPolicy.canUploadConstructionPhoto(actor, record.storeId, assignedWorkerId)) {
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
    return this.completeRecord(actor, record, dto);
  }

  async completeOrderForOrder(user: AuthenticatedConstructionUser, orderId: string, dto: CompleteConstructionDto) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecordForOrder(orderId);
    return this.completeRecord(actor, record, dto);
  }

  private async completeRecord(
    actor: UserWithStoreMember,
    record: ConstructionRecordWithRelations,
    dto: CompleteConstructionDto
  ) {
    this.assertAssignedWorker(actor, record);
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

    await this.prisma.order.update({ where: { id: record.orderId }, data: { status: OrderStatus.COMPLETED } });
    const updated = await this.prisma.constructionRecord.update({
      where: { id: record.id },
      data: {
        status: ConstructionTaskStatus.COMPLETED,
        completedAt,
        actualMinutes,
        overtimeMinutes
      }
    });
    await this.createCommissionSnapshots(actor.id, record);
    await this.costSettlements?.initializeForCompletedRecord(record.id, actor.id);
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
    const record = await this.findRecord(recordId);
    if (!PermissionPolicy.canQualityCheckConstruction(actor, record.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (dto.result === QualityCheckResult.REWORK_REQUIRED) {
      await this.prisma.order.update({
        where: { id: record.orderId },
        data: { status: OrderStatus.IN_CONSTRUCTION }
      });
    }
    return this.prisma.constructionRecord.update({
      where: { id: recordId },
      data: {
        qualityResult: dto.result,
        qualityNote: dto.note,
        qualityCheckedById: actor.id,
        qualityCheckedAt: new Date(),
        status: dto.result === QualityCheckResult.REWORK_REQUIRED
          ? ConstructionTaskStatus.IN_CONSTRUCTION
          : ConstructionTaskStatus.COMPLETED
      }
    });
  }

  async getOrderMaterials(user: AuthenticatedConstructionUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecordForOrder(orderId);
    this.assertCanAccessOrderMaterials(actor, record);

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
    this.assertCanAccessOrderMaterials(actor, record);
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
    this.assertCanAccessOrderMaterials(actor, record);
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
    this.assertCanAccessOrderMaterials(actor, record);
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
    if (!PermissionPolicy.canDispatchConstruction(actor, dto.storeId)) {
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
    if (!PermissionPolicy.canViewStoreData(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }
    const profiles = await this.prisma.constructionWorkerProfile.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { username: true, nickname: true } } }
    });
    const profileUserIds = new Set(profiles.map((profile) => profile.userId));
    const constructionMembers = await this.prisma.storeMember.findMany({
      where: {
        storeId,
        position: { in: [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE] }
      },
      orderBy: { updatedAt: "desc" },
      include: { user: { select: { username: true, nickname: true } } }
    });
    const profilelessMembers = constructionMembers
      .filter((member) => !profileUserIds.has(member.userId))
      .map((member) => ({
        storeId,
        userId: member.userId,
        canWorkOutside: false,
        skillTags: [],
        isActive: true,
        user: member.user
      }));

    return [...profiles, ...profilelessMembers];
  }

  async createLeave(user: AuthenticatedConstructionUser, dto: LeaveRequestDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canDispatchConstruction(actor, dto.storeId) && actor.id !== dto.workerId) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.leaveRequest.create({
      data: {
        storeId: dto.storeId,
        workerId: dto.workerId,
        startDate: normalizeDate(dto.startDate),
        endDate: normalizeDate(dto.endDate),
        reason: dto.reason,
        status: PermissionPolicy.canDispatchConstruction(actor, dto.storeId)
          ? LeaveRequestStatus.APPROVED
          : LeaveRequestStatus.PENDING
      }
    });
  }

  async listLeaves(user: AuthenticatedConstructionUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.leaveRequest.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: {
        worker: { select: { id: true, username: true, nickname: true, avatarUrl: true } }
      }
    });
  }

  async updateLeave(user: AuthenticatedConstructionUser, id: string, dto: UpdateLeaveRequestDto) {
    const actor = await this.withStoreMember(user);
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) {
      throw new NotFoundException("请假记录不存在");
    }
    if (!PermissionPolicy.canDispatchConstruction(actor, leave.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: dto.status as LeaveRequestStatus | undefined },
      include: {
        worker: { select: { id: true, username: true, nickname: true, avatarUrl: true } }
      }
    });
  }

  async upsertSchedule(user: AuthenticatedConstructionUser, dto: UpsertScheduleDto) {
    const actor = await this.withStoreMember(user);
    const position = actor.storeMember?.position;
    const canUpdateOwnSchedule = (
      actor.storeMember?.storeId === dto.storeId &&
      (position === StorePosition.CONSTRUCTION || position === StorePosition.APPRENTICE) &&
      actor.id === dto.workerId
    );
    if (!PermissionPolicy.canDispatchConstruction(actor, dto.storeId) && !canUpdateOwnSchedule) {
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
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }

    const position = actor.storeMember?.position;
    const isWorker = position === StorePosition.CONSTRUCTION || position === StorePosition.APPRENTICE;
    if (!isWorker && !PermissionPolicy.canDispatchConstruction(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }

    return this.prisma.schedule.findMany({
      where: {
        storeId: query.storeId,
        date: buildDateRange(query.from, query.to),
        workerId: isWorker && !actor.isAuditor ? actor.id : undefined
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

  private assertAssignedWorker(user: UserWithStoreMember, record: ConstructionRecordWithRelations) {
    const assignedWorkerId = this.getAssignedWorkerId(user.id, record);
    if (!PermissionPolicy.canWorkOnConstructionTask(user, record.storeId, assignedWorkerId)) {
      throw new ForbiddenException("无权限");
    }
  }

  private assertCanAccessOrderMaterials(user: UserWithStoreMember, record: ConstructionRecordWithRelations) {
    const assignedWorkerId = this.getAssignedWorkerId(user.id, record);
    if (
      !PermissionPolicy.canDispatchConstruction(user, record.storeId) &&
      !PermissionPolicy.canWorkOnConstructionTask(user, record.storeId, assignedWorkerId)
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
