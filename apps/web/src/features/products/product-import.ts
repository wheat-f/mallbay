import type { ProductCategory, ProductUnit } from "@mallbay/shared";
import * as XLSX from "xlsx";
import type { CreateProductPayload } from "./api";

type ProductImportRow = Record<string, unknown>;

export type ProductImportError = {
  rowNumber: number;
  message: string;
};

export type ProductImportPreviewRow = {
  rowNumber: number;
  product: CreateProductPayload;
};

export type ProductImportResult = {
  products: CreateProductPayload[];
  validRows: ProductImportPreviewRow[];
  errors: ProductImportError[];
};

export type ProductImportExecutionResult = {
  succeeded: number;
  failures: ProductImportError[];
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
  basePriceYuan: ["产品建议价", "产品建议价(元)", "产品建议价（元）", "基础价", "基础价(元)", "基础价（元）", "售价", "价格", "basepriceyuan"],
  basePriceCents: ["产品建议价(分)", "产品建议价（分）", "基础价(分)", "基础价（分）", "basepricecents"]
} as const;

export async function parseProductWorkbook(file: File, storeId: string): Promise<ProductImportResult> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { products: [], validRows: [], errors: [{ rowNumber: 0, message: "Excel 文件没有工作表" }] };
  }
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: "",
    blankrows: true
  });
  return parseProductMatrix(matrix, storeId);
}

export function parseProductMatrix(matrix: unknown[][], storeId: string): ProductImportResult {
  const headerIndex = matrix.findIndex(isProductHeaderRow);
  if (headerIndex < 0) {
    return {
      products: [],
      validRows: [],
      errors: [{ rowNumber: 0, message: "未找到产品表头，请确认文件包含品牌、产品名称、型号、单位和产品建议价列" }]
    };
  }

  const headers = matrix[headerIndex].map((cell) => String(cell ?? "").trim());
  const rows = matrix.slice(headerIndex + 1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  );
  return parseProductRows(rows, storeId, headerIndex + 2);
}

export function parseProductRows(
  rows: ProductImportRow[],
  storeId: string,
  firstDataRowNumber = 2
): ProductImportResult {
  const errors: ProductImportError[] = [];
  const validRows: ProductImportPreviewRow[] = [];

  rows.forEach((row, index) => {
    if (isEmptyRow(row)) return;
    const rowNumber = index + firstDataRowNumber;
    const brand = getText(row, HEADER_ALIASES.brand);
    const name = getText(row, HEADER_ALIASES.name);
    const model = getText(row, HEADER_ALIASES.model);
    const basePriceCents = getBasePriceCents(row);
    const unitText = getText(row, HEADER_ALIASES.unit);
    const inventoryUnitText = getText(row, HEADER_ALIASES.inventoryUnit);
    const salesUnitText = getText(row, HEADER_ALIASES.salesUnit);
    const unit = parseUnit(unitText);
    const inventoryUnit = parseUnit(inventoryUnitText);
    const salesUnit = parseUnit(salesUnitText);

    if (!brand || !name || !model || basePriceCents === undefined || !unit) {
      errors.push({
        rowNumber,
        message: "品牌、产品名称、型号、单位、产品建议价均为必填，单位支持卷、米、件"
      });
      return;
    }
    if ((inventoryUnitText && !inventoryUnit) || (salesUnitText && !salesUnit)) {
      errors.push({ rowNumber, message: "库存单位或销售单位无效，仅支持卷、米、件" });
      return;
    }
    if (basePriceCents < 0) {
      errors.push({ rowNumber, message: "产品建议价不能小于 0" });
      return;
    }

    const quantityPrecision = getNumber(row, HEADER_ALIASES.quantityPrecision);
    if (quantityPrecision !== undefined && (!Number.isInteger(quantityPrecision) || quantityPrecision < 0 || quantityPrecision > 6)) {
      errors.push({ rowNumber, message: "数量精度必须是 0 到 6 的整数" });
      return;
    }

    const product = removeUndefined({
      storeId,
      brand,
      name,
      model,
      category: parseCategory(getText(row, HEADER_ALIASES.category)),
      specification: getText(row, HEADER_ALIASES.specification),
      unit,
      inventoryUnit,
      salesUnit,
      rollWidthMeters: getNumber(row, HEADER_ALIASES.rollWidthMeters),
      rollLengthMeters: getNumber(row, HEADER_ALIASES.rollLengthMeters),
      metersPerRoll: getNumber(row, HEADER_ALIASES.metersPerRoll),
      quantityPrecision,
      warrantyYears: getNumber(row, HEADER_ALIASES.warrantyYears),
      basePriceCents
    });
    validRows.push({ rowNumber, product });
  });

  return { products: validRows.map((row) => row.product), validRows, errors };
}

export async function executeProductImport(
  rows: ProductImportPreviewRow[],
  createProduct: (product: CreateProductPayload) => Promise<unknown>
): Promise<ProductImportExecutionResult> {
  const failures: ProductImportError[] = [];
  let succeeded = 0;

  for (const row of rows) {
    try {
      await createProduct(row.product);
      succeeded += 1;
    } catch (error) {
      failures.push({
        rowNumber: row.rowNumber,
        message: error instanceof Error ? error.message : "产品创建失败"
      });
    }
  }

  return { succeeded, failures };
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

function isProductHeaderRow(cells: unknown[]) {
  const headers = new Set(cells.map((cell) => normalizeHeader(String(cell ?? ""))));
  const hasAlias = (aliases: readonly string[]) => aliases.some((alias) => headers.has(normalizeHeader(alias)));
  return hasAlias(HEADER_ALIASES.brand)
    && hasAlias(HEADER_ALIASES.name)
    && hasAlias(HEADER_ALIASES.model)
    && hasAlias(HEADER_ALIASES.unit)
    && (hasAlias(HEADER_ALIASES.basePriceYuan) || hasAlias(HEADER_ALIASES.basePriceCents));
}

function isEmptyRow(row: ProductImportRow) {
  return Object.values(row).every((value) => value === undefined || value === null || String(value).trim() === "");
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
