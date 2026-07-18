import type { ProductUnit } from "@mallbay/shared";
import { getProductDisplayName } from "../products/display";
import { INVENTORY_BATCH_MISSING_LABEL, INVENTORY_PRODUCT_MISSING_LABEL } from "./display";
import type { CreatePurchaseRequirementPayload } from "./api";

export type InventoryMatchInput = {
  items?: Array<{
    orderItem: {
      id: string;
      productId: string;
      quantity: number | string;
      salesUnit?: ProductUnit | string | null;
      baseUnit?: ProductUnit | string | null;
      baseQuantityPerSalesUnit?: number | string | null;
      requiredBaseQuantity?: number | string | null;
      product?: {
        unit?: ProductUnit | string;
        inventoryUnit?: ProductUnit | string | null;
        salesUnit?: ProductUnit | string | null;
        metersPerRoll?: number | string | null;
        quantityPrecision?: number | null;
        brand?: string | null;
        name?: string | null;
        model?: string | null;
      } | null;
      inventoryAllocations?: Array<{
        id?: string | null;
        batchId?: string | null;
        lockedQuantity?: number | string | null;
        outboundQuantity?: number | string | null;
        status?: string | null;
        batch?: {
          batchNo?: string | null;
          unit?: ProductUnit | string | null;
          packageUnit?: ProductUnit | string | null;
          packageQuantity?: number | string | null;
          baseQuantityPerPackage?: number | string | null;
        } | null;
      }>;
    };
    availableBatches?: Array<{
      id: string;
      batchNo: string;
      availableQuantity: number | string;
      unit?: ProductUnit | string | null;
      packageUnit?: ProductUnit | string | null;
      packageQuantity?: number | string | null;
      baseQuantityPerPackage?: number | string | null;
    }>;
  }>;
};

export type InventoryAllocationRow = {
  id: string;
  orderItemId: string;
  productLabel: string;
  batchLabel: string;
  lockedQuantity: number;
  outboundQuantity: number;
  remainingQuantity: number;
  unit: ProductUnit;
  salesUnit: ProductUnit;
  packageUnit?: ProductUnit | null;
  baseQuantityPerPackage?: number | null;
  metersPerRoll?: number | null;
  quantityPrecision?: number;
  status: string;
};

export type InventoryMatchRow = {
  orderItemId: string;
  productId: string;
  productLabel: string;
  salesQuantity: number;
  salesUnit: ProductUnit;
  requiredQuantity: number;
  lockedQuantity: number;
  outboundQuantity: number;
  pendingQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
  unit: ProductUnit;
  metersPerRoll?: number | null;
  quantityPrecision?: number;
  availableBatches: Array<{
    id: string;
    batchNo: string;
    availableQuantity: number;
    unit: ProductUnit;
    packageUnit?: ProductUnit | null;
    packageQuantity?: number | string | null;
    baseQuantityPerPackage?: number | string | null;
  }>;
};

export type InventoryCandidateBatch = InventoryMatchRow["availableBatches"][number];

