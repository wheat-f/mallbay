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
      product?: {
        unit?: ProductUnit | string;
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
        } | null;
      }>;
    };
    availableBatches?: Array<{
      id: string;
      batchNo: string;
      availableQuantity: number | string;
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
  status: string;
};

export type InventoryMatchRow = {
  orderItemId: string;
  productId: string;
  productLabel: string;
  requiredQuantity: number;
  lockedQuantity: number;
  availableQuantity: number;
  shortageQuantity: number;
  unit: ProductUnit;
  availableBatches: Array<{
    id: string;
    batchNo: string;
    availableQuantity: number;
  }>;
};

export type InventoryCandidateBatch = InventoryMatchRow["availableBatches"][number];

export function buildInventoryMatchRows(match: InventoryMatchInput | undefined): InventoryMatchRow[] {
  return (match?.items ?? []).map((item) => {
    const requiredQuantity = toNumber(item.orderItem.quantity);
    const lockedQuantity = (item.orderItem.inventoryAllocations ?? [])
      .filter((allocation) => allocation.status !== "RELEASED" && allocation.status !== "OUTBOUND")
      .reduce((sum, allocation) => sum + Math.max(0, toNumber(allocation.lockedQuantity) - toNumber(allocation.outboundQuantity)), 0);
    const outboundQuantity = (item.orderItem.inventoryAllocations ?? [])
      .filter((allocation) => allocation.status === "OUTBOUND")
      .reduce((sum, allocation) => sum + Math.max(toNumber(allocation.outboundQuantity), toNumber(allocation.lockedQuantity)), 0);
    const availableBatches = (item.availableBatches ?? []).map((batch) => ({
      id: batch.id,
      batchNo: batch.batchNo,
      availableQuantity: toNumber(batch.availableQuantity)
    }));
    const availableQuantity = availableBatches.reduce((sum, batch) => sum + batch.availableQuantity, 0);
    const coveredQuantity = lockedQuantity + outboundQuantity;
    return {
      orderItemId: item.orderItem.id,
      productId: item.orderItem.productId,
      productLabel: getOrderItemProductLabel(item.orderItem.product),
      requiredQuantity,
      lockedQuantity,
      availableQuantity,
      shortageQuantity: Math.max(0, requiredQuantity - coveredQuantity - availableQuantity),
      unit: normalizeUnit(item.orderItem.product?.unit),
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
  if (value === "ROLL" || value === "METER" || value === "PIECE") return value;
  return "ROLL";
}
