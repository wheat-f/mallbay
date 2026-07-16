export type ConvertibleProductUnit = "ROLL" | "METER" | "SQUARE_METER" | "PIECE" | string;

export function unitConversionFactor(from: ConvertibleProductUnit, to: ConvertibleProductUnit, product: { rollWidthMeters: unknown; rollLengthMeters: unknown; metersPerRoll: unknown }) {
  if (from === to) return 1;
  const metersPerRoll = toNumber(product.metersPerRoll) ?? toNumber(product.rollLengthMeters);
  const rollWidthMeters = toNumber(product.rollWidthMeters);
  const rollArea = metersPerRoll != null && rollWidthMeters != null ? metersPerRoll * rollWidthMeters : null;
  if (from === "ROLL" && to === "METER") return metersPerRoll;
  if (from === "METER" && to === "ROLL") return metersPerRoll == null || metersPerRoll === 0 ? null : 1 / metersPerRoll;
  if (from === "ROLL" && to === "SQUARE_METER") return rollArea;
  if (from === "SQUARE_METER" && to === "ROLL") return rollArea == null || rollArea === 0 ? null : 1 / rollArea;
  if (from === "METER" && to === "SQUARE_METER") return rollWidthMeters;
  if (from === "SQUARE_METER" && to === "METER") return rollWidthMeters == null || rollWidthMeters === 0 ? null : 1 / rollWidthMeters;
  return null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") return value.toNumber();
  return value == null ? null : Number(value);
}