export function buildInventoryMatchRows(match: InventoryMatchInput | undefined): InventoryMatchRow[] {
  return (match?.items ?? []).map((item) => {
    const salesQuantity = toNumber(item.orderItem.quantity);
    const salesUnit = normalizeUnit(item.orderItem.salesUnit ?? item.orderItem.product?.salesUnit ?? item.orderItem.product?.unit);
    const baseUnit = normalizeUnit(item.orderItem.baseUnit ?? item.orderItem.product?.inventoryUnit ?? item.orderItem.product?.unit ?? salesUnit);
    const conversionRate = toNumber(item.orderItem.baseQuantityPerSalesUnit) || 1;
    const requiredQuantity = toNumber(item.orderItem.requiredBaseQuantity) || normalizeQuantity(salesQuantity * conversionRate);
    const metersPerRoll = resolveMetersPerRoll(item.orderItem, conversionRate);
    const quantityPrecision = normalizePrecision(item.orderItem.product?.quantityPrecision);
    const lockedQuantity = (item.orderItem.inventoryAllocations ?? [])
      .reduce((sum, allocation) => {
        if (allocation.status === "RELEASED") return sum;
        const locked = convertInventoryQuantity(
          Math.max(0, toNumber(allocation.lockedQuantity) - toNumber(allocation.outboundQuantity)),
          normalizeUnit(allocation.batch?.unit ?? baseUnit),
          baseUnit,
          { baseUnit: normalizeUnit(allocation.batch?.unit ?? baseUnit), packageUnit: allocation.batch?.packageUnit, baseQuantityPerPackage: allocation.batch?.baseQuantityPerPackage, metersPerRoll, precision: quantityPrecision }
        );
        return sum + (locked ?? 0);
      }, 0);
    const outboundQuantity = (item.orderItem.inventoryAllocations ?? [])
      .reduce((sum, allocation) => {
        const outbound = convertInventoryQuantity(
          toNumber(allocation.outboundQuantity),
          normalizeUnit(allocation.batch?.unit ?? baseUnit),
          baseUnit,
          { baseUnit: normalizeUnit(allocation.batch?.unit ?? baseUnit), packageUnit: allocation.batch?.packageUnit, baseQuantityPerPackage: allocation.batch?.baseQuantityPerPackage, metersPerRoll, precision: quantityPrecision }
        );
        return sum + (outbound ?? 0);
      }, 0);
    const availableBatches = (item.availableBatches ?? []).map((batch) => ({
      id: batch.id,
      batchNo: batch.batchNo,
      availableQuantity: toNumber(batch.availableQuantity),
      unit: normalizeUnit(batch.unit ?? baseUnit),
      packageUnit: batch.packageUnit ? normalizeUnit(batch.packageUnit) : null,
      packageQuantity: batch.packageQuantity,
      baseQuantityPerPackage: batch.baseQuantityPerPackage
    }));
    const availableQuantity = availableBatches.reduce((sum, batch) => sum + (convertInventoryQuantity(
      batch.availableQuantity,
      batch.unit,
      baseUnit,
      { baseUnit: batch.unit, packageUnit: batch.packageUnit, baseQuantityPerPackage: batch.baseQuantityPerPackage, metersPerRoll, precision: quantityPrecision }
    ) ?? 0), 0);
    const coveredQuantity = lockedQuantity + outboundQuantity;
    const pendingQuantity = Math.max(0, requiredQuantity - coveredQuantity);
    return {
      orderItemId: item.orderItem.id,
      productId: item.orderItem.productId,
      productLabel: getOrderItemProductLabel(item.orderItem.product),
      salesQuantity,
      salesUnit,
      requiredQuantity,
      lockedQuantity,
      outboundQuantity,
      pendingQuantity,
      availableQuantity,
      shortageQuantity: Math.max(0, pendingQuantity - availableQuantity),
      unit: baseUnit,
      ...(metersPerRoll ? { metersPerRoll } : {}),
      ...(item.orderItem.product?.quantityPrecision !== undefined ? { quantityPrecision } : {}),
      availableBatches
    };
  });
}

export function buildPurchaseRequirementFromShortages(
  storeId: string,
  orderId: string,
  rows: InventoryMatchRow[]
): CreatePurchaseRequirementPayload {
  return {
    storeId,
    sourceOrderId: orderId,
    items: rows
      .filter((row) => row.shortageQuantity > 0)
      .map((row) => ({
        productId: row.productId,
        orderItemId: row.orderItemId,
        requiredQuantity: row.shortageQuantity,
        requiredUnit: row.unit
      }))
  };
}

export function filterInventoryBatches(
  batches: InventoryCandidateBatch[],
  keyword: string | undefined
) {
  const normalizedKeyword = keyword?.trim().toLowerCase();
  if (!normalizedKeyword) return batches;
  return batches.filter((batch) => batch.batchNo.toLowerCase().includes(normalizedKeyword));
}

