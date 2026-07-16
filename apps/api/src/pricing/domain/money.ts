/**
 * All persisted and compared monetary values are integer cents. Quantities
 * may be fractional (for example meters), so multiplication must be rounded
 * once at the line boundary using the same half-up rule everywhere.
 */
export function roundMoneyCents(value: number): number {
  if (!Number.isFinite(value)) throw new Error("金额必须是有限数值");
  return Math.floor(value + 0.5);
}

export function multiplyMoneyCents(unitPriceCents: number, quantity: number): number {
  return roundMoneyCents(unitPriceCents * quantity);
}
