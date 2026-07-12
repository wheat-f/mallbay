import * as XLSX from "xlsx";

export type ExcelCellValue = string | number | boolean | Date | null | undefined;

export function exportRowsToExcel(
  fileName: string,
  sheetName: string,
  rows: Array<Record<string, ExcelCellValue>>
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
}
