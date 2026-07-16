import { createHash } from "node:crypto";
import { aggregateMultiProductLabor, type MultiProductLaborLine } from "./multi-product-labor";
import { multiplyMoneyCents } from "./money";

export const PRICING_RULE_GROUP_ORDER = [
  "PRODUCT",
  "VEHICLE",
  "CONSTRUCTION",
  "SURCHARGE",
  "BUNDLE"
] as const;

export type PricingRuleGroup = (typeof PRICING_RULE_GROUP_ORDER)[number];
export type PricingActionType =
  | "ADD_CENTS"
  | "SUBTRACT_CENTS"
  | "MULTIPLY_BPS"
  | "DISCOUNT_BPS";
export type PricingRuleTarget = "PRODUCT_LINE" | "LABOR" | "ORDER";
export type PricingConditionOperator = "EQ" | "IN" | "BETWEEN" | "GTE" | "LTE";
export type PricingDecision = "NORMAL" | "APPROVAL_REQUIRED" | "BLOCKED";

export type PricingCondition = {
  field: string;
  operator: PricingConditionOperator;
  value: string | number | Array<string | number>;
};

export type PricingRule = {
  id: string;
  group: PricingRuleGroup;
  target: PricingRuleTarget;
  name: string;
  conditions: PricingCondition[];
  actionType: PricingActionType;
  actionValue: number;
  priority: number;
  sortOrder: number;
  enabled: boolean;
};

export type PricingProductLineInput = {
  id: string;
  productId: string;
  category: string;
  brand: string;
  model: string;
  salesUnit: string;
  quantity: number;
  baseUnitPriceCents: number;
  minimumPriceCents?: number;
};

export type PricingCalculationInput = {
  ruleSetVersion: number;
  lines: PricingProductLineInput[];
  vehicleId?: string;
  vehicleClassCode?: string;
  constructionType: string;
  constructionLocation: string;
  effectiveAt?: string;
  baseLaborCostCents: number;
  laborLines?: MultiProductLaborLine[];
};

export type PricingAppliedRule = {
  ruleId: string;
  ruleName: string;
  target: PricingRuleTarget;
  group: PricingRuleGroup;
  lineId?: string;
  beforeCents: number;
  afterCents: number;
};

export type PricingCalculationLine = PricingProductLineInput & {
  suggestedUnitPriceCents: number;
  suggestedAmountCents: number;
  appliedRules: PricingAppliedRule[];
  calculationSteps: PricingCalculationStep[];
};

export type PricingCalculationStep = {
  stage: string;
  group: PricingRuleGroup;
  target: PricingRuleTarget;
  ruleId: string;
  ruleName: string;
  lineId?: string;
  beforeCents: number;
  afterCents: number;
};

export type PricingCalculationResult = {
  ruleSetVersion: number;
  inputHash: string;
  lines: PricingCalculationLine[];
  suggestedProductAmountCents: number;
  suggestedLaborCostCents: number;
  suggestedTotalCents: number;
  appliedRules: PricingAppliedRule[];
  calculationSteps: PricingCalculationStep[];
};

export type PricingProtectionPolicy = {
  normalDeviationBps: number;
  approvalDeviationBps: number;
  minimumMarginBps: number;
  blockBelowMarginBps?: number;
  softHoldHours?: number;
};

export type PricingFinalAmountInput = {
  lines: Array<{ id: string; unitPriceCents: number }>;
  laborCostCents: number;
  estimatedCostCents?: number;
};

export type PricingGuardCheck = {
  scope: "PRODUCT_LINE" | "LABOR" | "ORDER_TOTAL" | "MARGIN";
  key: string;
  suggestedCents?: number;
  finalCents?: number;
  deviationBps?: number;
  marginBps?: number;
  decision: PricingDecision;
  reason: string;
};

export type PricingGuardResult = {
  decision: PricingDecision;
  checks: PricingGuardCheck[];
};

/**
 * Calculates a suggested price from a published rule snapshot.
 * The function is deliberately pure: persistence, permissions and publishing
 * are handled by the application layer, while this function remains the
 * single deterministic pricing authority.
 */
