import { multiplyMoneyCents } from "./money";
import type { PricingProductLineInput } from "./pricing-engine";

export type ConstructionCostRate = {
  positionTypeCode: string;
  hourlyCostCents: number;
};

export type ConstructionCostStandard = {
  id: string;
  priority: number;
  enabled: boolean;
  constructionTypeCode: string;
  serviceGroupCode: string;
  defaultProductCategoryCode?: string | null;
  vehiclePriceClassCode?: string | null;
  constructionLocationCode: string;
  productCategoryCode?: string | null;
  salesUnitCode?: string | null;
  quantityFrom?: number | null;
  quantityTo?: number | null;
  baseConstructionChargeCents: number;
  standardWorkMinutes: number;
  addonChargeCents: number;
  addonWorkMinutes: number;
  standardCommissionCents: number;
  standardAllowanceCents: number;
  crewRoles: Array<{ positionTypeCode: string; workerCount: number; workMinutes: number }>;
};

export type ConstructionCostEstimate = {
  complete: boolean;
  reason?: string;
  suggestedConstructionChargeCents?: number;
  estimatedConstructionCostCents?: number;
  standardWorkMinutes?: number;
  matchedStandardIds: string[];
};

export type ConstructionCostInput = {
  lines: PricingProductLineInput[];
  constructionType: string;
  constructionLocation: string;
  vehicleClassCode?: string;
};

/**
 * Resolves one standard per product line. Within the same service group the
 * highest charge is the primary job; remaining lines add only their configured
 * addon charge and workload. Different groups are summed independently.
 */
export function estimateConstructionCost(
  input: ConstructionCostInput,
  standards: ConstructionCostStandard[],
  rates: ConstructionCostRate[]
): ConstructionCostEstimate {
  const matched = input.lines.map((line) => {
    const candidate = standards
      .filter((standard) => matchesStandard(standard, input, line))
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))[0];
    return { line, standard: candidate };
  });
  if (matched.some((item) => !item.standard)) {
    const names = matched.filter((item) => !item.standard).map((item) => item.line.category || item.line.productId);
    return { complete: false, reason: `未找到施工标准：${names.join("、")}`, matchedStandardIds: [] };
  }

  const rateByPosition = new Map(rates.map((rate) => [rate.positionTypeCode, rate.hourlyCostCents]));
  const missingRate = matched.flatMap((item) => item.standard!.crewRoles)
    .find((role) => !rateByPosition.has(role.positionTypeCode));
  if (missingRate) {
    return { complete: false, reason: `岗位小时成本未配置：${missingRate.positionTypeCode}`, matchedStandardIds: [] };
  }

  const byGroup = new Map<string, Array<{ line: PricingProductLineInput; standard: ConstructionCostStandard }>>();
  for (const item of matched as Array<{ line: PricingProductLineInput; standard: ConstructionCostStandard }>) {
    const group = byGroup.get(item.standard.serviceGroupCode) ?? [];
    group.push(item);
    byGroup.set(item.standard.serviceGroupCode, group);
  }

  let suggestedConstructionChargeCents = 0;
  let estimatedConstructionCostCents = 0;
  let standardWorkMinutes = 0;
  for (const group of byGroup.values()) {
    const ordered = [...group].sort((left, right) => right.standard.baseConstructionChargeCents - left.standard.baseConstructionChargeCents || left.standard.id.localeCompare(right.standard.id));
    const primary = ordered[0].standard;
    suggestedConstructionChargeCents += primary.baseConstructionChargeCents;
    estimatedConstructionCostCents += standardInternalCost(primary, rateByPosition);
    standardWorkMinutes += primary.standardWorkMinutes;
    for (const item of ordered.slice(1)) {
      suggestedConstructionChargeCents += item.standard.addonChargeCents;
      estimatedConstructionCostCents += addonInternalCost(item.standard, rateByPosition);
      standardWorkMinutes += item.standard.addonWorkMinutes;
    }
  }

  return {
    complete: true,
    suggestedConstructionChargeCents,
    estimatedConstructionCostCents,
    standardWorkMinutes,
    matchedStandardIds: matched.map((item) => item.standard!.id)
  };
}

function matchesStandard(
  standard: ConstructionCostStandard,
  input: Pick<ConstructionCostInput, "constructionType" | "constructionLocation" | "vehicleClassCode">,
  line: PricingProductLineInput
) {
  const category = standard.productCategoryCode ?? standard.defaultProductCategoryCode;
  return standard.enabled &&
    standard.constructionTypeCode === input.constructionType &&
    standard.constructionLocationCode === input.constructionLocation &&
    (!standard.vehiclePriceClassCode || standard.vehiclePriceClassCode === input.vehicleClassCode) &&
    (!category || category === line.category) &&
    (!standard.salesUnitCode || standard.salesUnitCode === line.salesUnit) &&
    (standard.quantityFrom == null || line.quantity >= standard.quantityFrom) &&
    (standard.quantityTo == null || line.quantity <= standard.quantityTo);
}

function standardInternalCost(standard: ConstructionCostStandard, rateByPosition: Map<string, number>) {
  return standard.crewRoles.reduce((sum, role) => sum + laborCost(role, rateByPosition), 0) +
    standard.standardCommissionCents + standard.standardAllowanceCents;
}

function addonInternalCost(standard: ConstructionCostStandard, rateByPosition: Map<string, number>) {
  const baseMinutes = standard.standardWorkMinutes || 1;
  const ratio = standard.addonWorkMinutes / baseMinutes;
  const crewCost = standard.crewRoles.reduce((sum, role) => sum + laborCost(role, rateByPosition) * ratio, 0);
  return Math.round(crewCost) + standard.standardCommissionCents + standard.standardAllowanceCents;
}

function laborCost(role: { positionTypeCode: string; workerCount: number; workMinutes: number }, rateByPosition: Map<string, number>) {
  const hourlyRate = rateByPosition.get(role.positionTypeCode)!;
  return multiplyMoneyCents(hourlyRate * role.workerCount, role.workMinutes / 60);
}