export function buildInventoryAllocationRows(match: InventoryMatchInput | undefined): InventoryAllocationRow[] {
  return (match?.items ?? []).flatMap((item) => {
    const productLabel = getOrderItemProductLabel(item.orderItem.product);
    return (item.orderItem.inventoryAllocations ?? [])
      .filter((allocation) => allocation.status === "LOCKED")
      .map((allocation) => {
        const lockedQuantity = toNumber(allocation.lockedQuantity);
        const outboundQuantity = toNumber(allocation.outboundQuantity);
        const salesUnit = normalizeUnit(item.orderItem.salesUnit ?? item.orderItem.product?.salesUnit ?? item.orderItem.product?.unit);
        const quantityPrecision = normalizePrecision(item.orderItem.product?.quantityPrecision);
        return {
          id: allocation.id ?? `${item.orderItem.id}:${allocation.batchId ?? "batch"}`,
          orderItemId: item.orderItem.id,
          productLabel,
          batchLabel: allocation.batch?.batchNo ?? INVENTORY_BATCH_MISSING_LABEL,
          lockedQuantity,
          outboundQuantity,
          remainingQuantity: Math.max(0, lockedQuantity - outboundQuantity),
          unit: normalizeUnit(allocation.batch?.unit ?? item.orderItem.baseUnit ?? item.orderItem.product?.inventoryUnit ?? item.orderItem.product?.unit),
          salesUnit,
          ...(allocation.batch?.packageUnit ? { packageUnit: normalizeUnit(allocation.batch.packageUnit) } : {}),
          ...(toOptionalNumber(allocation.batch?.baseQuantityPerPackage) ? { baseQuantityPerPackage: toOptionalNumber(allocation.batch?.baseQuantityPerPackage) } : {}),
          ...(resolveMetersPerRoll(item.orderItem, toNumber(item.orderItem.baseQuantityPerSalesUnit) || 1) ? { metersPerRoll: resolveMetersPerRoll(item.orderItem, toNumber(item.orderItem.baseQuantityPerSalesUnit) || 1) } : {}),
          ...(item.orderItem.product?.quantityPrecision !== undefined ? { quantityPrecision } : {}),
          status: allocation.status ?? "-"
        };
      });
  });
}

export function buildInventoryQuantityUnitOptions(input: {
  unit: ProductUnit;
  packageUnit?: ProductUnit | null;
  baseQuantityPerPackage?: number | string | null;
  metersPerRoll?: number | null;
  salesUnit?: ProductUnit;
}) {
  const meterRollAlternative = input.metersPerRoll && input.metersPerRoll > 0 && (input.unit === "ROLL" || input.unit === "METER")
    ? (input.unit === "ROLL" ? "METER" : "ROLL") as ProductUnit
    : undefined;
  const candidates = [input.unit, input.packageUnit, input.salesUnit, meterRollAlternative]
    .filter((unit): unit is ProductUnit => Boolean(unit));
  return Array.from(new Set(candidates))
    .filter((unit) => convertInventoryQuantity(1, input.unit, unit, { ...input, baseUnit: input.unit }) !== undefined)
    .map((unit) => ({ value: unit, label: getUnitLabel(unit) }));
}

export function getInventoryQuantityMax(input: {
  availableBaseQuantity: number;
  requiredBaseQuantity?: number;
  baseUnit: ProductUnit;
  targetUnit: ProductUnit;
  packageUnit?: ProductUnit | null;
  baseQuantityPerPackage?: number | string | null;
  metersPerRoll?: number | null;
  quantityPrecision?: number;
}) {
  const requiredInBase = input.requiredBaseQuantity ?? input.availableBaseQuantity;
  const maximumBase = Math.min(input.availableBaseQuantity, requiredInBase);
  return convertInventoryQuantity(maximumBase, input.baseUnit, input.targetUnit, input);
}

