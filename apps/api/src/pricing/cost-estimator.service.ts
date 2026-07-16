import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { estimateCosts } from "./domain/cost-estimator";
import { EstimateCostDto } from "./dto/estimate-cost.dto";
import type { PricingAuthenticatedUser } from "./pricing.service";
import { unitConversionFactor } from "./domain/unit-conversion";

@Injectable()
export class CostEstimatorService {
  constructor(private readonly prisma: PrismaService) {}

  async estimate(user: PricingAuthenticatedUser, dto: EstimateCostDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, dto.storeId)) throw new ForbiddenException("无权限");
    const productIds = [...new Set(dto.lines.map((line) => line.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, storeId: dto.storeId },
      select: {
        id: true,
        standardCostCents: true,
        salesUnit: true,
        rollWidthMeters: true,
        rollLengthMeters: true,
        metersPerRoll: true
      }
    });
    if (products.length !== productIds.length) throw new NotFoundException("成本估算包含不存在的产品");
    const batches = await this.prisma.inventoryBatch.findMany({
      where: { storeId: dto.storeId, productId: { in: productIds }, unitCostCents: { not: null } },
      select: { productId: true, unit: true, availableQuantity: true, unitCostCents: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const costs: Record<string, { weightedAverageCents?: number; recentCents?: number; standardCents?: number }> = {};
    for (const line of dto.lines) {
      const product = productById.get(line.productId)!;
      const targetUnit = line.salesUnit ?? product.salesUnit;
      const standardFactor = unitConversionFactor(product.salesUnit, targetUnit, product);
      costs[line.productId] = {
        standardCents: product.standardCostCents == null || standardFactor == null
          ? undefined
          : Math.round(product.standardCostCents / standardFactor)
      };
      const productBatches = batches.filter((batch) => batch.productId === line.productId);
      const usable = productBatches
        .map((batch) => {
          const factor = unitConversionFactor(batch.unit, targetUnit, product);
          if (factor == null || batch.unitCostCents == null) return null;
          return {
            factor,
            availableQuantity: Number(batch.availableQuantity),
            unitCostCents: Math.round(batch.unitCostCents / factor),
            createdAt: batch.createdAt
          };
        })
        .filter((item): item is { factor: number; availableQuantity: number; unitCostCents: number; createdAt: Date } => item !== null);
      const available = usable.filter((item) => item.availableQuantity > 0);
      if (available.length) {
        const totalQuantity = available.reduce((sum, item) => sum + item.availableQuantity * item.factor, 0);
        const weighted = available.reduce((sum, item) => sum + item.availableQuantity * item.factor * item.unitCostCents, 0) / totalQuantity;
        costs[line.productId].weightedAverageCents = Math.round(weighted);
      } else if (usable[0]) {
        costs[line.productId].recentCents = usable[0].unitCostCents;
      }
    }
    return estimateCosts({ lines: dto.lines, costs, laborCostCents: dto.laborCostCents });
  }

  private async withStoreMember(user: PricingAuthenticatedUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({ where: { userId: user.id }, select: { storeId: true, position: true } });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

