import type { PricingCalculationInput, PricingCalculationResult } from "./pricing-engine";

export type ShadowPricingComparison = {
  legacyProductAmountCents: number;
  legacyLaborCostCents: number;
  legacyTotalCents: number;
  suggestedProductAmountCents: number;
  suggestedLaborCostCents: number;
  suggestedTotalCents: number;
  deltaTotalCents: number;
  deltaBps: number;
};

export function compareShadowPricing(input: PricingCalculationInput, suggestion: PricingCalculationResult): ShadowPricingComparison {
  const legacyProductAmountCents = input.lines.reduce((sum, line) => sum + line.baseUnitPriceCents * line.quantity, 0);
  const legacyLaborCostCents = input.baseLaborCostCents;
  const legacyTotalCents = legacyProductAmountCents + legacyLaborCostCents;
  const deltaTotalCents = suggestion.suggestedTotalCents - legacyTotalCents;
  return {
    legacyProductAmountCents,
    legacyLaborCostCents,
    legacyTotalCents,
    suggestedProductAmountCents: suggestion.suggestedProductAmountCents,
    suggestedLaborCostCents: suggestion.suggestedLaborCostCents,
    suggestedTotalCents: suggestion.suggestedTotalCents,
    deltaTotalCents,
    deltaBps: legacyTotalCents === 0 ? 0 : Math.round((deltaTotalCents * 10_000) / legacyTotalCents)
  };
}
