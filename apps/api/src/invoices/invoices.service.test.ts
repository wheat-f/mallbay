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
    { invoiceNo: "INV-1", note: "issued" }
  );

  assert.equal(issued.invoiceNo, "INV-1");
  assert.equal(JSON.stringify(writes).includes(InvoiceStatus.ISSUED), true);
});