export function getInventoryQuantityStep(precision?: number) {
  return Number((1 / (10 ** normalizePrecision(precision))).toFixed(normalizePrecision(precision)));
}

export function convertInventoryQuantity(
  quantity: number,
  fromUnit: ProductUnit,
  toUnit: ProductUnit,
  input: {
  packageUnit?: ProductUnit | string | null;
  baseUnit?: ProductUnit;
  baseQuantityPerPackage?: number | string | null;
    metersPerRoll?: number | null;
    precision?: number;
  }
) {
  const precision = normalizePrecision(input.precision);
  if (!Number.isFinite(quantity) || quantity < 0) return undefined;
  if (fromUnit === toUnit) return normalizeQuantity(quantity, precision);

  const packageUnit = input.packageUnit ? normalizeUnit(input.packageUnit) : undefined;
  const packageRate = toNumber(input.baseQuantityPerPackage);
  if (packageUnit && input.baseUnit && packageUnit !== input.baseUnit && packageRate > 0) {
    if (fromUnit === packageUnit && toUnit === input.baseUnit) return normalizeQuantity(quantity * packageRate, precision);
    if (fromUnit === input.baseUnit && toUnit === packageUnit) return normalizeQuantity(quantity / packageRate, precision);
  }

  const metersPerRoll = toNumber(input.metersPerRoll);
  if (metersPerRoll > 0 && [fromUnit, toUnit].every((unit) => unit === "ROLL" || unit === "METER")) {
    return fromUnit === "ROLL"
      ? normalizeQuantity(quantity * metersPerRoll, precision)
      : normalizeQuantity(quantity / metersPerRoll, precision);
  }
  return undefined;
}

function getOrderItemProductLabel(product?: { brand?: string | null; name?: string | null; model?: string | null } | null) {
  return product
    ? getProductDisplayName({
        brand: product.brand ?? undefined,
        name: product.name ?? undefined,
        model: product.model ?? undefined
      })
    : INVENTORY_PRODUCT_MISSING_LABEL;
}

function toNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
}

function normalizeUnit(value?: ProductUnit | string | null): ProductUnit {
  if (
    value === "ROLL" ||
    value === "METER" ||
    value === "SQUARE_METER" ||
    value === "SQUARE_CENTIMETER" ||
    value === "PIECE"
  ) return value;
  return "ROLL";
}

function normalizeQuantity(value: number, precision = 3) {
  return Number(value.toFixed(precision));
}

function resolveMetersPerRoll(
  orderItem: NonNullable<InventoryMatchInput["items"]>[number]["orderItem"],
  baseQuantityPerSalesUnit: number
) {
  const configured = toNumber(orderItem.product?.metersPerRoll);
  if (configured > 0) return configured;
  const salesUnit = normalizeUnit(orderItem.salesUnit ?? orderItem.product?.salesUnit ?? orderItem.product?.unit);
  const baseUnit = normalizeUnit(orderItem.baseUnit ?? orderItem.product?.inventoryUnit ?? orderItem.product?.unit ?? salesUnit);
  if (salesUnit === "ROLL" && baseUnit === "METER" && baseQuantityPerSalesUnit > 0) return baseQuantityPerSalesUnit;
  if (salesUnit === "METER" && baseUnit === "ROLL" && baseQuantityPerSalesUnit > 0) return 1 / baseQuantityPerSalesUnit;
  return undefined;
}

function normalizePrecision(precision?: number | null) {
  if (!Number.isInteger(precision) || !precision || precision < 0) return 3;
  return Math.min(3, precision);
}

function toOptionalNumber(value?: number | string | null) {
  const number = toNumber(value);
  return number > 0 ? number : undefined;
}

function getUnitLabel(unit: ProductUnit) {
  const labels: Record<ProductUnit, string> = {
    ROLL: "卷",
    METER: "米",
    SQUARE_METER: "平方米",
    SQUARE_CENTIMETER: "平方厘米",
    PIECE: "件"
  };
  return labels[unit];
}
