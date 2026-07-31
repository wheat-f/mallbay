/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import {
  CrossStoreTaskStatus,
  DictionaryStatus,
  NotificationType,
  OrderStatus,
  Prisma,
  ProductUnit,
  StorePosition
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionPolicy } from "../common/policies/permission.policy";
import { NotificationsService } from "../notifications/notifications.service";
import type { AuthenticatedConstructionUser } from "./construction.service";
import {
  CancelCrossStoreTaskDto,
  CompleteCrossStoreAcceptanceDto,
  CrossStoreTaskScope,
  ListCrossStoreTasksDto,
  RejectCrossStoreTaskDto,
  UpsertCrossStoreProductMappingDto
} from "./dto/cross-store-construction.dto";

@Injectable()
export class CrossStoreConstructionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService
  ) {}

  async list(user: AuthenticatedConstructionUser, query: ListCrossStoreTasksDto) {
    this.assertStoreViewer(user, query.storeId);
    return this.prisma.crossStoreConstructionTask.findMany({
      where: {
        ...(query.scope === CrossStoreTaskScope.SOURCE
          ? { sourceStoreId: query.storeId }
          : { executionStoreId: query.storeId }),
        ...(query.status ? { status: query.status } : {})
      },
      orderBy: { createdAt: "desc" },
      include: {
        sourceStore: { select: { id: true, name: true } },
        executionStore: { select: { id: true, name: true } },
        order: {
          include: {
            customer: { select: { id: true, name: true, companyName: true } },
            vehicle: { select: { id: true, carPlate: true, carModel: true, carColor: true } },
            amount: true
          }
        }
      }
    });
  }

  async get(user: AuthenticatedConstructionUser, id: string) {
    const task = await this.loadTask(id);
    this.assertTaskViewer(user, task.sourceStoreId, task.executionStoreId);
    return task;
  }

  async accept(user: AuthenticatedConstructionUser, id: string) {
    const task = await this.loadTask(id);
    this.assertExecutionOperator(user, task.executionStoreId);
    if (task.status !== CrossStoreTaskStatus.PENDING_ACCEPTANCE) {
      throw new BadRequestException("仅待接单的跨门店任务可以接受");
    }
    const updated = await this.prisma.crossStoreConstructionTask.update({
      where: { id },
      data: {
        status: CrossStoreTaskStatus.READY_TO_DISPATCH,
        acceptedById: user.id,
        acceptedAt: new Date(),
        rejectionReason: null,
        version: { increment: 1 }
      }
    });
    await this.notifyStore(task.sourceStoreId, NotificationType.CROSS_STORE_TASK_ACCEPTED, {
      taskId: task.id,
      orderId: task.orderId,
      executionStoreId: task.executionStoreId
    });
    return updated;
  }

  async reject(user: AuthenticatedConstructionUser, id: string, dto: RejectCrossStoreTaskDto) {
    const task = await this.loadTask(id);
    this.assertExecutionOperator(user, task.executionStoreId);
    if (task.status !== CrossStoreTaskStatus.PENDING_ACCEPTANCE) {
      throw new BadRequestException("仅待接单的跨门店任务可以拒绝");
    }
    const reason = dto.reason.trim();
    const updated = await this.prisma.crossStoreConstructionTask.update({
      where: { id },
      data: {
        status: CrossStoreTaskStatus.REJECTED,
        rejectionReason: reason,
        version: { increment: 1 }
      }
    });
    await this.notifyStore(task.sourceStoreId, NotificationType.CROSS_STORE_TASK_REJECTED, {
      taskId: task.id,
      orderId: task.orderId,
      reason
    });
    return updated;
  }

  async cancel(user: AuthenticatedConstructionUser, id: string, dto: CancelCrossStoreTaskDto) {
    const task = await this.loadTask(id);
    this.assertSourceManager(user, task.sourceStoreId);
    if (
      task.status === CrossStoreTaskStatus.IN_CONSTRUCTION ||
      task.status === CrossStoreTaskStatus.PENDING_SOURCE_ACCEPTANCE ||
      task.status === CrossStoreTaskStatus.COMPLETED ||
      task.status === CrossStoreTaskStatus.CANCELLED
    ) {
      throw new BadRequestException("任务已开工或已结束，不能直接取消");
    }
    const reason = dto.reason.trim();
    const updated = await this.prisma.crossStoreConstructionTask.update({
      where: { id },
      data: {
        status: CrossStoreTaskStatus.CANCELLED,
        cancellationReason: reason,
        cancelledById: user.id,
        cancelledAt: new Date(),
        version: { increment: 1 }
      }
    });
    await this.notifyStore(task.executionStoreId, NotificationType.CROSS_STORE_TASK_CANCELLED, {
      taskId: task.id,
      orderId: task.orderId,
      reason
    });
    return updated;
  }

  async submitForSourceAcceptance(
    user: AuthenticatedConstructionUser,
    id: string,
    dto: CompleteCrossStoreAcceptanceDto
  ) {
    const task = await this.loadTask(id);
    this.assertExecutionOperator(user, task.executionStoreId);
    if (
      task.status !== CrossStoreTaskStatus.DISPATCHED &&
      task.status !== CrossStoreTaskStatus.IN_CONSTRUCTION
    ) {
      throw new BadRequestException("仅已派工或施工中的任务可以提交来源门店验收");
    }
    const updated = await this.prisma.crossStoreConstructionTask.update({
      where: { id },
      data: {
        status: CrossStoreTaskStatus.PENDING_SOURCE_ACCEPTANCE,
        submittedForAcceptanceAt: new Date(),
        requirementsSnapshot: mergeSnapshotRemark(task.requirementsSnapshot, dto.remark),
        version: { increment: 1 }
      }
    });
    await this.notifyStore(task.sourceStoreId, NotificationType.CROSS_STORE_TASK_SUBMITTED, {
      taskId: task.id,
      orderId: task.orderId,
      remark: dto.remark.trim()
    });
    return updated;
  }

  async completeSourceAcceptance(user: AuthenticatedConstructionUser, id: string) {
    const task = await this.loadTask(id);
    this.assertSourceManager(user, task.sourceStoreId);
    if (task.status !== CrossStoreTaskStatus.PENDING_SOURCE_ACCEPTANCE) {
      throw new BadRequestException("仅待来源门店验收的任务可以完成");
    }
    const completedAt = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const completedTask = await tx.crossStoreConstructionTask.update({
        where: { id },
        data: {
          status: CrossStoreTaskStatus.COMPLETED,
          sourceAcceptedById: user.id,
          completedAt,
          version: { increment: 1 }
        }
      });

      return completedTask;
    });
    await this.notifyStore(task.executionStoreId, NotificationType.CROSS_STORE_TASK_COMPLETED, {
      taskId: task.id,
      orderId: task.orderId
    });
    return updated;
  }

  async listProductMappings(
    user: AuthenticatedConstructionUser,
    sourceStoreId: string,
    executionStoreId: string
  ) {
    this.assertEitherStoreManager(user, sourceStoreId, executionStoreId);
    return this.prisma.crossStoreProductMapping.findMany({
      where: {
        sourceProduct: { storeId: sourceStoreId },
        executionStoreId
      },
      include: {
        sourceProduct: true,
        executionProduct: true,
        executionStore: { select: { id: true, name: true } }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async upsertProductMapping(
    user: AuthenticatedConstructionUser,
    dto: UpsertCrossStoreProductMappingDto
  ) {
    const [sourceProduct, executionProduct, executionStore] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: dto.sourceProductId },
        include: { store: { select: { id: true, financialEntityId: true } } }
      }),
      this.prisma.product.findUnique({
        where: { id: dto.executionProductId },
        include: { store: { select: { id: true, financialEntityId: true } } }
      }),
      this.prisma.store.findUnique({
        where: { id: dto.executionStoreId },
        select: { id: true, financialEntityId: true, crossStoreConstructionEnabled: true }
      })
    ]);
    if (!sourceProduct || !executionProduct || !executionStore) {
      throw new NotFoundException("来源产品、执行产品或执行门店不存在");
    }
    this.assertEitherStoreManager(user, sourceProduct.storeId, executionStore.id);
    if (
      sourceProduct.store.financialEntityId !== executionStore.financialEntityId ||
      executionProduct.storeId !== executionStore.id ||
      executionProduct.store.financialEntityId !== executionStore.financialEntityId
    ) {
      throw new BadRequestException("产品映射只能建立在同一财务主体的来源门店与执行门店之间");
    }
    if (!executionStore.crossStoreConstructionEnabled) {
      throw new BadRequestException("执行门店尚未启用跨门店施工");
    }
    const sourceDefaultUnit = sourceProduct.salesUnit ?? sourceProduct.unit;
    const sourceMetersPerRoll = sourceProduct.metersPerRoll ? Number(sourceProduct.metersPerRoll.toString()) : 0;
    const sourceUnitSupported = dto.sourceSalesUnit === sourceDefaultUnit || (
      sourceMetersPerRoll > 0 &&
      [sourceDefaultUnit, dto.sourceSalesUnit].every((unit) => unit === ProductUnit.ROLL || unit === ProductUnit.METER)
    );
    if (!sourceUnitSupported) {
      throw new BadRequestException("来源销售单位不是该产品支持的销售单位");
    }
    if (dto.executionInventoryUnit !== executionProduct.inventoryUnit) {
      throw new BadRequestException("执行库存单位必须与执行门店产品档案的库存单位一致");
    }
    const rawFactor = dto.conversionSnapshot?.executionQuantityPerSourceUnit;
    const executionQuantityPerSourceUnit = dto.sourceSalesUnit === dto.executionInventoryUnit
      ? 1
      : Number(rawFactor);
    if (!Number.isFinite(executionQuantityPerSourceUnit) || executionQuantityPerSourceUnit <= 0) {
      throw new BadRequestException("不同单位的产品映射必须填写大于 0 的执行数量换算系数");
    }
    const conversionSnapshot = {
      sourceSalesUnit: dto.sourceSalesUnit,
      executionInventoryUnit: dto.executionInventoryUnit,
      executionQuantityPerSourceUnit
    } satisfies Prisma.InputJsonObject;
    return this.prisma.crossStoreProductMapping.upsert({
      where: {
        sourceProductId_executionStoreId: {
          sourceProductId: sourceProduct.id,
          executionStoreId: executionStore.id
        }
      },
      create: {
        financialEntityId: executionStore.financialEntityId,
        sourceProductId: sourceProduct.id,
        executionStoreId: executionStore.id,
        executionProductId: executionProduct.id,
        sourceSalesUnit: dto.sourceSalesUnit,
        executionInventoryUnit: dto.executionInventoryUnit,
        conversionSnapshot,
        createdById: user.id
      },
      update: {
        executionProductId: executionProduct.id,
        sourceSalesUnit: dto.sourceSalesUnit,
        executionInventoryUnit: dto.executionInventoryUnit,
        conversionSnapshot,
        status: DictionaryStatus.ACTIVE,
        updatedById: user.id
      },
      include: { sourceProduct: true, executionProduct: true }
    });
  }

  private async loadTask(id: string) {
    const task = await this.prisma.crossStoreConstructionTask.findUnique({
      where: { id },
      include: {
        sourceStore: { select: { id: true, name: true } },
        executionStore: { select: { id: true, name: true } },
        order: {
          include: {
            customer: { select: { id: true, name: true, companyName: true } },
            vehicle: { select: { id: true, carPlate: true, carModel: true, carColor: true } },
            amount: true,
            items: { include: { product: true } },
            constructionRecord: {
              include: {
                assignments: {
                  include: { worker: { select: { id: true, username: true, nickname: true } } }
                }
              }
            }
          }
        }
      }
    });
    if (!task) throw new NotFoundException("跨门店施工任务不存在");
    return task;
  }

  private assertStoreViewer(user: AuthenticatedConstructionUser, storeId: string) {
    if (PermissionPolicy.hasRuntimeSnapshot(user.id)) {
      if (!PermissionPolicy.canRuntime(user as never, "construction", "read", storeId)) throw new ForbiddenException("无权限");
      return;
    }
    if (!user.isAuditor && user.storeMember?.storeId !== storeId) throw new ForbiddenException("无权限");
  }

  private assertTaskViewer(user: AuthenticatedConstructionUser, sourceStoreId: string, executionStoreId: string) {
    if (PermissionPolicy.hasRuntimeSnapshot(user.id)) {
      if (!PermissionPolicy.canRuntime(user as never, "construction", "read", sourceStoreId) && !PermissionPolicy.canRuntime(user as never, "construction", "read", executionStoreId)) throw new ForbiddenException("无权限");
      return;
    }
    if (!user.isAuditor && user.storeMember?.storeId !== sourceStoreId && user.storeMember?.storeId !== executionStoreId) throw new ForbiddenException("无权限");
  }

  private assertExecutionOperator(user: AuthenticatedConstructionUser, storeId: string) {
    if (PermissionPolicy.hasRuntimeSnapshot(user.id)) {
      if (!PermissionPolicy.canRuntime(user as never, "construction", "write", storeId)) throw new ForbiddenException("仅执行门店店长或施工主管可操作");
      return;
    }
    if (user.isAuditor) return;
    if (user.storeMember?.storeId !== storeId || (user.storeMember.position !== StorePosition.MANAGER && user.storeMember.position !== StorePosition.SCHEDULER)) throw new ForbiddenException("仅执行门店店长或施工主管可操作");
  }

  private assertSourceManager(user: AuthenticatedConstructionUser, storeId: string) {
    if (PermissionPolicy.hasRuntimeSnapshot(user.id)) {
      if (!PermissionPolicy.canRuntime(user as never, "construction", "write", storeId)) throw new ForbiddenException("仅来源门店店长可操作");
      return;
    }
    if (user.isAuditor) return;
    if (user.storeMember?.storeId !== storeId || user.storeMember.position !== StorePosition.MANAGER) throw new ForbiddenException("仅来源门店店长可操作");
  }

  private assertEitherStoreManager(user: AuthenticatedConstructionUser, sourceStoreId: string, executionStoreId: string) {
    if (PermissionPolicy.hasRuntimeSnapshot(user.id)) {
      if (!PermissionPolicy.canRuntime(user as never, "construction", "write", sourceStoreId) && !PermissionPolicy.canRuntime(user as never, "construction", "write", executionStoreId)) throw new ForbiddenException("仅协作双方门店店长可维护产品映射");
      return;
    }
    if (user.isAuditor) return;
    if (user.storeMember?.position !== StorePosition.MANAGER || (user.storeMember.storeId !== sourceStoreId && user.storeMember.storeId !== executionStoreId)) throw new ForbiddenException("仅协作双方门店店长可维护产品映射");
  }
  private async notifyStore(storeId: string, type: NotificationType, payload: object) {
    const recipients = await this.prisma.storeMember.findMany({
      where: {
        storeId,
        position: { in: [StorePosition.MANAGER, StorePosition.SCHEDULER] }
      },
      select: { userId: true }
    });
    await Promise.all(
      recipients.map(({ userId }) =>
        this.notifications?.send(userId, type, payload)
      )
    );
  }
}

function mergeSnapshotRemark(snapshot: Prisma.JsonValue, remark: string): Prisma.InputJsonValue {
  const base = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? snapshot as Prisma.JsonObject
    : {};
  return {
    ...base,
    executionAcceptanceRemark: remark.trim()
  };
}
