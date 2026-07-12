import type { ProductCategory, ProductUnit } from "@mallbay/shared";
import type { CreateProductPayload } from "./api";

export type ProductFormValues = {
  brand?: string;
  name?: string;
  model?: string;
  category?: ProductCategory;
  specification?: string;
  unit?: ProductUnit;
  inventoryUnit?: ProductUnit;
  salesUnit?: ProductUnit;
  rollWidthMeters?: number;
  rollLengthMeters?: number;
  metersPerRoll?: number;
  quantityPrecision?: number;
  warrantyYears?: number;
  basePriceYuan?: number;
};

export type ProductPayloadLike = Partial<CreateProductPayload> & {
  basePriceCents?: number;
};

export function toProductPayload(storeId: string, values: ProductFormValues): CreateProductPayload {
  return removeUndefined({
    storeId,
    brand: values.brand ?? "",
    name: values.name ?? "",
    model: values.model ?? "",
    category: values.category ?? "OTHER",
    specification: values.specification,
    unit: values.unit ?? "PIECE",
    inventoryUnit: values.inventoryUnit,
    salesUnit: values.salesUnit,
    rollWidthMeters: values.rollWidthMeters,
    rollLengthMeters: values.rollLengthMeters,
    metersPerRoll: values.metersPerRoll,
    quantityPrecision: values.quantityPrecision,
    warrantyYears: values.warrantyYears,
    basePriceCents: yuanToCents(values.basePriceYuan ?? 0)
  }) as CreateProductPayload;
}

export function toProductFormValues(product: ProductPayloadLike): ProductFormValues {
  return {
    brand: product.brand,
    name: product.name,
    model: product.model,
    category: product.category,
    specification: product.specification,
    unit: product.unit,
    inventoryUnit: product.inventoryUnit,
    salesUnit: product.salesUnit,
    rollWidthMeters: product.rollWidthMeters,
    rollLengthMeters: product.rollLengthMeters,
    metersPerRoll: product.metersPerRoll,
    quantityPrecision: product.quantityPrecision,
    warrantyYears: product.warrantyYears,
    basePriceYuan: centsToYuan(product.basePriceCents ?? 0)
  };
}

function yuanToCents(value: number) {
  return Math.round(value * 100);
}

function centsToYuan(value: number) {
  return value / 100;
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined));
}
