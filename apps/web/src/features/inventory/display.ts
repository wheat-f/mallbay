import type { ProductCategory, ProductUnit } from "@mallbay/shared";
import {
  getProductCategoryLabel,
  getProductDisplayName,
  getProductInventorySpecLabel,
  getProductUnitLabel
} from "../products/display";

type ProductLookup = Map<string, { brand?: string | null; name?: string | null; model?: string | null }>;

export const INVENTORY_PRODUCT_MISSING_LABEL = "产品未加载";
export const INVENTORY_BATCH_MISSING_LABEL = "批次未加载";

export type PurchaseInboundItemLike = {
  product?: {
    brand?: string | null;
    name?: string | null;
    model?: string | null;
    category?: ProductCategory | string | null;
    specification?: string | null;
    inventoryUnit?: ProductUnit | string | null;
    salesUnit?: ProductUnit | string | null;
    rollWidthMeters?: number | string | null;
    rollLengthMeters?: number | string | null;
    metersPerRoll?: number | string | null;
    quantityPrecision?: number | null;
    warrantyYears?: number | null;
  } | null;
  quantity?: number | string | null;
  receivedQuantity?: number | string | null;
  receivedBatches?: Array<{
    batchNo?: string | null;
    quantity?: number | string | null;
    receivedAt?: string | Date | null;
  }>;
};

export type InventoryOrderLike = {
  id?: string | null;
  orderNo?: string | null;
  customer?: {
    name?: string | null;
    companyName?: string | null;
    contactName?: string | null;
    contactPerson?: string | null;
  } | null;
  vehicle?: {
    plateNo?: string | null;
    model?: string | null;
    color?: string | null;
    carPlate?: string | null;
    carModel?: string | null;
    carColor?: string | null;
  } | null;
  items?: Array<{
    quantity?: number | string | null;
    productId?: string | null;
    product?: {
      brand?: string | null;
      name?: string | null;
      model?: string | null;
    } | null;
  }>;
};

export function getInventoryOrderCustomerLabel(order: InventoryOrderLike) {
  const customer = order.customer;
  if (!customer) return "-";
  if (customer.companyName) {
    return [customer.companyName, customer.contactName ?? customer.contactPerson].filter(Boolean).join(" / ");
  }
  return customer.name ?? "-";
}

export function getInventoryOrderVehicleLabel(order: InventoryOrderLike) {
  const vehicle = order.vehicle;
  if (!vehicle) return "-";
  return [
    vehicle.plateNo ?? vehicle.carPlate,
    vehicle.model ?? vehicle.carModel,
    vehicle.color ?? vehicle.carColor
  ].filter(Boolean).join(" / ") || "-";
}

export function getInventoryOrderItemsSummary(order: InventoryOrderLike) {
  const items = order.items ?? [];
  if (items.length === 0) return "-";
  return items
    .map((item) => {
      const name = item.product
        ? getProductDisplayName({
            brand: item.product.brand ?? undefined,
            name: item.product.name ?? undefined,
            model: item.product.model ?? undefined
          })
        : INVENTORY_PRODUCT_MISSING_LABEL;
      return `${name} x ${item.quantity ?? 0}`;
    })
    .join("；");
}

export function getInventoryProductLabel(productId: string | undefined | null, products: ProductLookup) {
  if (!productId) return "-";
  const product = products.get(productId);
  return product
    ? getProductDisplayName({
        brand: product.brand ?? undefined,
        name: product.name ?? undefined,
        model: product.model ?? undefined
      })
    : INVENTORY_PRODUCT_MISSING_LABEL;
}

export function getInventoryBatchLabel(
  batch: {
    batchNo?: string | null;
    productId?: string | null;
    availableQuantity?: number | string | null;
  },
  products: ProductLookup
) {
  return [
    batch.batchNo ?? "-",
    getInventoryProductLabel(batch.productId, products),
    `可用 ${batch.availableQuantity ?? 0}`
  ].join(" · ");
}

export function getPurchaseRequirementSourceOrderLabel(
  requirement: { sourceOrderId?: string | null; sourceOrder?: InventoryOrderLike | null },
  orderLookup?: Map<string, InventoryOrderLike>
) {
  const order = requirement.sourceOrder ?? (requirement.sourceOrderId ? orderLookup?.get(requirement.sourceOrderId) : undefined);
  if (!order) return requirement.sourceOrderId ? "关联订单未加载" : "手工创建";

  return [
    order.orderNo,
    getInventoryOrderCustomerLabel(order),
    getInventoryOrderVehicleLabel(order),
    getInventoryOrderItemsSummary(order)
  ].filter((part) => part && part !== "-").join(" · ") || (requirement.sourceOrderId ? "关联订单未加载" : "手工创建");
}

