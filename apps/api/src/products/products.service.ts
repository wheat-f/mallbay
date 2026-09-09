/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma, ProductStatus, ProductUnit } from "@prisma/client";
import { normalizePagination } from "../common/pagination";
import { AccessContext, type AccessSubject } from "../permissions/domain/access-context";
import { AuditEventWriter } from "../observability/audit-event-writer";
import type { AuditEvent } from "../observability/audit-log.service";
import { persistAuditEvent } from "../observability/persist-audit-event";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsDto } from "./dto/list-products.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

export type AuthenticatedProductUser = {
  id: string;
  username?: string;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext,
    @Optional() private readonly auditWriter?: AuditEventWriter
  ) {}

  async create(user: AuthenticatedProductUser, dto: CreateProductDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    await this.assertCanManageProducts(actor, dto.storeId);
    await this.assertCanManageSuggestedPrices(actor, dto.storeId);
    if (dto.standardCostCents !== undefined && !await this.accessContext.can(actor, "finance", "write", { storeId: dto.storeId })) {
      throw new ForbiddenException("仅财务或店长可维护材料成本");
    }

    const product = await this.prisma.product.create({
      data: {
        storeId: dto.storeId,
        brand: dto.brand,
        name: dto.name,
        model: dto.model,
        category: dto.category,
        specification: dto.specification,
        unit: dto.unit,
        ...(dto.inventoryUnit !== undefined ? { inventoryUnit: dto.inventoryUnit } : {}),
        ...(dto.salesUnit !== undefined ? { salesUnit: dto.salesUnit } : {}),
        ...(dto.rollWidthMeters !== undefined ? { rollWidthMeters: dto.rollWidthMeters } : {}),
        ...(dto.rollLengthMeters !== undefined ? { rollLengthMeters: dto.rollLengthMeters } : {}),
        ...(dto.metersPerRoll !== undefined ? { metersPerRoll: dto.metersPerRoll } : {}),
        ...(dto.quantityPrecision !== undefined ? { quantityPrecision: dto.quantityPrecision } : {}),
        warrantyYears: dto.warrantyYears,
        basePriceCents: dto.basePriceCents,
        ...(dto.standardCostCents !== undefined ? { standardCostCents: dto.standardCostCents } : {}),
        status: ProductStatus.ACTIVE
      }
    });
    await this.recordAudit({
      action: "product_created",
      actorId: actor.userId,
      targetType: "Product",
      targetId: product.id,
      metadata: {
        storeId: dto.storeId,
        suggestedPrice: { unit: dto.salesUnit ?? dto.unit, previousCents: null, nextCents: dto.basePriceCents },
        ...(dto.standardCostCents !== undefined
          ? { standardMaterialCost: { unit: dto.inventoryUnit ?? dto.unit, previousCents: null, nextCents: dto.standardCostCents } }
          : {})
      }
    });
    return product;
  }

  async list(user: AuthenticatedProductUser, dto: ListProductsDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.accessContext.can(actor, "products", "read", { storeId: dto.storeId })) {
      throw new ForbiddenException("无权限");
    }

    const { page, pageSize, skip } = normalizePagination(dto.page, dto.pageSize);
    const where: Prisma.ProductWhereInput = {
      storeId: dto.storeId,
      category: dto.category,
      status: dto.status ?? ProductStatus.ACTIVE
    };
    const q = dto.q?.trim();
    if (q) {
      where.OR = [
        { brand: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { model: { contains: q, mode: "insensitive" } },
        { specification: { contains: q, mode: "insensitive" } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
        include: { unitSuggestedPrices: { where: { isActive: true }, orderBy: { salesUnit: "asc" } } }
      })
    ]);

    const canViewInternalCost = await this.accessContext.can(actor, "finance", "write", { storeId: dto.storeId });
    return {
      total,
      page,
      pageSize,
      items: canViewInternalCost
        ? items
        : items.map(({ standardCostCents: _standardCostCents, ...product }) => product)
    };
  }

  async detail(user: AuthenticatedProductUser, id: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { unitSuggestedPrices: { orderBy: { salesUnit: "asc" } } }
    });
    if (!product) {
      throw new NotFoundException("产品不存在");
    }
    if (!await this.accessContext.can(actor, "products", "read", { storeId: product.storeId })) {
      throw new ForbiddenException("无权限");
    }
    if (!await this.accessContext.can(actor, "finance", "write", { storeId: product.storeId })) {
      const { standardCostCents: _standardCostCents, ...safeProduct } = product;
      return safeProduct;
    }
    return product;
  }

  async update(user: AuthenticatedProductUser, id: string, dto: UpdateProductDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException("产品不存在");
    }
    await this.assertCanManageProducts(actor, product.storeId);
    const changesSuggestedPriceBasis = (
      (dto.basePriceCents !== undefined && dto.basePriceCents !== product.basePriceCents) ||
      (dto.salesUnit !== undefined && dto.salesUnit !== product.salesUnit) ||
      (dto.unit !== undefined && dto.unit !== product.unit) ||
      (dto.metersPerRoll !== undefined && Number(dto.metersPerRoll) !== Number(product.metersPerRoll ?? 0))
    );
    if (changesSuggestedPriceBasis) await this.assertCanManageSuggestedPrices(actor, product.storeId);
    if (dto.standardCostCents !== undefined && !await this.accessContext.can(actor, "finance", "write", { storeId: product.storeId })) {
      throw new ForbiddenException("仅财务或店长可维护材料成本");
    }

    const updated = await this.prisma.product.update({
      where: { id },
      data: dto
    });
    if (dto.basePriceCents !== undefined && dto.basePriceCents !== product.basePriceCents) {
      await this.recordAudit({
        action: "product_suggested_price_updated",
        actorId: actor.userId,
        targetType: "Product",
        targetId: product.id,
        metadata: {
          storeId: product.storeId,
          unit: dto.salesUnit ?? product.salesUnit,
          previousCents: product.basePriceCents,
          nextCents: dto.basePriceCents
        }
      });
    }
    if (dto.standardCostCents !== undefined && dto.standardCostCents !== product.standardCostCents) {
      await this.recordAudit({
        action: "product_standard_material_cost_updated",
        actorId: actor.userId,
        targetType: "Product",
        targetId: product.id,
        metadata: {
          storeId: product.storeId,
          unit: dto.inventoryUnit ?? product.inventoryUnit ?? product.unit,
          previousCents: product.standardCostCents,
          nextCents: dto.standardCostCents
        }
      });
    }
    return updated;
  }

  /**
   * Material standard cost is finance-owned. Keeping this narrow endpoint
   * prevents cost maintenance from changing the customer-facing product data.
   */
  async updateStandardCost(user: AuthenticatedProductUser, id: string, standardCostCents: number) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { unitSuggestedPrices: { orderBy: { salesUnit: "asc" } } }
    });
    if (!product) throw new NotFoundException("产品不存在");
    if (!await this.accessContext.can(actor, "finance", "write", { storeId: product.storeId })) {
      throw new ForbiddenException("仅财务或店长可维护材料成本");
    }
    const updated = await this.prisma.product.update({ where: { id }, data: { standardCostCents } });
    if (standardCostCents !== product.standardCostCents) {
      await this.recordAudit({
        action: "product_standard_material_cost_updated",
        actorId: actor.userId,
        targetType: "Product",
        targetId: product.id,
        metadata: {
          storeId: product.storeId,
          unit: product.inventoryUnit ?? product.unit,
          previousCents: product.standardCostCents,
          nextCents: standardCostCents
        }
      });
    }
    return updated;
  }

  /**
   * Product.basePriceCents remains the default-sales-unit suggested price for
   * compatibility. This endpoint owns only explicit alternate-unit prices.
   */
  async updateUnitSuggestedPrices(
    user: AuthenticatedProductUser,
    id: string,
    prices: Array<{ salesUnit: ProductUnit; suggestedPriceCents: number; isActive?: boolean }>
  ) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { unitSuggestedPrices: true }
    });
    if (!product) throw new NotFoundException("产品不存在");
    await this.assertCanManageSuggestedPrices(actor, product.storeId);

    const supportedUnits = this.supportedSalesUnits(product);
    const seen = new Set<ProductUnit>();
    for (const price of prices) {
      if (price.salesUnit === product.salesUnit) {
        throw new ForbiddenException("默认销售单位建议价请在产品档案中维护");
      }
      if (!supportedUnits.includes(price.salesUnit)) {
        throw new ForbiddenException("该产品未配置此销售单位或有效换算关系");
      }
      if (seen.has(price.salesUnit)) throw new ForbiddenException("同一销售单位只能维护一条建议价");
      seen.add(price.salesUnit);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const price of prices) {
        await tx.productUnitSuggestedPrice.upsert({
          where: { productId_salesUnit: { productId: product.id, salesUnit: price.salesUnit } },
          create: {
            productId: product.id,
            salesUnit: price.salesUnit,
            suggestedPriceCents: price.suggestedPriceCents,
            isActive: price.isActive ?? true
          },
          update: {
            suggestedPriceCents: price.suggestedPriceCents,
            isActive: price.isActive ?? true
          }
        });
      }
    });
    for (const price of prices) {
      const previous = product.unitSuggestedPrices.find((item) => item.salesUnit === price.salesUnit);
      const nextActive = price.isActive ?? true;
      if (previous?.suggestedPriceCents === price.suggestedPriceCents && previous.isActive === nextActive) continue;
      await this.recordAudit({
        action: "product_unit_suggested_price_updated",
        actorId: actor.userId,
        targetType: "Product",
        targetId: product.id,
        metadata: {
          storeId: product.storeId,
          unit: price.salesUnit,
          previousCents: previous?.suggestedPriceCents ?? null,
          nextCents: price.suggestedPriceCents,
          previousActive: previous?.isActive ?? null,
          nextActive
        }
      });
    }

    return this.prisma.product.findUnique({
      where: { id: product.id },
      include: { unitSuggestedPrices: { orderBy: { salesUnit: "asc" } } }
    });
  }

  async remove(user: AuthenticatedProductUser, id: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException("产品不存在");
    }
    await this.assertCanManageProducts(actor, product.storeId);

    return this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.INACTIVE }
    });
  }

  private async assertCanManageProducts(user: AccessSubject, storeId: string) {
    if (!await this.accessContext.can(user, "products", "write", { storeId })) {
      throw new ForbiddenException("无权限");
    }
  }

  private async recordAudit(event: AuditEvent) {
    if (this.auditWriter) return this.auditWriter.writeTransactional(this.prisma, event);
    return persistAuditEvent(this.prisma, event);
  }

  private async assertCanManageSuggestedPrices(user: AccessSubject, storeId: string) {
    if (!await this.accessContext.can(user, "products", "suggested-price-write", { storeId })) {
      throw new ForbiddenException("仅店长可维护产品建议价");
    }
  }

  private supportedSalesUnits(product: { salesUnit: ProductUnit; metersPerRoll: Prisma.Decimal | null }) {
    const units = [product.salesUnit];
    if (Number(product.metersPerRoll ?? 0) > 0) {
      if (product.salesUnit === ProductUnit.ROLL) units.push(ProductUnit.METER);
      if (product.salesUnit === ProductUnit.METER) units.push(ProductUnit.ROLL);
    }
    return units;
  }

}
