import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Optional,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { DictionaryStatus, StorePosition, StoreStatus, SubmissionStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";
import { CreateStoreDto } from "./dto/create-store.dto";
import { SubmitStoreDto } from "./dto/submit-store.dto";
import { ReviewStoreDto } from "./dto/review-store.dto";
import { ListStoresDto } from "./dto/list-stores.dto";
import { ChangeManagerDto } from "./dto/change-manager.dto";
import {
  CreateFinancialEntityDto,
  UpdateStoreCrossStoreConfigDto
} from "./dto/cross-store-config.dto";
import { ChangeStoreManagerUseCase } from "./use-cases/change-store-manager.use-case";
import { ReviewStoreSubmissionUseCase } from "./use-cases/review-store-submission.use-case";
import { SetStoreFrozenUseCase } from "./use-cases/set-store-frozen.use-case";
import { SubmitStoreForReviewUseCase } from "./use-cases/submit-store-for-review.use-case";
import { DictionariesService } from "../settings/dictionaries.service";
import { AccessContext } from "../permissions/domain/access-context";

@Injectable()
export class StoresService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReviewStoreSubmissionUseCase) private readonly reviewStoreSubmission: ReviewStoreSubmissionUseCase,
    @Inject(SubmitStoreForReviewUseCase) private readonly submitStoreForReview: SubmitStoreForReviewUseCase,
    @Inject(ChangeStoreManagerUseCase) private readonly changeStoreManager: ChangeStoreManagerUseCase,
    @Inject(SetStoreFrozenUseCase) private readonly setStoreFrozen: SetStoreFrozenUseCase,
    @Inject(DictionariesService) private readonly dictionaries: DictionariesService,
    @Optional() @Inject(AccessContext) private readonly accessContext?: AccessContext
  ) {}

  // ─── 管理员：创建门店并指派店长 ────────────────────────────────────────────

  async createStore(auditorId: string, dto: CreateStoreDto) {
    await this.assertGlobalPermission(auditorId, "store", "write");

    const manager = await this.prisma.user.findUnique({ where: { id: dto.managerId } });
    if (!manager) throw new NotFoundException("指定的用户不存在");

    // 检查目标用户是否已在其他门店
    const existingMember = await this.prisma.storeMember.findUnique({
      where: { userId: dto.managerId }
    });
    if (existingMember) throw new BadRequestException("该用户已是其他门店的成员");

    const store = await this.prisma.$transaction(async (tx) => {
      const financialEntity = dto.financialEntityId
        ? await tx.financialEntity.findUnique({ where: { id: dto.financialEntityId } })
        : await tx.financialEntity.create({
          data: {
            code: `FE_${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
            name: `${dto.name}财务主体`
          }
        });
      if (!financialEntity || financialEntity.status !== DictionaryStatus.ACTIVE) {
        throw new BadRequestException("财务主体不存在或已停用");
      }

      const store = await tx.store.create({
        data: {
          name: dto.name,
          status: StoreStatus.DRAFTED,
          createdById: auditorId,
          financialEntityId: financialEntity.id,
          crossStoreConstructionEnabled: dto.crossStoreConstructionEnabled ?? false
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

    await this.dictionaries.initializeDefaultsForStore(store.id, auditorId);

    return store;
  }

  // ─── 店长：提交门店信息送审 ────────────────────────────────────────────────

  async submitStore(userId: string, storeId: string, dto: SubmitStoreDto) {
    return this.submitStoreForReview.execute(userId, storeId, dto);
  }

  // ─── 管理员：审核门店提交 ──────────────────────────────────────────────────

  async reviewSubmission(auditorId: string, submissionId: string, dto: ReviewStoreDto) {
    await this.assertGlobalPermission(auditorId, "store", "write");
    return this.reviewStoreSubmission.execute(auditorId, submissionId, dto);
  }

  private async assertPermission(actorId: string, permission: string, action: string, storeId?: string) {
    if (!this.accessContext) throw new ForbiddenException({ code: "ACCESS_DENIED", message: "权限上下文未配置" });
    const scope = await this.accessContext.scope({ userId: actorId }, permission, action, storeId ? { storeId } : {});
    if (!scope.allowed) throw new ForbiddenException({ code: scope.reason ?? "ACCESS_DENIED", message: "无权限" });
  }

  private async assertGlobalPermission(actorId: string, permission: string, action: string) {
    if (!this.accessContext) throw new ForbiddenException({ code: "ACCESS_DENIED", message: "权限上下文未配置" });
    const scope = await this.accessContext.scope({ userId: actorId }, permission, action);
    if (!scope.allowed || !scope.global) throw new ForbiddenException({ code: scope.reason ?? "ACCESS_DENIED", message: "无权限" });
  }

  async listEligibleExecutionStores(actorId: string, sourceStoreId: string) {
    await this.assertPermission(actorId, "store", "read", sourceStoreId);
    return this.listEligibleExecutionStoresInternal(actorId, sourceStoreId);
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

  // ─── 管理员：全量门店列表（含所有状态）────────────────────────────────────

  async listAllStores(actorId: string, dto: ListStoresDto) {
    await this.assertGlobalPermission(actorId, "store", "read");

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

  private async listEligibleExecutionStoresInternal(userId: string, sourceStoreId: string) {
    const sourceStore = await this.prisma.store.findUnique({
      where: { id: sourceStoreId },
      select: { financialEntityId: true, crossStoreConstructionEnabled: true }
    });
    if (!sourceStore) throw new NotFoundException("来源门店不存在");
    if (!sourceStore.crossStoreConstructionEnabled) return [];

    return this.prisma.store.findMany({
      where: {
        id: { not: sourceStoreId },
        financialEntityId: sourceStore.financialEntityId,
        crossStoreConstructionEnabled: true,
        status: StoreStatus.PUBLISHED
      },
      select: { id: true, name: true, address: true },
      orderBy: { name: "asc" }
    });
  }

  async listFinancialEntities(actorId: string) {
    await this.assertGlobalPermission(actorId, "store", "read");
    return this.prisma.financialEntity.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        stores: {
          select: {
            id: true,
            name: true,
            status: true,
            crossStoreConstructionEnabled: true
          },
          orderBy: { name: "asc" }
        }
      }
    });
  }

  async createFinancialEntity(actorId: string, dto: CreateFinancialEntityDto) {
    await this.assertGlobalPermission(actorId, "store", "write");
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    if (!code || !name) throw new BadRequestException("财务主体编码和名称不能为空");
    const existing = await this.prisma.financialEntity.findUnique({ where: { code } });
    if (existing) throw new BadRequestException("财务主体编码已存在");
    return this.prisma.financialEntity.create({ data: { code, name } });
  }

  async updateCrossStoreConfig(
    actorId: string,
    storeId: string,
    dto: UpdateStoreCrossStoreConfigDto
  ) {
    await this.assertGlobalPermission(actorId, "store", "write");
    const [store, financialEntity] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }),
      this.prisma.financialEntity.findUnique({ where: { id: dto.financialEntityId } })
    ]);
    if (!store) throw new NotFoundException("门店不存在");
    if (!financialEntity || financialEntity.status !== DictionaryStatus.ACTIVE) {
      throw new BadRequestException("财务主体不存在或已停用");
    }
    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        financialEntityId: financialEntity.id,
        crossStoreConstructionEnabled: dto.enabled ?? true
      },
      select: {
        id: true,
        name: true,
        financialEntityId: true,
        crossStoreConstructionEnabled: true
      }
    });
  }
  // ─── 管理员：待审核提交列表 ────────────────────────────────────────────────

  async listPendingSubmissions(actorId: string) {
    await this.assertGlobalPermission(actorId, "store", "read");

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

  // ─── 门店成员：工作台门店详情（含成员列表）────────────────────────────────

  async getWorkbenchStore(userId: string, storeId: string) {
    const member = await this.prisma.storeMember.findUnique({ where: { userId } });
    if (!member || member.storeId !== storeId) {
      throw new ForbiddenException("仅本店成员可访问");
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
      currentMember: {
        id: member.id,
        position: member.position
      },
      members: store.members.map((m) => ({
        id: m.id,
        position: m.position,
        user: m.user
      }))
    };
  }

  // ─── 管理员：门店详情（含待审核提交）────────────────────────────────────────

  async getAdminStoreDetail(actorId: string, storeId: string) {
    await this.assertGlobalPermission(actorId, "store", "read");

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
      financialEntityId: store.financialEntityId,
      crossStoreConstructionEnabled: store.crossStoreConstructionEnabled,
      address: store.address,
      description: store.description,
      createdAt: store.createdAt,
      photos: store.photos,
      manager: store.members[0]?.user ?? null,
      pendingSubmission: pendingSubmission ?? null
    };
  }

  // ─── 管理员：冻结 / 解冻门店 ──────────────────────────────────────────────

  async setFrozen(actorId: string, storeId: string, frozen: boolean) {
    await this.assertGlobalPermission(actorId, "store", "write");
    return this.setStoreFrozen.execute(actorId, storeId, frozen);
  }

  // ─── 管理员：变更店长 ──────────────────────────────────────────────────────

  async changeManager(actorId: string, storeId: string, dto: ChangeManagerDto) {
    await this.assertGlobalPermission(actorId, "store", "write");
    return this.changeStoreManager.execute(actorId, storeId, dto);
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
