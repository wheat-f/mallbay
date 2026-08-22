import { BadRequestException, ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { Prisma, PricingRolloutMode, ProductUnit, StorePosition } from "@prisma/client";
import { AccessContext } from "../permissions/domain/access-context";
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
import { CostEstimatorService } from "./cost-estimator.service";
import { estimateConstructionCost } from "./domain/construction-cost";
import { VEHICLE_TYPE_CODES } from "../settings/dictionaries.service";

export type PricingAuthenticatedUser = {
  id: string;
  username?: string;
  /** @deprecated compatibility for staged test/request adapters only. */
  isAuditor?: boolean;
  /** @deprecated compatibility for staged test/request adapters only. */
  storeMember?: { storeId: string; position: StorePosition } | null;
};

type CostEstimateSnapshot = {
  lines: unknown[];
  materialCostCents: number;
  estimatedMaterialCostCents: number;
  estimatedCostCents: number;
  hasMissingCost: boolean;
  estimatedConstructionCostCents: number | null;
  estimatedTotalCostCents: number | null;
  costCompleteness: "COMPLETE" | "MISSING";
  standardWorkMinutes: number | null;
  matchedStandardIds: string[];
  positionCostRateVersionId: string | null;
  positionCostRates: Array<{ positionTypeCode: string; hourlyCostCents: number }>;
  reason?: string;
};

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingRules: PricingRulesService,
    @Optional() private readonly costs?: CostEstimatorService,
    @Optional() private readonly accessContext?: AccessContext
  ) {}

  async calculate(user: PricingAuthenticatedUser, dto: CalculatePricingDto) {
    const actor = user;
    if (!await this.canReadPricing(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }

    let calculation;
    let guard;
    let persistedRuleSet;
    let persistedPolicy;
    let persistedCalculation;
    let shadowComparison;
    let costEstimate: CostEstimateSnapshot;
    let constructionChargeAvailable = false;
    let constructionChargeReason: string | undefined;
    const store = await this.prisma.store.findUnique({ where: { id: dto.storeId }, select: { pricingRolloutMode: true } });
    // Missing rollout state must be fail-safe.  ACTIVE is available only after
    // the explicit store precheck succeeds; it must never be a fallback.
    const rolloutMode = store?.pricingRolloutMode ?? PricingRolloutMode.LEGACY;
    try {
      // When the caller does not pin a version (the normal create-order and
      // simulator flow), resolve the currently effective published rule set.
      // An explicit id still pins the calculation to that immutable version.
      persistedRuleSet = await this.pricingRules.getForCalculation(dto.storeId, dto.ruleSetId);
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
      let input = await this.hydrateProductFacts(dto.storeId, {
        ...rawInput,
        baseLaborCostCents: persistedRuleSet
          ? resolveBaseLaborCost(persistedRuleSet.protectionPolicy?.internalLaborCostConfig, rawInput)
          : rawInput.baseLaborCostCents
      });
      const constructionEstimate = persistedRuleSet?.constructionStandards?.length
        ? estimateConstructionCost(input, persistedRuleSet.constructionStandards.map((standard) => ({
          id: standard.id,
          priority: standard.priority,
          enabled: standard.enabled,
          constructionTypeCode: standard.serviceItem.constructionTypeCode,
          serviceGroupCode: standard.serviceItem.serviceGroupCode,
          defaultProductCategoryCode: standard.serviceItem.defaultProductCategoryCode,
          vehiclePriceClassCode: standard.vehiclePriceClass?.code,
          constructionLocationCode: standard.constructionLocationCode,
          productCategoryCode: standard.productCategoryCode,
          salesUnitCode: standard.salesUnitCode,
          quantityFrom: standard.quantityFrom == null ? null : Number(standard.quantityFrom),
          quantityTo: standard.quantityTo == null ? null : Number(standard.quantityTo),
          baseConstructionChargeCents: standard.baseConstructionChargeCents,
          standardWorkMinutes: standard.standardWorkMinutes,
          addonChargeCents: standard.addonChargeCents,
          addonWorkMinutes: standard.addonWorkMinutes,
          standardCommissionCents: standard.standardCommissionCents,
          standardAllowanceCents: standard.standardAllowanceCents,
          crewRoles: standard.crewRoles
        })), persistedRuleSet.positionCostRateVersion?.rates ?? [])
        : { complete: false, reason: "施工成本标准尚未配置", matchedStandardIds: [] };
      constructionChargeAvailable = constructionEstimate.complete;
      constructionChargeReason = constructionEstimate.reason;
      if (constructionEstimate.complete) {
        input = { ...input, baseLaborCostCents: constructionEstimate.suggestedConstructionChargeCents! };
      }
      calculation = calculatePricing(
        input,
        rolloutMode === PricingRolloutMode.LEGACY ? [] : rules
      );
      const materialEstimate = this.costs
          ? await this.costs.estimateForStore(actor, dto.storeId, input.lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          salesUnit: line.salesUnit as ProductUnit
        })))
        : {
          lines: [],
          materialCostCents: 0,
          estimatedMaterialCostCents: 0,
          estimatedCostCents: 0,
          hasMissingCost: true,
          costCompleteness: "MISSING" as const
        };
      const costCompleteness = !materialEstimate.hasMissingCost && constructionEstimate.complete
        ? "COMPLETE" as const
        : "MISSING" as const;
      costEstimate = {
        ...materialEstimate,
        estimatedConstructionCostCents: constructionEstimate.complete
          ? constructionEstimate.estimatedConstructionCostCents!
          : null,
        estimatedTotalCostCents: costCompleteness === "COMPLETE"
          ? materialEstimate.estimatedMaterialCostCents + constructionEstimate.estimatedConstructionCostCents!
          : null,
        costCompleteness,
        standardWorkMinutes: constructionEstimate.complete ? constructionEstimate.standardWorkMinutes ?? null : null,
        matchedStandardIds: constructionEstimate.matchedStandardIds,
        positionCostRateVersionId: persistedRuleSet?.positionCostRateVersionId ?? null,
        positionCostRates: persistedRuleSet?.positionCostRateVersion?.rates.map((rate) => ({
          positionTypeCode: rate.positionTypeCode,
          hourlyCostCents: rate.hourlyCostCents
        })) ?? [],
        reason: materialEstimate.hasMissingCost
          ? "部分产品缺少成本，暂不能形成完整预计成本"
          : constructionEstimate.reason
      };
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
        ? evaluatePricingGuard(calculation, {
          ...dto.finalAmount,
          // The client can never supply an estimated cost for margin approval.
          estimatedCostCents: undefined
        }, policy)
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
              costEstimate,
              protectionPolicy: policy ?? null,
              shadowComparison: shadowComparison ?? null
            } as unknown as Prisma.InputJsonValue,
            appliedRules: calculation.appliedRules as unknown as Prisma.InputJsonValue,
            estimatedMaterialCostCents: costEstimate.estimatedMaterialCostCents,
            estimatedConstructionCostCents: costEstimate.estimatedConstructionCostCents,
            estimatedTotalCostCents: costEstimate.estimatedTotalCostCents,
            costCompleteness: costEstimate.costCompleteness,
            decision: guard?.decision ?? "NORMAL",
            createdById: actor.id
          }
        });
      }
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "价格试算参数无效");
    }

    const canViewCost = await this.canViewCosts(actor, dto.storeId);
    return {
      mode: "SIMULATION" as const,
      rolloutMode,
      ruleSetId: persistedRuleSet?.id ?? null,
      pricingCalculationId: rolloutMode === PricingRolloutMode.ACTIVE ? persistedCalculation?.id ?? null : null,
      shadowPricingCalculationId: rolloutMode === PricingRolloutMode.SHADOW ? persistedCalculation?.id ?? null : null,
      shadowComparison: shadowComparison ?? null,
      // 对客施工收费也必须来自匹配的已发布施工标准；该标记不含内部金额，销售可安全读取。
      constructionChargeAvailable,
      constructionChargeReason,
      calculation,
      costEstimate: canViewCost
        ? costEstimate
        : { costCompleteness: costEstimate.costCompleteness },
      guard
    };
  }

  private async hydrateProductFacts(storeId: string, input: PricingCalculationInput): Promise<PricingCalculationInput> {
    const productIds = [...new Set(input.lines.map((line) => line.productId))];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: {
        id: true,
        name: true,
        category: true,
        brand: true,
        model: true,
        salesUnit: true,
        basePriceCents: true,
        metersPerRoll: true,
        quantityPrecision: true,
        unitSuggestedPrices: { where: { isActive: true }, select: { salesUnit: true, suggestedPriceCents: true } }
      }
    });
    if (products.length !== productIds.length) throw new BadRequestException("价格试算包含不存在或不属于当前门店的产品");
    const productById = new Map(products.map((product) => [product.id, product]));
    let vehicleTypeCode = input.vehicleTypeCode;
    let vehicleClassCode = input.vehicleClassCode;
    if (input.vehicleId) {
      const vehicle = await this.prisma.customerVehicle.findFirst({
        where: { id: input.vehicleId, customer: { storeId } },
        select: { vehicleTypeCode: true, carModel: true, vehiclePriceClass: { select: { code: true, status: true } } }
      });
      if (!vehicle) throw new BadRequestException("车辆不存在或不属于当前门店");
      if (!vehicleTypeCode) {
        vehicleTypeCode = vehicle.vehicleTypeCode ?? undefined;
      }
      // Retain legacy class only for historical inputs. New pricing rules use
      // the stable system dictionary vehicleTypeCode.
      if (!vehicleClassCode && vehicle.vehiclePriceClass?.status === "ACTIVE") {
        vehicleClassCode = vehicle.vehiclePriceClass.code;
      } else if (!vehicleClassCode) {
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
    if (vehicleTypeCode && !VEHICLE_TYPE_CODES.includes(vehicleTypeCode as (typeof VEHICLE_TYPE_CODES)[number])) {
      throw new BadRequestException("车辆类型不存在或已停用");
    }
    if (vehicleClassCode) {
      const vehicleClass = await this.prisma.vehiclePriceClass.findFirst({
        where: { storeId, code: vehicleClassCode, status: "ACTIVE" }
      });
      if (!vehicleClass) throw new BadRequestException("车辆价格级别不存在或已停用");
    }
    return {
      ...input,
      vehicleTypeCode,
      vehicleClassCode,
      lines: input.lines.map((line) => {
        const product = productById.get(line.productId)!;
        const precision = product.quantityPrecision ?? 3;
        if (countDecimalPlaces(line.quantity) > precision) {
          throw new BadRequestException("产品 " + product.name + " 数量最多支持 " + precision + " 位小数");
        }
        const salesUnit = line.salesUnit || product.salesUnit;
        const price = resolveProductSuggestedPrice(product, salesUnit as ProductUnit);
        if (!price) {
          throw new BadRequestException(`产品 ${product.name} 未维护 ${salesUnit} 销售单位建议价或有效换算关系`);
        }
        return {
          ...line,
          category: product.category,
          brand: product.brand,
          model: product.model,
          salesUnit,
          baseUnitPriceCents: price.cents,
          basePriceSource: price.source,
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
      constructionChargeCents?: number;
      /** @deprecated compatibility input; represents a customer charge. */
      laborCostCents?: number;
    },
    options: {
      approvedQuote?: boolean;
      allowTemporaryCost?: boolean;
      temporaryCost?: { cents: number; reason: string };
    } = {}
  ) {
    const actor = user;
    if (!await this.canReadPricing(actor, dto.storeId)) {
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
      costEstimate?: {
        estimatedMaterialCostCents?: number;
        estimatedConstructionCostCents?: number | null;
        estimatedTotalCostCents?: number | null;
        costCompleteness?: "COMPLETE" | "TEMPORARY" | "MISSING";
      };
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
    const canUseTemporaryCost = Boolean(
      options.approvedQuote &&
      options.allowTemporaryCost &&
      options.temporaryCost &&
      Number.isInteger(options.temporaryCost.cents) &&
      options.temporaryCost.cents >= 0 &&
      options.temporaryCost.reason.trim()
    );
    if (output.costEstimate && output.costEstimate.costCompleteness !== "COMPLETE" && !canUseTemporaryCost) {
      throw new BadRequestException({
        code: "QUOTE_APPROVAL_REQUIRED",
        message: "预计成本尚未完整，不能直接生成正式订单；请补齐成本标准或先走临时成本报价审批"
      });
    }
    const costEstimate = canUseTemporaryCost
      ? {
        ...output.costEstimate,
        estimatedTotalCostCents: options.temporaryCost!.cents,
        costCompleteness: "TEMPORARY" as const
      }
      : output.costEstimate;
    const guard = evaluatePricingGuard(
      calculation,
      {
        lines: dto.items.map((item, index) => ({ id: calculation.lines[index].id, unitPriceCents: item.unitPriceCents })),
        laborCostCents: dto.constructionChargeCents ?? dto.laborCostCents ?? 0,
        // Only an immutable service-side snapshot can participate in margin
        // protection. Missing construction cost intentionally disables the
        // margin calculation until the standard module is enabled.
        estimatedCostCents: costEstimate?.costCompleteness === "COMPLETE" || costEstimate?.costCompleteness === "TEMPORARY"
          ? costEstimate.estimatedTotalCostCents ?? undefined
          : undefined
      },
      output.protectionPolicy
    );
    if (guard.decision === "BLOCKED") {
      throw new BadRequestException({ code: "PRICING_BLOCKED", message: "成交价低于保护范围，不能直接生成正式订单" });
    }
    // An approved quote has already passed the required approval workflow. We
    // still evaluate the immutable snapshot (and continue to reject BLOCKED
    // prices), but must not send the approved quote back into the approval
    // queue during conversion to a formal order.
    if (guard.decision === "APPROVAL_REQUIRED" && !options.approvedQuote) {
      throw new BadRequestException({ code: "QUOTE_APPROVAL_REQUIRED", message: "当前成交价需要先提交报价审批" });
    }
    return {
      pricingCalculationId: snapshot.id,
      pricingRuleSetVersion: snapshot.ruleSetVersion,
      pricingInputHash: snapshot.inputHash,
      pricingOutputSnapshot: snapshot.outputSnapshot,
      costEstimate: costEstimate ?? null
    };
  }

  private async canReadPricing(actor: PricingAuthenticatedUser, storeId: string) {
    if (!this.accessContext) throw new Error("PricingService access context is not configured");
    return this.accessContext.can({ userId: actor.id }, "products", "read", { storeId });
  }

  private async canViewCosts(actor: PricingAuthenticatedUser, storeId: string) {
    if (!this.accessContext) throw new Error("PricingService access context is not configured");
    return this.accessContext.can({ userId: actor.id }, "finance", "write", { storeId });
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

function resolveProductSuggestedPrice(
  product: {
    salesUnit: ProductUnit;
    basePriceCents: number;
    metersPerRoll: Prisma.Decimal | null;
    unitSuggestedPrices?: Array<{ salesUnit: ProductUnit; suggestedPriceCents: number }>;
  },
  selectedUnit: ProductUnit
) {
  if (selectedUnit === product.salesUnit) {
    return { cents: product.basePriceCents, source: "DEFAULT_UNIT" as const };
  }
  const override = (product.unitSuggestedPrices ?? []).find((item) => item.salesUnit === selectedUnit);
  if (override) return { cents: override.suggestedPriceCents, source: "UNIT_OVERRIDE" as const };

  const metersPerRoll = Number(product.metersPerRoll ?? 0);
  if (metersPerRoll <= 0) return null;
  if (product.salesUnit === ProductUnit.ROLL && selectedUnit === ProductUnit.METER) {
    return { cents: Math.round(product.basePriceCents / metersPerRoll), source: "UNIT_CONVERTED" as const };
  }
  if (product.salesUnit === ProductUnit.METER && selectedUnit === ProductUnit.ROLL) {
    return { cents: Math.round(product.basePriceCents * metersPerRoll), source: "UNIT_CONVERTED" as const };
  }
  return null;
}
