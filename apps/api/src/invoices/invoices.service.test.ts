import assert from "node:assert/strict";
import { test } from "node:test";
import { InvoiceStatus, OrderStatus, StorePosition } from "@prisma/client";
import { InvoicesService } from "./invoices.service";

test("InvoicesService applies and issues invoice for paid completed order", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        salesPersonId: "sales-1",
        status: OrderStatus.COMPLETED,
        amount: { outstandingCents: 0, totalAmountCents: 100000 }
      })
    },
    invoice: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "invoice-1", status: InvoiceStatus.APPLIED };
      },
      findUnique: async () => ({ id: "invoice-1", storeId: "store-1", orderId: "order-1" }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "invoice-1", status: InvoiceStatus.ISSUED, invoiceNo: "INV-1" };
      }
    },
    invoiceLog: { create: async (args: unknown) => writes.push(args) }
  };
  const service = new InvoicesService(prisma as never);

  await service.apply(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    { orderId: "order-1", title: "客户发票", taxNo: "TAX-1", amountCents: 100000 }
  );
  const issued = await service.issue(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    "invoice-1",
    { invoiceNo: "INV-1", fileUrl: "https://cdn.example.com/invoices/INV-1.pdf", note: "issued" }
  );

  assert.equal(issued.invoiceNo, "INV-1");
  assert.equal(JSON.stringify(writes).includes("https://cdn.example.com/invoices/INV-1.pdf"), true);
  assert.equal(JSON.stringify(writes).includes(InvoiceStatus.ISSUED), true);
});

test("InvoicesService rejects sales applying invoice for another sales person's order", async () => {
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findUnique: async () => ({
        id: "order-2",
        storeId: "store-1",
        salesPersonId: "sales-2",
        status: OrderStatus.COMPLETED,
        amount: { outstandingCents: 0, totalAmountCents: 100000 }
      })
    },
    invoice: {
      create: async () => {
        throw new Error("sales should not invoice another sales person's order");
      }
    }
  };
  const service = new InvoicesService(prisma as never);

  await assert.rejects(
    () => service.apply(
      { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
      { orderId: "order-2", title: "客户发票", taxNo: "TAX-2", amountCents: 100000 }
    ),
    /无权限/
  );
});

test("InvoicesService auto generates a local PDF URL when issuing without fileUrl", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    invoice: {
      findUnique: async () => ({
        id: "invoice-2",
        storeId: "store-1",
        orderId: "order-1",
        title: "客户发票",
        taxNo: "TAX-2",
        amountCents: 120000
      }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "invoice-2", status: InvoiceStatus.ISSUED, invoiceNo: "INV-2" };
      }
    },
    invoiceLog: { create: async (args: unknown) => writes.push(args) }
  };
  const service = new InvoicesService(prisma as never);

  await service.issue(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    "invoice-2",
    { invoiceNo: "INV-2", note: "issued" }
  );

  const serialized = JSON.stringify(writes);
  assert.match(serialized, /local-oss\/invoices\/INV-2\.pdf/);
});

test("InvoicesService records sending issued invoice without changing invoice status", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    invoice: {
      findUnique: async () => ({
        id: "invoice-3",
        storeId: "store-1",
        status: InvoiceStatus.ISSUED,
        fileUrl: "https://cdn.example.com/invoices/INV-3.pdf"
      })
    },
    invoiceLog: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "log-1" };
      }
    }
  };
  const service = new InvoicesService(prisma as never);

  const result = await service.send(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    "invoice-3",
    { recipient: "customer@example.com", channel: "EMAIL", note: "发送电子发票" }
  );

  assert.equal(result.id, "invoice-3");
  assert.equal(JSON.stringify(writes).includes("发票发送"), true);
  assert.equal(JSON.stringify(writes).includes("customer@example.com"), true);
  assert.equal(JSON.stringify(writes).includes(InvoiceStatus.ISSUED), true);
});

test("InvoicesService lists invoices with order customer and vehicle summary", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    invoice: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new InvoicesService(prisma as never);

  await service.list(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    { storeId: "store-1" }
  );

  const serialized = JSON.stringify(calls[0]);
  assert.match(serialized, /"order"/);
  assert.match(serialized, /"orderNo"/);
  assert.match(serialized, /"customer"/);
  assert.match(serialized, /"vehicle"/);
});

test("InvoicesService limits sales invoice list to their own orders", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    invoice: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new InvoicesService(prisma as never);

  await service.list(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    { storeId: "store-1" }
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    order: { salesPersonId: "sales-1" }
  });
});
