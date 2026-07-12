import { Injectable } from "@nestjs/common";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type InvoicePdfInput = {
  id: string;
  title: string;
  taxNo?: string | null;
  amountCents: number;
  orderId?: string | null;
  order?: { orderNo?: string | null } | null;
};

@Injectable()
export class InvoicePdfService {
  async generate(invoice: InvoicePdfInput, invoiceNo: string) {
    const safeInvoiceNo = sanitizeFileSegment(invoiceNo);
    const relativeKey = `invoices/${safeInvoiceNo}.pdf`;
    const rootDir = path.resolve(process.env.INVOICE_PDF_LOCAL_DIR ?? process.env.OSS_LOCAL_DIR ?? ".local/oss");
    const outputPath = path.join(rootDir, relativeKey);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, buildInvoicePdf(invoice, invoiceNo));

    const baseUrl = process.env.INVOICE_PDF_PUBLIC_BASE_URL ?? process.env.OSS_PUBLIC_BASE_URL ?? "http://localhost:3001/local-oss";
    return `${baseUrl.replace(/\/$/, "")}/${relativeKey}`;
  }
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) || "invoice";
}

function buildInvoicePdf(invoice: InvoicePdfInput, invoiceNo: string) {
  const lines = [
    "MallBay Invoice",
    `Invoice No: ${invoiceNo}`,
    `Order No: ${invoice.order?.orderNo ?? "-"}`,
    `Title: ${invoice.title}`,
    `Tax No: ${invoice.taxNo ?? "-"}`,
    `Amount: CNY ${(invoice.amountCents / 100).toFixed(2)}`
  ];
  const textCommands = lines
    .map((line, index) => `BT /F1 12 Tf 72 ${760 - index * 22} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");
  const stream = `${textCommands}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream`
  ];

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return body;
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