export function getPurchaseRequirementItemsSummary(
  requirement: {
    items?: Array<{
      productId?: string | null;
      requiredQuantity?: number | string | null;
      requiredUnit?: ProductUnit | string | null;
    }>;
  },
  products: ProductLookup
) {
  const items = requirement.items ?? [];
  if (items.length === 0) return "-";
  return items
    .map((item) => [
      getInventoryProductLabel(item.productId, products),
      `x ${item.requiredQuantity ?? 0}`,
      item.requiredUnit ? getProductUnitLabel(item.requiredUnit) : undefined
    ].filter(Boolean).join(" "))
    .join("；");
}

export const INVENTORY_MOVEMENT_TYPE_LABEL: Record<string, string> = {
  PURCHASE_IN: "采购入库",
  ORDER_LOCK: "订单锁库",
  ORDER_OUT: "订单出库",
  STOCK_RELEASE: "释放锁库",
  STOCK_ADJUST: "库存调整",
  DAMAGE: "报损",
  TRANSFER: "调拨",
  COUNT_IN: "盘点入库",
  COUNT_OUT: "盘点出库",
  DAMAGE_OUT: "报损出库",
  TRANSFER_IN: "调拨入库",
  TRANSFER_OUT: "调拨出库",
  RETURN_IN: "退货入库",
  RETURN_OUT: "退货出库",
  UNIT_CONVERSION: "单位转换",
  BATCH_SPLIT: "批次拆分"
};

export const INVENTORY_ALLOCATION_STATUS_LABEL: Record<string, string> = {
  LOCKED: "已锁定",
  OUTBOUND: "已出库",
  RELEASED: "已释放"
};

export const PURCHASE_REQUIREMENT_STATUS_LABEL: Record<string, string> = {
  OPEN: "待处理",
  PARTIAL_ORDERED: "部分下单",
  ORDERED: "已下单",
  PARTIAL_RECEIVED: "部分入库",
  FULFILLED: "已完成",
  CANCELLED: "已取消"
};

export const PURCHASE_ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  ORDERED: "已下单",
  PARTIAL_RECEIVED: "部分入库",
  RECEIVED: "已入库",
  CANCELLED: "已取消"
};

export function getInventoryMovementTypeLabel(value?: string | null) {
  if (!value) return "-";
  return INVENTORY_MOVEMENT_TYPE_LABEL[value] ?? value;
}

export function getInventoryAllocationStatusLabel(value?: string | null) {
  if (!value) return "-";
  return INVENTORY_ALLOCATION_STATUS_LABEL[value] ?? value;
}

export function getPurchaseRequirementStatusLabel(value?: string | null) {
  if (!value) return "-";
  return PURCHASE_REQUIREMENT_STATUS_LABEL[value] ?? value;
}

export function getPurchaseOrderStatusLabel(value?: string | null) {
  if (!value) return "-";
  return PURCHASE_ORDER_STATUS_LABEL[value] ?? value;
}

export type InventoryMovementSummaryRow = {
  movementType?: string | null;
  quantity?: number | string | null;
};

export function getInventoryMovementSummary(movements: InventoryMovementSummaryRow[]) {
  const summary = {
    inbound: 0,
    outbound: 0,
    locked: 0,
    released: 0,
    adjustments: 0,
    totalRows: movements.length
  };

  for (const movement of movements) {
    const quantity = toNumber(movement.quantity);
    switch (movement.movementType) {
      case "PURCHASE_IN":
      case "COUNT_IN":
      case "TRANSFER_IN":
      case "RETURN_IN":
        summary.inbound += quantity;
        break;
      case "ORDER_OUT":
      case "COUNT_OUT":
      case "DAMAGE_OUT":
      case "TRANSFER_OUT":
      case "RETURN_OUT":
        summary.outbound += quantity;
        break;
      case "ORDER_LOCK":
        summary.locked += quantity;
        break;
      case "STOCK_RELEASE":
        summary.released += quantity;
        break;
      case "STOCK_ADJUST":
      case "DAMAGE":
      case "TRANSFER":
      case "UNIT_CONVERSION":
      case "BATCH_SPLIT":
        summary.adjustments += quantity;
        break;
      default:
        break;
    }
  }

  return {
    inbound: formatQuantity(summary.inbound, 3),
    outbound: formatQuantity(summary.outbound, 3),
    locked: formatQuantity(summary.locked, 3),
    released: formatQuantity(summary.released, 3),
    adjustments: formatQuantity(summary.adjustments, 3),
    totalRows: summary.totalRows.toString()
  };
}

