import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { estimateCosts } from "./domain/cost-estimator";
import { EstimateCostDto } from "./dto/estimate-cost.dto";
import type { PricingAuthenticatedUser } from "./pricing.service";
import { unitConversionFactor } from "./domain/unit-conversion";
import { loadPublishedFinanceSettlementPolicy } from "../settings/finance-settlement-policy";

@Injectable()
export class CostEstimatorService {
  constructor(private readonly prisma: PrismaService, private readonly accessContext: AccessContext) {}

  async estimate(user: PricingAuthenticatedUser, dto: EstimateCostDto) {
    const actor = user;
    if (!await this.accessContext.can({ userId: actor.id }, "products", "read", { storeId: dto.storeId })) throw new ForbiddenException("无权限");
    const productIds = [...new Set(dto.lines.map((line) => line.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, storeId: dto.storeId },
      select: {
        id: true,
        standardCostCents: true,
        inventoryUnit: true,
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
    const policy = await loadPublishedFinanceSettlementPolicy(this.prisma, dto.storeId);
    const costs: Record<string, { weightedAverageCents?: number; recentCents?: number; standardCents?: number }> = {};
    for (const line of dto.lines) {
      const product = productById.get(line.productId)!;
      const targetUnit = line.salesUnit ?? product.salesUnit;
      // 标准材料成本按库存基础单位维护；卷入库、米销售时不能从销售单位折算。
      const standardFactor = unitConversionFactor(product.inventoryUnit, targetUnit, product);
      costs[line.productId] = {
        standardCents: !policy.standardMaterialFallback || product.standardCostCents == null || standardFactor == null
          ? undefined
          : Math.round(product.standardCostCents / standardFactor)
      };
      if (!policy.actualInboundPricePriority) continue;
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
    return estimateCosts({ lines: dto.lines, costs });
  }

  /**
   * Pricing calculations need the same authoritative material-cost source as
   * the standalone preview endpoint, but have already authenticated the user.
   */
  async estimateForStore(user: PricingAuthenticatedUser, storeId: string, lines: EstimateCostDto["lines"]) {
    return this.estimate(user, { storeId, lines });
  }

}