export function calculatePricing(
  input: PricingCalculationInput,
  rules: PricingRule[]
): PricingCalculationResult {
  assertNonNegativeInteger(input.baseLaborCostCents, "baseLaborCostCents");
  if (input.lines.length === 0) throw new Error("至少需要一个产品行");

  const enabledRules = rules.filter((rule) => rule.enabled);
  const orderContext = buildOrderContext(input);
  const appliedRules: PricingAppliedRule[] = [];
  const lines = input.lines.map((line) => {
    assertNonNegativeInteger(line.baseUnitPriceCents, `line.${line.id}.baseUnitPriceCents`);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || countDecimalPlaces(line.quantity) > 3) {
      throw new Error("line." + line.id + ".quantity 必须是大于 0 且最多 3 位小数的数量");
    }
    const context = { ...orderContext, ...buildLineContext(line) };
    const selected = selectRules(enabledRules, "PRODUCT_LINE", context);
    let unitPrice = line.baseUnitPriceCents;
    const lineApplied: PricingAppliedRule[] = [];
    for (const rule of selected) {
      const beforeCents = unitPrice;
      unitPrice = applyAction(unitPrice, rule.actionType, rule.actionValue);
      const applied = toAppliedRule(rule, beforeCents, unitPrice, line.id);
      lineApplied.push(applied);
      appliedRules.push(applied);
    }
    const result = {
      ...line,
      suggestedUnitPriceCents: unitPrice,
      suggestedAmountCents: multiplyMoneyCents(unitPrice, line.quantity),
      appliedRules: lineApplied,
      calculationSteps: lineApplied.map(toCalculationStep)
    };
    return result;
  });

  const suggestedProductAmountCents = lines.reduce(
    (sum, line) => sum + line.suggestedAmountCents,
    0
  );
  const laborSelected = selectRules(enabledRules, "LABOR", orderContext);
  const laborAggregate = input.laborLines ? aggregateMultiProductLabor(input.laborLines) : undefined;
  let suggestedLaborCostCents = laborAggregate?.totalLaborCostCents ?? input.baseLaborCostCents;
  for (const rule of laborSelected) {
    const beforeCents = suggestedLaborCostCents;
    suggestedLaborCostCents = applyAction(suggestedLaborCostCents, rule.actionType, rule.actionValue);
    const applied = toAppliedRule(rule, beforeCents, suggestedLaborCostCents);
    appliedRules.push(applied);
  }

  const orderSelected = selectRules(
    enabledRules,
    "ORDER",
    { ...orderContext, suggestedProductAmountCents, suggestedLaborCostCents }
  );
  let suggestedTotalCents = suggestedProductAmountCents + suggestedLaborCostCents;
  for (const rule of orderSelected) {
    const beforeCents = suggestedTotalCents;
    suggestedTotalCents = applyAction(suggestedTotalCents, rule.actionType, rule.actionValue);
    const applied = toAppliedRule(rule, beforeCents, suggestedTotalCents);
    appliedRules.push(applied);
  }

  return {
    ruleSetVersion: input.ruleSetVersion,
    inputHash: hashInput(input),
    lines,
    suggestedProductAmountCents,
    suggestedLaborCostCents,
    suggestedTotalCents,
    appliedRules,
    calculationSteps: appliedRules.map(toCalculationStep)
  };
}

function toCalculationStep(rule: PricingAppliedRule): PricingCalculationStep {
  return {
    stage: `${rule.group}:${rule.target}`,
    group: rule.group,
    target: rule.target,
    ruleId: rule.ruleId,
    ruleName: rule.ruleName,
    lineId: rule.lineId,
    beforeCents: rule.beforeCents,
    afterCents: rule.afterCents
  };
}

/**
 * Applies the strictest result across product lines, labor, total and margin.
 */
