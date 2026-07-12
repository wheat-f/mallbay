import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { InvoicePdfService } from "./invoice-pdf.service";

test("InvoicePdfService writes business invoice fields without technical ids", async () => {
  const previousLocalDir = process.env.INVOICE_PDF_LOCAL_DIR;
  const previousBaseUrl = process.env.INVOICE_PDF_PUBLIC_BASE_URL;
  const localDir = await mkdtemp(path.join(os.tmpdir(), "mallbay-invoices-"));
  process.env.INVOICE_PDF_LOCAL_DIR = localDir;
  process.env.INVOICE_PDF_PUBLIC_BASE_URL = "http://localhost:3001/local-oss";

  try {
    const service = new InvoicePdfService();
    const fileUrl = await service.generate(
      {
        id: "invoice-technical-id",
        title: "客户发票",
        taxNo: "TAX-1",
        amountCents: 12345,
        orderId: "order-technical-id",
        order: { orderNo: "ORD-202606-001" }
      },
      "INV-202606-001"
    );
    const pdfText = await readFile(path.join(localDir, "invoices", "INV-202606-001.pdf"), "utf8");

    assert.equal(fileUrl, "http://localhost:3001/local-oss/invoices/INV-202606-001.pdf");
    assert.match(pdfText, /Invoice No: INV-202606-001/);
    assert.match(pdfText, /Order No: ORD-202606-001/);
    assert.doesNotMatch(pdfText, /Invoice ID/);
    assert.doesNotMatch(pdfText, /Order ID/);
    assert.doesNotMatch(pdfText, /invoice-technical-id/);
    assert.doesNotMatch(pdfText, /order-technical-id/);
  } finally {
    if (previousLocalDir === undefined) {
      delete process.env.INVOICE_PDF_LOCAL_DIR;
    } else {
      process.env.INVOICE_PDF_LOCAL_DIR = previousLocalDir;
    }
    if (previousBaseUrl === undefined) {
      delete process.env.INVOICE_PDF_PUBLIC_BASE_URL;
    } else {
      process.env.INVOICE_PDF_PUBLIC_BASE_URL = previousBaseUrl;
    }
  }
});
