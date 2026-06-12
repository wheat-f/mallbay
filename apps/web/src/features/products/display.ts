import type { ProductCategory, ProductUnit } from "@mallbay/shared";

export const PRODUCT_CATEGORY_OPTIONS: Array<{ label: string; value: ProductCategory }> = [
  { label: "漆面保护膜", value: "PPF" },
  { label: "改色膜", value: "COLOR_FILM" },
  { label: "隔热膜", value: "HEAT_FILM" },
  { label: "改装", value: "MODIFICATION" },
  { label: "其他", value: "OTHER" }
];

export const PRODUCT_UNIT_OPTIONS: Array<{ label: string; value: ProductUnit }> = [
  { label: "卷", value: "ROLL" },
  { label: "米", value: "METER" },
  { label: "件", value: "PIECE" }
];

export function getProductCategoryLabel(category: ProductCategory | string) {
  return PRODUCT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

export function getProductUnitLabel(unit: ProductUnit | string) {
  return PRODUCT_UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? unit;
}

export function getProductDisplayName(product: { brand?: string; name?: string; model?: string }) {
  return [
    product.brand ? `品牌：${product.brand}` : undefined,
    product.name ? `名称：${product.name}` : undefined,
    product.model ? `型号：${product.model}` : undefined
  ]
    .filter(Boolean)
    .join(" / ");
}

export function getProductInventorySpecLabel(product: {
  specification?: string;
  inventoryUnit?: ProductUnit | string;
  salesUnit?: ProductUnit | string;
  rollWidthMeters?: number;
  rollLengthMeters?: number;
  metersPerRoll?: number;
  quantityPrecision?: number;
}) {
  const parts = [
    product.inventoryUnit ? `库存单位：${getProductUnitLabel(product.inventoryUnit)}` : undefined,
    product.salesUnit ? `销售单位：${getProductUnitLabel(product.salesUnit)}` : undefined,
    product.rollWidthMeters !== undefined ? `卷宽：${formatMeter(product.rollWidthMeters)}m` : undefined,
    product.rollLengthMeters !== undefined ? `卷长：${formatMeter(product.rollLengthMeters)}m` : undefined,
    product.metersPerRoll !== undefined ? `1卷=${formatMeter(product.metersPerRoll)}m` : undefined,
    product.quantityPrecision !== undefined ? `精度：${product.quantityPrecision}位小数` : undefined
  ].filter(Boolean);

  if (parts.length > 0) {
    return parts.join(" / ");
  }
  return product.specification ? `规格：${product.specification}` : "-";
}

function formatMeter(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}