export function evaluatePricingGuard(
  suggestion: PricingCalculationResult,
  finalAmount: PricingFinalAmountInput,
  policy: PricingProtectionPolicy
): PricingGuardResult {
  assertPolicy(policy);
  const checks: PricingGuardCheck[] = [];
  const suggestedById = new Map(suggestion.lines.map((line) => [line.id, line]));

  if (finalAmount.lines.length !== suggestion.lines.length) {
    checks.push({
      scope: "ORDER_TOTAL",
      key: "line-count",
      decision: "BLOCKED",
      reason: "成交产品行数量与服务端建议价快照不一致"
    });
  }
  const finalLineIds = new Set(finalAmount.lines.map((line) => line.id));
  for (const suggestedLine of suggestion.lines) {
    if (!finalLineIds.has(suggestedLine.id)) {
      checks.push({
        scope: "PRODUCT_LINE",
        key: suggestedLine.id,
        decision: "BLOCKED",
        reason: "成交产品行缺少服务端建议价快照中的产品"
      });
    }
  }

  for (const finalLine of finalAmount.lines) {
    const suggestedLine = suggestedById.get(finalLine.id);
    if (!suggestedLine) {
      checks.push({
        scope: "PRODUCT_LINE",
        key: finalLine.id,
        decision: "BLOCKED",
        reason: "成交产品行不在服务端建议价快照中"
      });
      continue;
    }
    const deviationBps = calculateDeviationBps(
      suggestedLine.suggestedUnitPriceCents,
      finalLine.unitPriceCents
    );
    const minimumPriceCents = suggestedLine.minimumPriceCents;
    const decision = minimumPriceCents !== undefined && finalLine.unitPriceCents < minimumPriceCents
      ? "BLOCKED"
      : decisionForDeviation(deviationBps, policy);
    checks.push({
      scope: "PRODUCT_LINE",
      key: finalLine.id,
      suggestedCents: suggestedLine.suggestedUnitPriceCents,
      finalCents: finalLine.unitPriceCents,
      deviationBps,
      decision,
      reason: minimumPriceCents !== undefined && finalLine.unitPriceCents < minimumPriceCents
        ? "产品成交价低于最低保护价"
        : reasonForDecision(decision, "产品行偏离建议价")
    });
  }

  const laborDeviationBps = calculateDeviationBps(
    suggestion.suggestedLaborCostCents,
    finalAmount.laborCostCents
  );
  checks.push({
    scope: "LABOR",
    key: "labor",
    suggestedCents: suggestion.suggestedLaborCostCents,
    finalCents: finalAmount.laborCostCents,
    deviationBps: laborDeviationBps,
    decision: decisionForDeviation(laborDeviationBps, policy),
    reason: reasonForDecision(decisionForDeviation(laborDeviationBps, policy), "人工费偏离建议价")
  });

  const finalProductAmountCents = finalAmount.lines.reduce((sum, line) => {
    const suggestionLine = suggestedById.get(line.id);
    return sum + multiplyMoneyCents(line.unitPriceCents, suggestionLine?.quantity ?? 0);
  }, 0);
  const finalTotalCents = finalProductAmountCents + finalAmount.laborCostCents;
  const totalDeviationBps = calculateDeviationBps(suggestion.suggestedTotalCents, finalTotalCents);
  checks.push({
    scope: "ORDER_TOTAL",
    key: "total",
    suggestedCents: suggestion.suggestedTotalCents,
    finalCents: finalTotalCents,
    deviationBps: totalDeviationBps,
    decision: decisionForDeviation(totalDeviationBps, policy),
    reason: reasonForDecision(decisionForDeviation(totalDeviationBps, policy), "整单总价偏离建议价")
  });

  if (finalAmount.estimatedCostCents !== undefined) {
    const marginBps = finalTotalCents <= 0
      ? -10000
      : Math.floor(((finalTotalCents - finalAmount.estimatedCostCents) * 10000) / finalTotalCents);
    const decision = policy.blockBelowMarginBps !== undefined && marginBps < policy.blockBelowMarginBps
      ? "BLOCKED"
      : marginBps < policy.minimumMarginBps
        ? "APPROVAL_REQUIRED"
        : "NORMAL";
    checks.push({
      scope: "MARGIN",
      key: "estimated-margin",
      finalCents: finalTotalCents,
      marginBps,
      decision,
      reason: decision === "BLOCKED"
        ? "预计毛利低于硬性底线"
        : decision === "APPROVAL_REQUIRED"
          ? "预计毛利低于门店毛利底线，需要审批"
          : "预计毛利达到门店底线"
    });
  }

  return {
    decision: checks.some((check) => check.decision === "BLOCKED")
      ? "BLOCKED"
      : checks.some((check) => check.decision === "APPROVAL_REQUIRED")
        ? "APPROVAL_REQUIRED"
        : "NORMAL",
    checks
  };
}

