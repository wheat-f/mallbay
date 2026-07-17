import type { ProductCategory, ProductUnit } from "@mallbay/shared";
import type { CreateProductPayload, ProductUnitSuggestedPrice } from "./api";

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
  alternateUnitSuggestedPriceYuan?: number;
  standardCostYuan?: number;
};

export type ProductPayloadLike = Partial<CreateProductPayload> & {
  basePriceCents?: number;
  unitSuggestedPrices?: ProductUnitSuggestedPrice[];
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
    basePriceCents: yuanToCents(values.basePriceYuan ?? 0),
    ...(values.standardCostYuan === undefined ? {} : { standardCostCents: yuanToCents(values.standardCostYuan) })
  }) as CreateProductPayload;
}

export function toProductFormValues(product: ProductPayloadLike): ProductFormValues {
  const salesUnit = product.salesUnit ?? product.unit;
  const alternateUnit = salesUnit === "ROLL" ? "METER" : salesUnit === "METER" ? "ROLL" : undefined;
  const alternatePrice = alternateUnit
    ? product.unitSuggestedPrices?.find((price) => price.salesUnit === alternateUnit && price.isActive)
    : undefined;
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
    basePriceYuan: centsToYuan(product.basePriceCents ?? 0),
    ...(alternatePrice ? { alternateUnitSuggestedPriceYuan: centsToYuan(alternatePrice.suggestedPriceCents) } : {}),
    ...(product.standardCostCents === undefined || product.standardCostCents === null ? {} : { standardCostYuan: centsToYuan(product.standardCostCents) })
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
