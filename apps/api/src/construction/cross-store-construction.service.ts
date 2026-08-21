/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  DictionaryStatus,
  Prisma,
  ProductUnit
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AccessContext } from "../permissions/domain/access-context";
import type { AuthenticatedConstructionUser } from "./construction.service";
import {
  CrossStoreTaskScope,
  ListCrossStoreTasksDto,
  UpsertCrossStoreProductMappingDto
} from "./dto/cross-store-construction.dto";

@Injectable()
export class CrossStoreConstructionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext
  ) {}

  async list(user: AuthenticatedConstructionUser, query: ListCrossStoreTasksDto) {
    await this.assertStoreViewer(user, query.storeId);
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
    await this.assertTaskViewer(user, task.sourceStoreId, task.executionStoreId);
    return task;
  }

  async listProductMappings(
    user: AuthenticatedConstructionUser,
    sourceStoreId: string,
    executionStoreId: string
  ) {
    await this.assertEitherStoreManager(user, sourceStoreId, executionStoreId);
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
    await this.assertEitherStoreManager(user, sourceProduct.storeId, executionStore.id);
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

  private async assertStoreViewer(user: AuthenticatedConstructionUser, storeId: string) {
    if (!this.accessContext || !await this.accessContext.can({ userId: user.id }, "construction", "read", { storeId })) throw new ForbiddenException("无权限");
  }

  private async assertTaskViewer(user: AuthenticatedConstructionUser, sourceStoreId: string, executionStoreId: string) {
    const canSource = await this.can(user, "construction", "read", sourceStoreId);
    const canExecution = await this.can(user, "construction", "read", executionStoreId);
    if (!canSource && !canExecution) throw new ForbiddenException("无权限");
  }

  private async assertEitherStoreManager(user: AuthenticatedConstructionUser, sourceStoreId: string, executionStoreId: string) {
    const canSource = await this.can(user, "construction", "write", sourceStoreId);
    const canExecution = await this.can(user, "construction", "write", executionStoreId);
    if (!canSource && !canExecution) throw new ForbiddenException("仅协作双方门店店长可维护产品映射");
  }

  private can(user: AuthenticatedConstructionUser, capability: string, action: string, storeId: string) {
    return this.accessContext.can({ userId: user.id }, capability, action, { storeId });
  }
}