export function getInventoryBatchSplitSummary(input: {
  originalBatch?: {
    batchNo?: string | null;
    availableQuantity?: number | string | null;
  } | null;
  childBatch?: {
    batchNo?: string | null;
    availableQuantity?: number | string | null;
    unit?: string | null;
  } | null;
  quantityMeters: number;
  metersPerRoll?: number | string | null;
  quantityPrecision?: number | null;
}) {
  const metersPerRoll = toNumber(input.metersPerRoll);
  const splitRollQuantity = metersPerRoll > 0 ? input.quantityMeters / metersPerRoll : 0;
  const precision = input.quantityPrecision ?? 3;
  const originalAvailable = toNumber(input.originalBatch?.availableQuantity);
  const remainingRollQuantity = Math.max(0, originalAvailable - splitRollQuantity);
  const originalBatchNo = input.originalBatch?.batchNo ?? "-";
  const childBatchNo = input.childBatch?.batchNo ?? "-";
  const childQuantity = toNumber(input.childBatch?.availableQuantity) || input.quantityMeters;

  return {
    original: `原批次 ${originalBatchNo} 剩余约 ${formatQuantity(remainingRollQuantity, precision)} 卷`,
    child: `新批次 ${childBatchNo} 生成 ${formatQuantity(childQuantity, precision)} 米`,
    conversion: metersPerRoll > 0
      ? `换算关系 1 卷 = ${formatQuantity(metersPerRoll, precision)} 米，本次拆分 ${formatQuantity(input.quantityMeters, precision)} 米 = ${formatQuantity(splitRollQuantity, precision)} 卷`
      : `本次拆分 ${formatQuantity(input.quantityMeters, precision)} 米`
  };
}

export function getPurchaseInboundItemDetails(item: PurchaseInboundItemLike) {
  const product = item.product;
  return {
    product: product
      ? getProductDisplayName({
          brand: product.brand ?? undefined,
          name: product.name ?? undefined,
          model: product.model ?? undefined
        }) || "-"
      : "-",
    category: product?.category ? getProductCategoryLabel(product.category) : "-",
    specification: product
      ? getProductInventorySpecLabel({
          specification: product.specification ?? undefined,
          inventoryUnit: product.inventoryUnit ?? undefined,
          salesUnit: product.salesUnit ?? undefined,
          rollWidthMeters: toOptionalNumber(product.rollWidthMeters),
          rollLengthMeters: toOptionalNumber(product.rollLengthMeters),
          metersPerRoll: toOptionalNumber(product.metersPerRoll),
          quantityPrecision: product.quantityPrecision ?? undefined
        })
      : "-",
    warranty: product?.warrantyYears ? `${product.warrantyYears} 年` : "-",
    quantity: `采购 ${formatQuantity(toNumber(item.quantity), 3)} / 已入库 ${formatQuantity(toNumber(item.receivedQuantity), 3)}`,
    batches: formatReceivedBatches(item.receivedBatches ?? [])
  };
}

export function getPurchaseOrderArrivalReminder(
  order: { status?: string | null; expectedAt?: string | Date | null },
  today: Date = new Date()
) {
  if (order.status === "RECEIVED") return "已全部入库";
  if (!order.expectedAt) return "未设置预计到货日";

  const expectedDate = startOfLocalDay(order.expectedAt);
  const todayDate = startOfLocalDay(today);
  const diffDays = Math.round((expectedDate.getTime() - todayDate.getTime()) / 86_400_000);

  if (diffDays < 0) return `已逾期 ${Math.abs(diffDays)} 天`;
  if (diffDays === 0) return "今日预计到货";
  if (diffDays === 1) return "明日预计到货";
  return `${diffDays} 天后预计到货`;
}

function toNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
}

function toOptionalNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function formatQuantity(value: number, precision: number) {
  return Number(value.toFixed(precision)).toString();
}

function formatReceivedBatches(
  batches: NonNullable<PurchaseInboundItemLike["receivedBatches"]>
) {
  if (batches.length === 0) return "-";
  return batches
    .map((batch) => {
      const date = formatDate(batch.receivedAt);
      const quantity = formatQuantity(toNumber(batch.quantity), 3);
      return `${batch.batchNo ?? "-"} x ${quantity}${date ? `（${date}）` : ""}`;
    })
    .join("；");
}

function formatDate(value?: string | Date | null) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function startOfLocalDay(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