function selectRules(
  rules: PricingRule[],
  target: PricingRuleTarget,
  context: Record<string, unknown>
) {
  const selected: PricingRule[] = [];
  for (const group of PRICING_RULE_GROUP_ORDER) {
    const matching = rules
      .filter((rule) => rule.target === target && rule.group === group)
      .filter((rule) => rule.conditions.every((condition) => matchesCondition(condition, context)))
      .sort((left, right) => right.priority - left.priority || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    if (matching[0]) selected.push(matching[0]);
  }
  return selected;
}

function matchesCondition(condition: PricingCondition, context: Record<string, unknown>) {
  const actual = context[condition.field];
  const expected = condition.value;
  switch (condition.operator) {
    case "EQ":
      return actual === expected;
    case "IN":
      return Array.isArray(expected) && expected.some((value) => value === actual);
    case "BETWEEN":
      return Array.isArray(expected) && expected.length === 2 &&
        typeof actual === "number" && typeof expected[0] === "number" && typeof expected[1] === "number" &&
        actual >= expected[0] && actual <= expected[1];
    case "GTE":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "LTE":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
  }
}

function applyAction(currentCents: number, actionType: PricingActionType, actionValue: number) {
  if (!Number.isInteger(actionValue)) throw new Error("价格调整值必须是整数");
  switch (actionType) {
    case "ADD_CENTS":
      return currentCents + actionValue;
    case "SUBTRACT_CENTS":
      return Math.max(0, currentCents - actionValue);
    case "MULTIPLY_BPS":
      return roundDiv(currentCents * (10000 + actionValue), 10000);
    case "DISCOUNT_BPS":
      return roundDiv(currentCents * (10000 - actionValue), 10000);
  }
}

function buildOrderContext(input: PricingCalculationInput) {
  return {
    vehicleClassCode: input.vehicleClassCode,
    constructionType: input.constructionType,
    constructionLocation: input.constructionLocation,
    effectiveAt: input.effectiveAt,
    lineCount: input.lines.length,
    totalQuantity: input.lines.reduce((sum, line) => sum + line.quantity, 0)
  };
}

function buildLineContext(line: PricingProductLineInput) {
  return {
    productId: line.productId,
    productCategory: line.category,
    productBrand: line.brand,
    productModel: line.model,
    salesUnit: line.salesUnit,
    quantity: line.quantity
  };
}

function toAppliedRule(
  rule: PricingRule,
  beforeCents: number,
  afterCents: number,
  lineId?: string
): PricingAppliedRule {
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    target: rule.target,
    group: rule.group,
    lineId,
    beforeCents,
    afterCents
  };
}

function calculateDeviationBps(suggestedCents: number, finalCents: number) {
  if (suggestedCents <= 0) return finalCents === suggestedCents ? 0 : 10000;
  return Math.floor((Math.abs(finalCents - suggestedCents) * 10000) / suggestedCents);
}

function decisionForDeviation(deviationBps: number, policy: PricingProtectionPolicy): PricingDecision {
  if (deviationBps > policy.approvalDeviationBps) return "BLOCKED";
  if (deviationBps > policy.normalDeviationBps) return "APPROVAL_REQUIRED";
  return "NORMAL";
}

function reasonForDecision(decision: PricingDecision, prefix: string) {
  if (decision === "NORMAL") return `${prefix}在普通阈值内`;
  if (decision === "APPROVAL_REQUIRED") return `${prefix}超出普通阈值，需要审批`;
  return `${prefix}超出审批上限，阻断提交`;
}

function assertPolicy(policy: PricingProtectionPolicy) {
  for (const [key, value] of Object.entries(policy)) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`${key} 必须是非负整数基点`);
    }
  }
  if (policy.approvalDeviationBps < policy.normalDeviationBps) {
    throw new Error("审批偏差阈值不能低于普通偏差阈值");
  }
}

function assertNonNegativeInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} 必须是非负整数`);
}

function roundDiv(numerator: number, denominator: number) {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function hashInput(input: PricingCalculationInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function countDecimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY;
  const text = String(value).toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const decimalLength = coefficient.includes(".")
    ? coefficient.length - coefficient.indexOf(".") - 1
    : 0;
  const exponent = exponentText ? Number(exponentText) : 0;
  return exponent < 0 ? Math.max(0, decimalLength + exponent * -1) : Math.max(0, decimalLength - exponent);
}
