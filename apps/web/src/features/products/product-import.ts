import type { ProductCategory, ProductUnit } from "@mallbay/shared";
import * as XLSX from "xlsx";
import type { CreateProductPayload } from "./api";

type ProductImportRow = Record<string, unknown>;

export type ProductImportError = {
  rowNumber: number;
  message: string;
};

export type ProductImportResult = {
  products: CreateProductPayload[];
  errors: ProductImportError[];
};

const HEADER_ALIASES = {
  brand: ["品牌", "brand"],
  name: ["产品名称", "名称", "品名", "name"],
  model: ["型号", "规格型号", "model"],
  category: ["产品类别", "类别", "分类", "category"],
  specification: ["规格", "规格说明", "specification"],
  unit: ["单位", "主单位", "默认单位", "unit"],
  inventoryUnit: ["库存单位", "inventoryunit"],
  salesUnit: ["销售单位", "salesunit"],
  rollWidthMeters: ["卷宽", "卷宽(米)", "卷宽（米）", "rollwidthmeters"],
  rollLengthMeters: ["卷长", "卷长(米)", "卷长（米）", "rolllengthmeters"],
  metersPerRoll: ["每卷米数", "1卷米数", "metersperroll"],
  quantityPrecision: ["数量精度", "小数精度", "quantityprecision"],
  warrantyYears: ["质保年限", "质保年份", "warrantyyears"],
  basePriceYuan: ["基础价", "基础价(元)", "基础价（元）", "售价", "价格", "basepriceyuan"],
  basePriceCents: ["基础价(分)", "基础价（分）", "basepricecents"]
} as const;

export async function parseProductWorkbook(file: File, storeId: string): Promise<ProductImportResult> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { products: [], errors: [{ rowNumber: 0, message: "Excel 文件没有工作表" }] };
  }
  const rows = XLSX.utils.sheet_to_json<ProductImportRow>(workbook.Sheets[firstSheetName], { defval: "" });
  return parseProductRows(rows, storeId);
}

export function parseProductRows(rows: ProductImportRow[], storeId: string): ProductImportResult {
  const errors: ProductImportError[] = [];
  const products: CreateProductPayload[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const brand = getText(row, HEADER_ALIASES.brand);
    const name = getText(row, HEADER_ALIASES.name);
    const model = getText(row, HEADER_ALIASES.model);
    const basePriceCents = getBasePriceCents(row);

    if (!brand || !name || !model || basePriceCents === undefined) {
      errors.push({
        rowNumber,
        message: "品牌、产品名称、型号、基础价均为必填"
      });
      return;
    }

    products.push(removeUndefined({
      storeId,
      brand,
      name,
      model,
      category: parseCategory(getText(row, HEADER_ALIASES.category)),
      specification: getText(row, HEADER_ALIASES.specification),
      unit: parseUnit(getText(row, HEADER_ALIASES.unit)) ?? "ROLL",
      inventoryUnit: parseUnit(getText(row, HEADER_ALIASES.inventoryUnit)),
      salesUnit: parseUnit(getText(row, HEADER_ALIASES.salesUnit)),
      rollWidthMeters: getNumber(row, HEADER_ALIASES.rollWidthMeters),
      rollLengthMeters: getNumber(row, HEADER_ALIASES.rollLengthMeters),
      metersPerRoll: getNumber(row, HEADER_ALIASES.metersPerRoll),
      quantityPrecision: getNumber(row, HEADER_ALIASES.quantityPrecision),
      warrantyYears: getNumber(row, HEADER_ALIASES.warrantyYears),
      basePriceCents
    }));
  });

  return { products, errors };
}

function getBasePriceCents(row: ProductImportRow) {
  const cents = getNumber(row, HEADER_ALIASES.basePriceCents);
  if (cents !== undefined) return Math.round(cents);
  const yuan = getNumber(row, HEADER_ALIASES.basePriceYuan);
  return yuan === undefined ? undefined : Math.round(yuan * 100);
}

function getText(row: ProductImportRow, aliases: readonly string[]) {
  const value = getValue(row, aliases);
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function getNumber(row: ProductImportRow, aliases: readonly string[]) {
  const raw = getValue(row, aliases);
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
  const normalized = String(raw).replace(/[￥¥,\s]/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

function getValue(row: ProductImportRow, aliases: readonly string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeHeader(key))) return value;
  }
  return undefined;
}

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function parseCategory(value: string): ProductCategory {
  const normalized = normalizeOption(value);
  if (["ppf", "漆面保护膜", "隐形车衣", "车衣"].includes(normalized)) return "PPF";
  if (["colorfilm", "改色膜", "改色"].includes(normalized)) return "COLOR_FILM";
  if (["heatfilm", "隔热膜", "窗膜", "太阳膜"].includes(normalized)) return "HEAT_FILM";
  if (["modification", "改装"].includes(normalized)) return "MODIFICATION";
  return "OTHER";
}

function parseUnit(value: string): ProductUnit | undefined {
  const normalized = normalizeOption(value);
  if (["roll", "卷"].includes(normalized)) return "ROLL";
  if (["meter", "metre", "米", "m"].includes(normalized)) return "METER";
  if (["piece", "件", "片", "个"].includes(normalized)) return "PIECE";
  return undefined;
}

function normalizeOption(value: string) {
  return value.trim().replace(/[_\-\s]/g, "").toLowerCase();
}

function removeUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)) as T;
}
