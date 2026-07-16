export type MultiProductLaborLine = {
  id: string;
  baseLaborCostCents: number;
  addonLaborCostCents?: number;
};

export type MultiProductLaborResult = {
  primaryLineId: string | null;
  baseLaborCostCents: number;
  addonLaborCostCents: number;
  totalLaborCostCents: number;
};

/** Highest base labor is charged once; every other line contributes only its add-on. */
export function aggregateMultiProductLabor(lines: MultiProductLaborLine[]): MultiProductLaborResult {
  if (lines.length === 0) {
    return { primaryLineId: null, baseLaborCostCents: 0, addonLaborCostCents: 0, totalLaborCostCents: 0 };
  }
  for (const line of lines) {
    if (!Number.isInteger(line.baseLaborCostCents) || line.baseLaborCostCents < 0) {
      throw new Error(`line.${line.id}.baseLaborCostCents 必须是非负整数`);
    }
    if (line.addonLaborCostCents !== undefined && (!Number.isInteger(line.addonLaborCostCents) || line.addonLaborCostCents < 0)) {
      throw new Error(`line.${line.id}.addonLaborCostCents 必须是非负整数`);
    }
  }
  const primary = [...lines].sort((left, right) => right.baseLaborCostCents - left.baseLaborCostCents || left.id.localeCompare(right.id))[0];
  const addonLaborCostCents = lines.reduce((sum, line) => sum + (line.id === primary.id ? 0 : line.addonLaborCostCents ?? 0), 0);
  return {
    primaryLineId: primary.id,
    baseLaborCostCents: primary.baseLaborCostCents,
    addonLaborCostCents,
    totalLaborCostCents: primary.baseLaborCostCents + addonLaborCostCents
  };
}
