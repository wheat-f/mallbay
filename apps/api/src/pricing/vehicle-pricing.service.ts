import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DictionaryStatus } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateVehicleModelMappingDto,
  CreateVehiclePriceClassDto,
  ImportVehicleModelMappingsDto,
  ResolveVehiclePriceClassDto,
  UpdateVehicleModelMappingDto,
  UpdateVehiclePriceClassDto
} from "./dto/vehicle-pricing.dto";
import type { PricingAuthenticatedUser } from "./pricing.service";

@Injectable()
export class VehiclePricingService {
  constructor(private readonly prisma: PrismaService) {}

  async listClasses(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanView(actor, storeId);
    return this.prisma.vehiclePriceClass.findMany({
      where: { storeId },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { code: "asc" }]
    });
  }

  async createClass(user: PricingAuthenticatedUser, dto: CreateVehiclePriceClassDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, dto.storeId);
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    if (!code || !name) throw new BadRequestException("车辆价格级别编码和名称不能为空");
    if (dto.isDefault) {
      await this.prisma.vehiclePriceClass.updateMany({
        where: { storeId: dto.storeId, isDefault: true },
        data: { isDefault: false }
      });
    }
    return this.prisma.vehiclePriceClass.create({
      data: {
        storeId: dto.storeId,
        code,
        name,
        description: dto.description?.trim() || undefined,
        sortOrder: dto.sortOrder ?? 0,
        isDefault: dto.isDefault ?? false,
        status: DictionaryStatus.ACTIVE,
        createdById: actor.id
      }
    });
  }

  async updateClass(user: PricingAuthenticatedUser, id: string, dto: UpdateVehiclePriceClassDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, dto.storeId);
    const existing = await this.prisma.vehiclePriceClass.findFirst({ where: { id, storeId: dto.storeId } });
    if (!existing) throw new NotFoundException("车辆价格级别不存在");
    const code = (dto.code ?? existing.code).trim().toUpperCase();
    const name = (dto.name ?? existing.name).trim();
    if (!code || !name) throw new BadRequestException("车辆价格级别编码和名称不能为空");
    const nextDefault = dto.status === DictionaryStatus.INACTIVE ? false : (dto.isDefault ?? existing.isDefault);
    if (nextDefault) {
      await this.prisma.vehiclePriceClass.updateMany({
        where: { storeId: dto.storeId, isDefault: true, id: { not: id } },
        data: { isDefault: false }
      });
    }
    return this.prisma.vehiclePriceClass.update({
      where: { id },
      data: {
        code,
        name,
        description: dto.description === undefined ? existing.description : dto.description.trim() || null,
        sortOrder: dto.sortOrder ?? existing.sortOrder,
        isDefault: nextDefault,
        status: dto.status ?? existing.status
      }
    });
  }

  async createMapping(user: PricingAuthenticatedUser, dto: CreateVehicleModelMappingDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, dto.storeId);
    const priceClass = await this.prisma.vehiclePriceClass.findFirst({
      where: { id: dto.vehiclePriceClassId, storeId: dto.storeId, status: DictionaryStatus.ACTIVE }
    });
    if (!priceClass) throw new BadRequestException("车辆价格级别不存在或已停用");
    const modelKeyword = dto.modelKeyword.trim();
    if (!modelKeyword) throw new BadRequestException("车型关键词不能为空");
    if (dto.yearFrom !== undefined && dto.yearTo !== undefined && dto.yearFrom > dto.yearTo) {
      throw new BadRequestException("车型年份范围无效");
    }
    const existing = await this.prisma.vehicleModelMapping.findMany({ where: { storeId: dto.storeId, status: DictionaryStatus.ACTIVE } });
    assertNoMappingConflict(existing, normalizeMapping(dto));
    return this.prisma.vehicleModelMapping.create({
      data: {
        storeId: dto.storeId,
        brand: dto.brand?.trim() || undefined,
        modelKeyword,
        yearFrom: dto.yearFrom,
        yearTo: dto.yearTo,
        vehiclePriceClassId: dto.vehiclePriceClassId,
        priority: dto.priority ?? 0,
        status: DictionaryStatus.ACTIVE,
        createdById: actor.id
      },
      include: { vehiclePriceClass: true }
    });
  }

  async updateMapping(user: PricingAuthenticatedUser, id: string, dto: UpdateVehicleModelMappingDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, dto.storeId);
    const existing = await this.prisma.vehicleModelMapping.findFirst({ where: { id, storeId: dto.storeId } });
    if (!existing) throw new NotFoundException("车型映射不存在");
    const candidate = normalizeMapping({
      storeId: dto.storeId,
      brand: dto.brand === undefined ? existing.brand ?? undefined : dto.brand,
      modelKeyword: dto.modelKeyword ?? existing.modelKeyword,
      yearFrom: dto.yearFrom === undefined ? existing.yearFrom ?? undefined : dto.yearFrom,
      yearTo: dto.yearTo === undefined ? existing.yearTo ?? undefined : dto.yearTo,
      vehiclePriceClassId: dto.vehiclePriceClassId ?? existing.vehiclePriceClassId,
      priority: dto.priority ?? existing.priority
    });
    if (!candidate.modelKeyword) throw new BadRequestException("车型关键词不能为空");
    if (candidate.yearFrom != null && candidate.yearTo != null && candidate.yearFrom > candidate.yearTo) {
      throw new BadRequestException("车型年份范围无效");
    }
    const nextStatus = dto.status ?? existing.status;
    if (nextStatus === DictionaryStatus.ACTIVE) {
      const priceClass = await this.prisma.vehiclePriceClass.findFirst({
        where: { id: candidate.vehiclePriceClassId, storeId: dto.storeId, status: DictionaryStatus.ACTIVE }
      });
      if (!priceClass) throw new BadRequestException("车辆价格级别不存在或已停用");
      const mappings = await this.prisma.vehicleModelMapping.findMany({
        where: { storeId: dto.storeId, status: DictionaryStatus.ACTIVE, id: { not: id } }
      });
      assertNoMappingConflict(mappings, candidate);
    }
    return this.prisma.vehicleModelMapping.update({
      where: { id },
      data: {
        brand: candidate.brand || null,
        modelKeyword: candidate.modelKeyword,
        yearFrom: candidate.yearFrom,
        yearTo: candidate.yearTo,
        vehiclePriceClassId: candidate.vehiclePriceClassId,
        priority: candidate.priority ?? 0,
        status: nextStatus
      },
      include: { vehiclePriceClass: true }
    });
  }

  async listMappings(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanView(actor, storeId);
    return this.prisma.vehicleModelMapping.findMany({
      where: { storeId },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      include: { vehiclePriceClass: true }
    });
  }

  async importMappings(user: PricingAuthenticatedUser, dto: ImportVehicleModelMappingsDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanManage(actor, dto.storeId);
    if (!dto.rows.length) throw new BadRequestException("导入内容不能为空");
    const normalized = dto.rows.map((row) => {
      const item = normalizeMapping({ ...row, storeId: dto.storeId });
      if (!item.modelKeyword) throw new BadRequestException("车型关键词不能为空");
      if (item.yearFrom != null && item.yearTo != null && item.yearFrom > item.yearTo) {
        throw new BadRequestException(`车型年份范围无效：${item.modelKeyword}`);
      }
      return item;
    });
    const classes = await this.prisma.vehiclePriceClass.findMany({ where: { storeId: dto.storeId, status: DictionaryStatus.ACTIVE } });
    const classIds = new Set(classes.map((item) => item.id));
    if (normalized.some((item) => !classIds.has(item.vehiclePriceClassId))) {
      throw new BadRequestException("导入包含不存在或已停用的车辆价格级别");
    }
    const existing = await this.prisma.vehicleModelMapping.findMany({ where: { storeId: dto.storeId, status: DictionaryStatus.ACTIVE } });
    const all = [...existing];
    for (const item of normalized) {
      assertNoMappingConflict(all, item);
      all.push(item as never);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.vehicleModelMapping.createMany({
        data: normalized.map((item) => ({
          storeId: dto.storeId,
          brand: item.brand ?? undefined,
          modelKeyword: item.modelKeyword,
          yearFrom: item.yearFrom ?? undefined,
          yearTo: item.yearTo ?? undefined,
          vehiclePriceClassId: item.vehiclePriceClassId,
          priority: item.priority ?? 0,
          createdById: actor.id,
          status: DictionaryStatus.ACTIVE
        }))
      });
      return tx.vehicleModelMapping.findMany({ where: { storeId: dto.storeId }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], include: { vehiclePriceClass: true } });
    });
  }

  async listUnmatchedVehicles(user: PricingAuthenticatedUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    this.assertCanView(actor, storeId);
    const [vehicles, mappings] = await Promise.all([
      this.prisma.customerVehicle.findMany({
        where: { vehiclePriceClassId: null, customer: { storeId } },
        select: { id: true, carModel: true, carPlate: true, customerId: true, createdAt: true },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.vehicleModelMapping.findMany({
        where: { storeId, status: DictionaryStatus.ACTIVE },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        include: { vehiclePriceClass: true }
      })
    ]);
    return vehicles.map((vehicle) => {
      const model = vehicle.carModel.trim().toLocaleLowerCase();
      const match = mappings.find((mapping) => model.includes(mapping.modelKeyword.trim().toLocaleLowerCase()));
      return {
        ...vehicle,
        suggestedMapping: match
          ? {
              mappingId: match.id,
              modelKeyword: match.modelKeyword,
              priority: match.priority,
              vehiclePriceClass: match.vehiclePriceClass,
              source: "KEYWORD" as const
            }
          : null
      };
    });
  }

  async resolve(user: PricingAuthenticatedUser, dto: ResolveVehiclePriceClassDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanView(actor, dto.storeId);
    if (dto.manualVehiclePriceClassId) {
      const manual = await this.prisma.vehiclePriceClass.findFirst({
        where: { id: dto.manualVehiclePriceClassId, storeId: dto.storeId, status: DictionaryStatus.ACTIVE }
      });
      if (!manual) throw new BadRequestException("本单修正的车辆价格级别不存在或已停用");
      return { source: "MANUAL" as const, vehiclePriceClass: manual, matchedMappingId: null };
    }

    const model = dto.model.trim().toLocaleLowerCase();
    const brand = dto.brand?.trim().toLocaleLowerCase();
    const mappings = await this.prisma.vehicleModelMapping.findMany({
      where: {
        storeId: dto.storeId,
        status: DictionaryStatus.ACTIVE,
        ...(dto.year !== undefined
          ? { OR: [{ yearFrom: null, yearTo: null }, { yearFrom: { lte: dto.year }, yearTo: null }, { yearFrom: null, yearTo: { gte: dto.year } }, { yearFrom: { lte: dto.year }, yearTo: { gte: dto.year } }] }
          : {}),
        vehiclePriceClass: { status: DictionaryStatus.ACTIVE }
      },
      include: { vehiclePriceClass: true },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    });
    const match = mappings.find((mapping) => {
      const mappingBrand = mapping.brand?.trim().toLocaleLowerCase();
      return model.includes(mapping.modelKeyword.trim().toLocaleLowerCase()) &&
        (!mappingBrand || mappingBrand === brand);
    });
    if (match) {
      return { source: "AUTO" as const, vehiclePriceClass: match.vehiclePriceClass, matchedMappingId: match.id };
    }

    const fallback = await this.prisma.vehiclePriceClass.findFirst({
      where: { storeId: dto.storeId, status: DictionaryStatus.ACTIVE, isDefault: true }
    });
    return { source: fallback ? "AUTO_DEFAULT" as const : "UNMATCHED" as const, vehiclePriceClass: fallback, matchedMappingId: null };
  }

  private assertCanView(user: UserWithStoreMember, storeId: string) {
    if (!PermissionPolicy.canViewStoreData(user, storeId)) throw new ForbiddenException("无权限");
  }

  private assertCanManage(user: UserWithStoreMember, storeId: string) {
    if (!PermissionPolicy.canManageProduct(user, storeId)) throw new ForbiddenException("无权限");
  }

  private async withStoreMember(user: PricingAuthenticatedUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

type MappingShape = {
  brand?: string | null;
  modelKeyword: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  vehiclePriceClassId: string;
  priority?: number | null;
};

function normalizeMapping(input: CreateVehicleModelMappingDto): MappingShape {
  return {
    brand: input.brand?.trim().toLocaleLowerCase() || null,
    modelKeyword: input.modelKeyword.trim().toLocaleLowerCase(),
    yearFrom: input.yearFrom ?? null,
    yearTo: input.yearTo ?? null,
    vehiclePriceClassId: input.vehiclePriceClassId,
    priority: input.priority ?? 0
  };
}

function assertNoMappingConflict(existing: MappingShape[], candidate: MappingShape) {
  const conflict = existing.find((item) =>
    (item.brand ?? null) === (candidate.brand ?? null) &&
    item.modelKeyword.trim().toLocaleLowerCase() === candidate.modelKeyword &&
    (item.priority ?? 0) === (candidate.priority ?? 0) &&
    rangesOverlap(item.yearFrom ?? null, item.yearTo ?? null, candidate.yearFrom ?? null, candidate.yearTo ?? null)
  );
  if (conflict) throw new BadRequestException(`车型映射冲突：${candidate.modelKeyword}`);
}

function rangesOverlap(aFrom: number | null, aTo: number | null, bFrom: number | null, bTo: number | null) {
  const fromA = aFrom ?? Number.NEGATIVE_INFINITY;
  const toA = aTo ?? Number.POSITIVE_INFINITY;
  const fromB = bFrom ?? Number.NEGATIVE_INFINITY;
  const toB = bTo ?? Number.POSITIVE_INFINITY;
  return fromA <= toB && fromB <= toA;
}
