export function resolveBaseLaborCost(config: unknown, input: { constructionType: string; constructionLocation: string }) {
  const defaults: Record<string, number> = { PPF: 180_000, COLOR_FILM: 160_000, HEAT_FILM: 80_000, MODIFICATION: 200_000, INSPECTION: 20_000 };
  const record = config && typeof config === "object" ? config as Record<string, unknown> : {};
  const configured = record.baseLaborCostCentsByConstruction;
  const key = input.constructionType + ":" + input.constructionLocation;
  if (configured && typeof configured === "object") {
    const values = configured as Record<string, unknown>;
    const exact = values[key] ?? values[input.constructionType];
    if (typeof exact === "number" && Number.isFinite(exact) && exact >= 0) return Math.round(exact);
  }
  const outsideSurcharge = input.constructionLocation === "OUTSIDE" ? 40_000 : 0;
  return (defaults[input.constructionType] ?? 0) + outsideSurcharge;
}
