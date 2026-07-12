import { ProductUnit } from "@prisma/client";

type ToBaseInput = {
  quantity: number;
  fromUnit: ProductUnit;
  baseUnit: ProductUnit;
  packageUnit?: ProductUnit | null;
  baseQuantityPerPackage?: number | null;
  precision?: number | null;
};

type FromBaseInput = {
  baseQuantity: number;
  toUnit: ProductUnit;
  baseUnit: ProductUnit;
  packageUnit?: ProductUnit | null;
  baseQuantityPerPackage?: number | null;
  precision?: number | null;
};

export function convertToBaseQuantity(input: ToBaseInput) {
  const precision = input.precision ?? 3;
  if (input.fromUnit === input.baseUnit) return normalizeInventoryQuantity(input.quantity, precision);
  if (input.fromUnit === input.packageUnit) {
    const rate = requirePositiveRate(input.baseQuantityPerPackage);
    return normalizeInventoryQuantity(input.quantity * rate, precision);
  }
  throw new Error("不支持当前单位换算");
}

export function convertFromBaseQuantity(input: FromBaseInput) {
  const precision = input.precision ?? 3;
  if (input.toUnit === input.baseUnit) return normalizeInventoryQuantity(input.baseQuantity, precision);
  if (input.toUnit === input.packageUnit) {
    const rate = requirePositiveRate(input.baseQuantityPerPackage);
    return normalizeInventoryQuantity(input.baseQuantity / rate, precision);
  }
  throw new Error("不支持当前单位换算");
}

export function normalizeInventoryQuantity(value: number, precision = 3) {
  return Number(value.toFixed(precision));
}

function requirePositiveRate(value?: number | null) {
  if (!value || value <= 0) throw new Error("单位换算比例必须大于 0");
  return value;
}
