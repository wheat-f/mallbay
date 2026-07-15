export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export type ExcelExportSheet = {
  sheetName: string;
  title?: string;
  subtitle?: string;
  rows: Array<Record<string, ExcelCellValue>>;
};

export type ExcelExportOptions = {
  creator?: string;
  generatedAt?: Date;
};

const HEADER_FILL = "1F4E78";
const TITLE_FILL = "17365D";
const STRIPE_FILL = "F3F7FB";
const BORDER_COLOR = "D9E2F3";

export async function exportRowsToExcel(
  fileName: string,
  sheetName: string,
  rows: Array<Record<string, ExcelCellValue>>,
  options: ExcelExportOptions & { title?: string; subtitle?: string } = {}
) {
  return exportWorkbookToExcel(
    fileName,
    [{ sheetName, title: options.title, subtitle: options.subtitle, rows }],
    options
  );
}

export async function exportWorkbookToExcel(
  fileName: string,
  sheets: ExcelExportSheet[],
  options: ExcelExportOptions = {}
) {
  if (sheets.length === 0) throw new Error("没有可导出的工作表");

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const generatedAt = options.generatedAt ?? new Date();
  workbook.creator = options.creator ?? "mallbay 门店运营系统";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  for (const [sheetIndex, exportSheet] of sheets.entries()) {
    const rows = exportSheet.rows.length > 0 ? exportSheet.rows : [{ 说明: "暂无数据" }];
    const headers = Object.keys(rows[0] ?? {});
    const worksheet = workbook.addWorksheet(normalizeSheetName(exportSheet.sheetName, sheetIndex), {
      properties: { defaultRowHeight: 20 },
      views: [{ state: "frozen", ySplit: 4, activeCell: "A5", showGridLines: false }]
    });
    worksheet.views = [{ state: "frozen", ySplit: 4, activeCell: "A5", showGridLines: false }];
    worksheet.pageSetup = {
      orientation: headers.length > 8 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
    };

    const lastColumn = Math.max(headers.length, 1);
    worksheet.mergeCells(1, 1, 1, lastColumn);
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = exportSheet.title ?? exportSheet.sheetName;
    titleCell.font = { name: "Microsoft YaHei", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${TITLE_FILL}` } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    worksheet.getRow(1).height = 34;

    worksheet.mergeCells(2, 1, 2, lastColumn);
    const metaCell = worksheet.getCell(2, 1);
    const generatedText = generatedAt.toLocaleString("zh-CN", { hour12: false });
    metaCell.value = [exportSheet.subtitle, `导出时间：${generatedText}`, `共 ${exportSheet.rows.length} 条`]
      .filter(Boolean)
      .join("  |  ");
    metaCell.font = { name: "Microsoft YaHei", size: 10, color: { argb: "FF5B6573" } };
    metaCell.alignment = { vertical: "middle", horizontal: "left" };
    worksheet.getRow(2).height = 22;
    worksheet.getRow(3).height = 8;

    const headerRow = worksheet.getRow(4);
    headerRow.values = headers;
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${HEADER_FILL}` } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "medium", color: { argb: `FF${TITLE_FILL}` } } };
    });

    rows.forEach((record, rowIndex) => {
      const row = worksheet.addRow(headers.map((header) => normalizeCellValue(record[header])));
      row.height = 22;
      row.eachCell((cell, columnNumber) => {
        const header = headers[columnNumber - 1] ?? "";
        cell.font = { name: "Microsoft YaHei", size: 10, color: { argb: "FF1F2937" } };
        cell.alignment = {
          vertical: "middle",
          horizontal: typeof cell.value === "number" ? "right" : "left",
          wrapText: shouldWrapColumn(header)
        };
        cell.border = { bottom: { style: "thin", color: { argb: `FF${BORDER_COLOR}` } } };
        if (rowIndex % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${STRIPE_FILL}` } };
        }
        if (typeof cell.value === "number") cell.numFmt = getNumberFormat(header, record);
        if (cell.value instanceof Date) cell.numFmt = "yyyy-mm-dd hh:mm";
      });
    });

    worksheet.columns.forEach((column, columnIndex) => {
      const header = headers[columnIndex] ?? "";
      const contentLengths = rows.map((row) => getDisplayWidth(row[header]));
      const preferredWidth = Math.max(getDisplayWidth(header) + 3, ...contentLengths.map((width) => width + 2), 10);
      column.width = Math.min(preferredWidth, shouldWrapColumn(header) ? 42 : 30);
    });
    worksheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4 + rows.length, column: lastColumn }
    };
    worksheet.headerFooter.oddFooter = "&Lmallbay 门店运营系统&C第 &P / &N 页&R&F";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  downloadBlob(blob, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}

function normalizeSheetName(sheetName: string, index: number) {
  const normalized = sheetName.replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 31);
  return normalized || `工作表${index + 1}`;
}

function normalizeCellValue(value: ExcelCellValue) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function shouldWrapColumn(header: string) {
  return /说明|备注|描述|范围|产品|车辆|订单|来源|地址|日志|方案|摘要|文件/.test(header);
}

function getNumberFormat(header: string, record: Record<string, ExcelCellValue>) {
  const unit = String(record["单位"] ?? "");
  if (header === "数值" && unit === "元") return '"¥"#,##0.00;[Red]-"¥"#,##0.00';
  if (header === "数值" && unit === "%") return "0.00%";
  if (header === "数值" && !unit) return "#,##0";
  if (/金额|总额|单价|费用|人工费|成本|收款|付款|提成|罚款|底薪|奖励|现金流|报销|返利|合计|小计/.test(header)) {
    return '"¥"#,##0.00;[Red]-"¥"#,##0.00';
  }
  if (/率|比例/.test(header)) return "0.00%";
  if (/订单数|关联订单|笔数|条数|次数|记录数|照片数量|容量|已预约|剩余|已完成|已开票|已作废|重新开票|发票数|返利数|售后单/.test(header)) return "#,##0";
  if (/数量|容量|订单数|笔数|条数|次数|库存|关联订单/.test(header)) return "#,##0.00";
  return "#,##0.00";
}

function getDisplayWidth(value: ExcelCellValue) {
  if (value === undefined || value === null) return 0;
  const text = value instanceof Date ? value.toLocaleString("zh-CN", { hour12: false }) : String(value);
  return Array.from(text).reduce((width, character) => width + (character.charCodeAt(0) > 255 ? 2 : 1), 0);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
