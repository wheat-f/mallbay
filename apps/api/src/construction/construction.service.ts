/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  ConstructionPhotoStage,
  ConstructionTaskStatus,
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
import {
  AssignOrderDto,
  CompleteConstructionDto,
  LeaveRequestDto,
  ListConstructionDto,
  QualityCheckDto,
  UpdateDailyCapacityDto,
  UpdateLeaveRequestDto,
  UploadConstructionPhotoDto,
  UpsertDailyCapacityDto,
  UpsertScheduleDto,
  UpsertWorkerProfileDto
} from "./dto/construction.dto";

export type AuthenticatedConstructionUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class ConstructionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly oss?: OssService
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
      orderBy: { date: "asc" }
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

  async startOrder(user: AuthenticatedConstructionUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    const record = await this.findRecordForOrder(orderId);
    this.assertAssignedWorker(actor, record);
    if (record.order.status !== OrderStatus.DISPATCHED) {
      throw new BadRequestException("只有已派单订单可以开工");
    }
    await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.IN_CONSTRUCTION } });
    return this.prisma.constructionRecord.update({
      where: { id: record.id },
      data: { startedAt: new Date(), status: ConstructionTaskStatus.IN_CONSTRUCTION }
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
    return updated;
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
    return this.prisma.constructionWorkerProfile.findMany({
      where: { storeId },
      orderBy: { updatedAt: "desc" }
    });
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
    return this.prisma.leaveRequest.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } });
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
      data: { status: dto.status as LeaveRequestStatus | undefined }
    });
  }

  async upsertSchedule(user: AuthenticatedConstructionUser, dto: UpsertScheduleDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canDispatchConstruction(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const date = normalizeDate(dto.date);
    return this.prisma.schedule.upsert({
      where: { workerId_date: { workerId: dto.workerId, date } },
      create: { storeId: dto.storeId, workerId: dto.workerId, date, status: dto.status, note: dto.note },
      update: { status: dto.status, note: dto.note }
    });
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

  private async createCommissionSnapshots(createdById: string, record: ConstructionRecordWithRelations) {
    const existing = await this.prisma.workerCommissionSnapshot.findFirst({
      where: { recordId: record.id }
    });
    if (existing) {
      return;
    }
    await this.prisma.workerCommissionSnapshot.createMany({
      data: record.assignments.map((assignment) => ({
        recordId: record.id,
        orderId: record.orderId,
        workerUserId: assignment.workerUserId,
        amountCents: 0,
        calculationNote: "Phase 2 完工快照，复杂提成规则进入 Phase 4",
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
  order: true,
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
