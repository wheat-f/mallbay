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
    const lockedQuantity = (item.orderItem.inventoryAllocations ?? [])
      .filter((allocation) => allocation.status !== "RELEASED")
      .reduce((sum, allocation) => sum + Math.max(0, toNumber(allocation.lockedQuantity) - toNumber(allocation.outboundQuantity)), 0);
    const outboundQuantity = (item.orderItem.inventoryAllocations ?? [])
      .filter((allocation) => allocation.status !== "RELEASED")
      .reduce((sum, allocation) => sum + toNumber(allocation.outboundQuantity), 0);
    const availableBatches = (item.availableBatches ?? []).map((batch) => ({
      id: batch.id,
      batchNo: batch.batchNo,
      availableQuantity: toNumber(batch.availableQuantity),
      unit: normalizeUnit(batch.unit ?? baseUnit),
      packageUnit: batch.packageUnit ? normalizeUnit(batch.packageUnit) : null,
      packageQuantity: batch.packageQuantity,
      baseQuantityPerPackage: batch.baseQuantityPerPackage
    }));
    const availableQuantity = availableBatches.reduce((sum, batch) => sum + batch.availableQuantity, 0);
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
        return {
          id: allocation.id ?? `${item.orderItem.id}:${allocation.batchId ?? "batch"}`,
          orderItemId: item.orderItem.id,
          productLabel,
          batchLabel: allocation.batch?.batchNo ?? INVENTORY_BATCH_MISSING_LABEL,
          lockedQuantity,
          outboundQuantity,
          remainingQuantity: Math.max(0, lockedQuantity - outboundQuantity),
          unit: normalizeUnit(allocation.batch?.unit ?? item.orderItem.baseUnit ?? item.orderItem.product?.inventoryUnit ?? item.orderItem.product?.unit),
          status: allocation.status ?? "-"
        };
      });
  });
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

function normalizeQuantity(value: number) {
  return Number(value.toFixed(3));
}
