import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { StorePosition, StoreStatus, SubmissionStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { normalizePagination } from "../common/pagination";
import { CreateStoreDto } from "./dto/create-store.dto";
import { SubmitStoreDto } from "./dto/submit-store.dto";
import { ReviewStoreDto } from "./dto/review-store.dto";
import { ListStoresDto } from "./dto/list-stores.dto";
import { ChangeManagerDto } from "./dto/change-manager.dto";
import { ReviewStoreSubmissionUseCase } from "./use-cases/review-store-submission.use-case";
import { SubmitStoreForReviewUseCase } from "./use-cases/submit-store-for-review.use-case";

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly reviewStoreSubmission: ReviewStoreSubmissionUseCase,
    private readonly submitStoreForReview: SubmitStoreForReviewUseCase
  ) {}

  // ─── 审核员：创建门店并指派店长 ────────────────────────────────────────────

  async createStore(auditorId: string, isAuditor: boolean, dto: CreateStoreDto) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    const manager = await this.prisma.user.findUnique({ where: { id: dto.managerId } });
    if (!manager) throw new NotFoundException("指定的用户不存在");

    // 检查目标用户是否已在其他门店
    const existingMember = await this.prisma.storeMember.findUnique({
      where: { userId: dto.managerId }
    });
    if (existingMember) throw new BadRequestException("该用户已是其他门店的成员");

    const store = await this.prisma.$transaction(async (tx) => {
      const store = await tx.store.create({
        data: {
          name: dto.name,
          status: StoreStatus.DRAFTED,
          createdById: auditorId
        }
      });

      await tx.storeMember.create({
        data: {
          storeId: store.id,
          userId: dto.managerId,
          position: StorePosition.MANAGER
        }
      });

      return store;
    });

    return store;
  }

  // ─── 店长：提交门店信息送审 ────────────────────────────────────────────────

  async submitStore(userId: string, storeId: string, dto: SubmitStoreDto) {
    return this.submitStoreForReview.execute(userId, storeId, dto);
  }

  // ─── 审核员：审核门店提交 ──────────────────────────────────────────────────

  async reviewSubmission(
    auditorId: string,
    isAuditor: boolean,
    submissionId: string,
    dto: ReviewStoreDto
  ) {
    return this.reviewStoreSubmission.execute(auditorId, isAuditor, submissionId, dto);
  }

  // ─── 公开门店列表 ──────────────────────────────────────────────────────────

  async listPublishedStores(dto: ListStoresDto) {
    const { page, pageSize, skip } = normalizePagination(dto.page, dto.pageSize);

    const where = {
      status: StoreStatus.PUBLISHED,
      ...(dto.q
        ? {
            OR: [
              { name: { contains: dto.q, mode: "insensitive" as const } },
              { address: { contains: dto.q, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const [total, stores] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
        include: {
          photos: { where: { isCover: true }, take: 1 }
        }
      })
    ]);

    return {
      total,
      page,
      pageSize,
      items: stores.map((s) => ({
        id: s.id,
        name: s.name,
        address: s.address,
        description: s.description,
        coverUrl: s.photos[0]?.url ?? null
      }))
    };
  }

  // ─── 审核员：全量门店列表（含所有状态）────────────────────────────────────

  async listAllStores(isAuditor: boolean, dto: ListStoresDto) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    const { page, pageSize, skip } = normalizePagination(dto.page, dto.pageSize);

    const where = dto.q
      ? {
          OR: [
            { name: { contains: dto.q, mode: "insensitive" as const } },
            { address: { contains: dto.q, mode: "insensitive" as const } }
          ]
        }
      : {};

    const [total, stores] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          photos: { where: { isCover: true }, take: 1 },
          members: {
            where: { position: StorePosition.MANAGER },
            include: { user: { select: { id: true, username: true, nickname: true } } }
          }
        }
      })
    ]);

    return {
      total,
      page,
      pageSize,
      items: stores.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        address: s.address,
        coverUrl: s.photos[0]?.url ?? null,
        manager: s.members[0]?.user ?? null,
        createdAt: s.createdAt
      }))
    };
  }

  // ─── 审核员：待审核提交列表 ────────────────────────────────────────────────

  async listPendingSubmissions(isAuditor: boolean) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    return this.prisma.storeAuditSubmission.findMany({
      where: { status: SubmissionStatus.PENDING },
      orderBy: { createdAt: "asc" },
      include: {
        store: { select: { id: true, name: true, status: true } },
        submittedBy: { select: { id: true, username: true, nickname: true } }
      }
    });
  }

  // ─── 门店详情 ──────────────────────────────────────────────────────────────

  async getStoreDetail(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId, status: StoreStatus.PUBLISHED },
      include: {
        photos: { orderBy: { order: "asc" } }
      }
    });

    if (!store) throw new NotFoundException("门店不存在或未公开");

    return store;
  }

  // ─── 店长：工作台门店详情（含成员列表）──────────────────────────────────────

  async getWorkbenchStore(userId: string, storeId: string) {
    const member = await this.prisma.storeMember.findUnique({ where: { userId } });
    if (!member || member.storeId !== storeId || member.position !== StorePosition.MANAGER) {
      throw new ForbiddenException("仅店长可访问");
    }

    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      include: {
        photos: { orderBy: { order: "asc" } },
        members: {
          include: {
            user: { select: { id: true, username: true, nickname: true, avatarUrl: true } }
          }
        }
      }
    });

    return {
      id: store.id,
      name: store.name,
      status: store.status,
      address: store.address,
      description: store.description,
      photos: store.photos,
      members: store.members.map((m) => ({
        id: m.id,
        position: m.position,
        user: m.user
      }))
    };
  }

  // ─── 审核员：门店详情（含待审核提交）────────────────────────────────────────

  async getAdminStoreDetail(isAuditor: boolean, storeId: string) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        photos: { orderBy: { order: "asc" } },
        members: {
          where: { position: StorePosition.MANAGER },
          include: { user: { select: { id: true, username: true, nickname: true, avatarUrl: true } } }
        }
      }
    });

    if (!store) throw new NotFoundException("门店不存在");

    const pendingSubmission = await this.prisma.storeAuditSubmission.findFirst({
      where: { storeId, status: SubmissionStatus.PENDING },
      include: {
        photos: { orderBy: { order: "asc" } },
        submittedBy: { select: { id: true, username: true, nickname: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      id: store.id,
      name: store.name,
      status: store.status,
      address: store.address,
      description: store.description,
      createdAt: store.createdAt,
      photos: store.photos,
      manager: store.members[0]?.user ?? null,
      pendingSubmission: pendingSubmission ?? null
    };
  }

  // ─── 审核员：冻结 / 解冻门店 ──────────────────────────────────────────────

  async setFrozen(isAuditor: boolean, storeId: string, frozen: boolean) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException("门店不存在");

    if (frozen && store.status === StoreStatus.FROZEN) {
      throw new BadRequestException("门店已处于冻结状态");
    }
    if (!frozen && store.status !== StoreStatus.FROZEN) {
      throw new BadRequestException("门店未处于冻结状态");
    }

    const newStatus = frozen ? StoreStatus.FROZEN : StoreStatus.PUBLISHED;
    await this.prisma.store.update({ where: { id: storeId }, data: { status: newStatus } });

    // 通知所有员工
    const members = await this.prisma.storeMember.findMany({ where: { storeId } });
    const notifType = frozen ? "STORE_FROZEN" : "STORE_UNFROZEN";
    await Promise.all(
      members.map((m) =>
        this.notifications.send(m.userId, notifType, { storeId, storeName: store.name })
      )
    );

    return { success: true };
  }

  // ─── 审核员：变更店长 ──────────────────────────────────────────────────────

  async changeManager(isAuditor: boolean, storeId: string, dto: ChangeManagerDto) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException("门店不存在");

    const newManager = await this.prisma.user.findUnique({ where: { id: dto.newManagerId } });
    if (!newManager) throw new NotFoundException("指定的用户不存在");

    const currentManager = await this.prisma.storeMember.findFirst({
      where: { storeId, position: StorePosition.MANAGER }
    });

    if (currentManager?.userId === dto.newManagerId) {
      throw new BadRequestException("该用户已是本门店店长");
    }

    // 检查新店长是否在其他门店（不含本门店）
    const newManagerMember = await this.prisma.storeMember.findUnique({
      where: { userId: dto.newManagerId }
    });
    if (newManagerMember && newManagerMember.storeId !== storeId) {
      throw new BadRequestException("该用户已是其他门店的成员");
    }

    await this.prisma.$transaction(async (tx) => {
      // 移除原店长
      if (currentManager) {
        await tx.storeMember.delete({ where: { id: currentManager.id } });
        await this.notifications.send(currentManager.userId, "REMOVED_FROM_STORE", {
          storeId,
          storeName: store.name,
          reason: "店长职位已变更"
        });
      }

      // 若新店长已在本门店，更新岗位；否则新建记录
      if (newManagerMember) {
        await tx.storeMember.update({
          where: { id: newManagerMember.id },
          data: { position: StorePosition.MANAGER }
        });
      } else {
        await tx.storeMember.create({
          data: {
            storeId,
            userId: dto.newManagerId,
            position: StorePosition.MANAGER
          }
        });
      }
    });

    return { success: true };
  }

  // ─── 工具：断言当前用户是指定门店的店长 ───────────────────────────────────

  async assertStoreManager(userId: string, storeId: string) {
    const member = await this.prisma.storeMember.findUnique({
      where: { userId }
    });

    if (!member || member.storeId !== storeId || member.position !== StorePosition.MANAGER) {
      throw new ForbiddenException("仅店长可执行此操作");
    }

    return member;
  }
}
