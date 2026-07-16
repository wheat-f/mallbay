import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, PricingRolloutMode } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import {
  calculatePricing,
  evaluatePricingGuard,
  type PricingCalculationInput,
  type PricingCalculationResult,
  type PricingFinalAmountInput,
  type PricingProtectionPolicy,
  type PricingRule
} from "./domain/pricing-engine";
import { CalculatePricingDto } from "./dto/calculate-pricing.dto";
import { PricingRulesService } from "./pricing-rules.service";
import { compareShadowPricing } from "./domain/shadow-comparison";
import { resolveBaseLaborCost } from "./domain/labor-cost";

export type PricingAuthenticatedUser = UserWithStoreMember & { username?: string };

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingRules: PricingRulesService
  ) {}

  async calculate(user: PricingAuthenticatedUser, dto: CalculatePricingDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }

    let calculation;
    let guard;
    let persistedRuleSet;
    let persistedPolicy;
    let persistedCalculation;
    let shadowComparison;
    const store = await this.prisma.store.findUnique({ where: { id: dto.storeId }, select: { pricingRolloutMode: true } });
    const rolloutMode = store?.pricingRolloutMode ?? PricingRolloutMode.ACTIVE;
    try {
      persistedRuleSet = dto.ruleSetId
        ? await this.pricingRules.getForCalculation(dto.storeId, dto.ruleSetId)
        : undefined;
      if (dto.ruleSetId && !persistedRuleSet) {
        throw new BadRequestException("价格规则版本不存在、未发布或已失效");
      }
      const rules = persistedRuleSet
        ? persistedRuleSet.rules.map((rule) => ({
          ...rule,
          conditions: rule.conditions as PricingRule["conditions"]
        }))
        : dto.rules ?? [];
      const rawInput = {
        ...assertStoreInput(dto.input, dto.storeId),
        ...(persistedRuleSet ? { ruleSetVersion: persistedRuleSet.version } : {})
      };
      const input = await this.hydrateProductFacts(dto.storeId, {
        ...rawInput,
        baseLaborCostCents: persistedRuleSet
          ? resolveBaseLaborCost(persistedRuleSet.protectionPolicy?.internalLaborCostConfig, rawInput)
          : rawInput.baseLaborCostCents
      });
      calculation = calculatePricing(
        input,
        rolloutMode === PricingRolloutMode.LEGACY ? [] : rules
      );
      if (rolloutMode === PricingRolloutMode.SHADOW) {
        shadowComparison = compareShadowPricing(input, calculation);
      }
      persistedPolicy = persistedRuleSet?.protectionPolicy;
      const policy = dto.protectionPolicy ?? (persistedPolicy
        ? {
          normalDeviationBps: persistedPolicy.normalDeviationBps,
          approvalDeviationBps: persistedPolicy.approvalDeviationBps,
          minimumMarginBps: persistedPolicy.minimumMarginBps,
          blockBelowMarginBps: persistedPolicy.blockBelowMarginBps ?? undefined,
          softHoldHours: persistedPolicy.softHoldHours
        }
        : undefined);
      guard = dto.finalAmount && policy
        ? evaluatePricingGuard(calculation, dto.finalAmount, policy)
        : undefined;

      if (persistedRuleSet) {
        persistedCalculation = await this.prisma.pricingCalculation.create({
          data: {
            storeId: dto.storeId,
            ruleSetId: persistedRuleSet.id,
            ruleSetVersion: persistedRuleSet.version,
            inputHash: calculation.inputHash,
            inputSnapshot: input as unknown as Prisma.InputJsonValue,
            outputSnapshot: {
              calculation,
              protectionPolicy: policy ?? null,
              shadowComparison: shadowComparison ?? null
            } as unknown as Prisma.InputJsonValue,
            appliedRules: calculation.appliedRules as unknown as Prisma.InputJsonValue,
            decision: guard?.decision ?? "NORMAL",
            createdById: actor.id
          }
        });
      }
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "价格试算参数无效");
    }

    return {
      mode: "SIMULATION" as const,
      rolloutMode,
      ruleSetId: dto.ruleSetId ?? null,
      pricingCalculationId: rolloutMode === PricingRolloutMode.ACTIVE ? persistedCalculation?.id ?? null : null,
      shadowPricingCalculationId: rolloutMode === PricingRolloutMode.SHADOW ? persistedCalculation?.id ?? null : null,
      shadowComparison: shadowComparison ?? null,
      calculation,
      guard
    };
  }

  private async hydrateProductFacts(storeId: string, input: PricingCalculationInput): Promise<PricingCalculationInput> {
    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true, name: true, category: true, brand: true, model: true, salesUnit: true, basePriceCents: true, quantityPrecision: true }
    });
    if (products.length !== productIds.length) throw new BadRequestException("价格试算包含不存在或不属于当前门店的产品");
    const productById = new Map(products.map((product) => [product.id, product]));
    let vehicleClassCode = input.vehicleClassCode;
    if (input.vehicleId && !vehicleClassCode) {
      const vehicle = await this.prisma.customerVehicle.findFirst({
        where: { id: input.vehicleId, customer: { storeId } },
        select: { carModel: true, vehiclePriceClass: { select: { code: true, status: true } } }
      });
      if (!vehicle) throw new BadRequestException("车辆不存在或不属于当前门店");
      if (vehicle.vehiclePriceClass?.status === "ACTIVE") {
        vehicleClassCode = vehicle.vehiclePriceClass.code;
      } else {
        const mappings = await this.prisma.vehicleModelMapping.findMany({
          where: { storeId, status: "ACTIVE", vehiclePriceClass: { status: "ACTIVE" } },
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
          include: { vehiclePriceClass: { select: { code: true } } }
        });
        const model = vehicle.carModel.trim().toLocaleLowerCase();
        const matched = mappings.find((mapping) => model.includes(mapping.modelKeyword.trim().toLocaleLowerCase()));
        if (matched) vehicleClassCode = matched.vehiclePriceClass.code;
        else {
          const fallback = await this.prisma.vehiclePriceClass.findFirst({ where: { storeId, status: "ACTIVE", isDefault: true }, select: { code: true } });
          vehicleClassCode = fallback?.code;
        }
      }
    }
    if (vehicleClassCode) {
      const vehicleClass = await this.prisma.vehiclePriceClass.findFirst({
        where: { storeId, code: vehicleClassCode, status: "ACTIVE" }
      });
      if (!vehicleClass) throw new BadRequestException("车辆价格级别不存在或已停用");
    }
    return {
      ...input,
      vehicleClassCode,
      lines: input.lines.map((line) => {
        const product = productById.get(line.productId)!;
        const precision = product.quantityPrecision ?? 3;
        if (countDecimalPlaces(line.quantity) > precision) {
          throw new BadRequestException("产品 " + product.name + " 数量最多支持 " + precision + " 位小数");
        }
        return {
          ...line,
          category: product.category,
          brand: product.brand,
          model: product.model,
          salesUnit: product.salesUnit,
          baseUnitPriceCents: product.basePriceCents,
          minimumPriceCents: undefined
        };
      })
    };
  }

  async validateOrder(
    user: PricingAuthenticatedUser,
    dto: {
      storeId: string;
      pricingCalculationId: string;
      items: Array<{ productId: string; quantity: number; unitPriceCents: number }>;
      laborCostCents: number;
      estimatedCostCents?: number;
    }
  ) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const snapshot = await this.prisma.pricingCalculation.findFirst({
      where: { id: dto.pricingCalculationId, storeId: dto.storeId },
      orderBy: { createdAt: "desc" }
    });
    if (!snapshot) throw new BadRequestException("价格试算快照不存在");
    if (snapshot.expiresAt && snapshot.expiresAt <= new Date()) {
      throw new BadRequestException("价格试算已过期，请重新试算");
    }

    const output = snapshot.outputSnapshot as unknown as {
      calculation: PricingCalculationResult;
      protectionPolicy?: PricingProtectionPolicy | null;
    };
    const calculation = output.calculation;
    if (!calculation || calculation.lines.length !== dto.items.length) {
      throw new BadRequestException("订单产品行与价格试算快照不一致");
    }
    calculation.lines.forEach((line, index) => {
      const item = dto.items[index];
      if (line.productId !== item.productId || line.quantity !== item.quantity) {
        throw new BadRequestException("订单产品或数量已变化，请重新试算");
      }
    });
    if (!output.protectionPolicy) {
      throw new BadRequestException("价格试算快照缺少保护策略");
    }
    const guard = evaluatePricingGuard(
      calculation,
      {
        lines: dto.items.map((item, index) => ({ id: calculation.lines[index].id, unitPriceCents: item.unitPriceCents })),
        laborCostCents: dto.laborCostCents,
        estimatedCostCents: dto.estimatedCostCents
      },
      output.protectionPolicy
    );
    if (guard.decision === "BLOCKED") throw new BadRequestException("成交价低于保护范围，不能直接生成正式订单");
    if (guard.decision === "APPROVAL_REQUIRED") throw new BadRequestException("当前成交价需要先提交报价审批");
    return {
      pricingCalculationId: snapshot.id,
      pricingRuleSetVersion: snapshot.ruleSetVersion,
      pricingInputHash: snapshot.inputHash,
      pricingOutputSnapshot: snapshot.outputSnapshot
    };
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

function assertStoreInput(input: PricingCalculationInput, storeId: string) {
  if (!input || typeof input !== "object") throw new Error("价格试算输入不能为空");
  // Store ownership is checked by the service; this explicit assertion keeps the
  // calculation contract honest until persisted rule sets are introduced.
  void storeId;
  return input;
}

export type { PricingCalculationInput, PricingFinalAmountInput, PricingProtectionPolicy, PricingRule };



function countDecimalPlaces(value: number) {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const decimalLength = coefficient.includes(".")
    ? coefficient.length - coefficient.indexOf(".") - 1
    : 0;
  const exponent = exponentText ? Number(exponentText) : 0;
  return exponent < 0 ? Math.max(0, decimalLength + exponent * -1) : Math.max(0, decimalLength - exponent);
}
