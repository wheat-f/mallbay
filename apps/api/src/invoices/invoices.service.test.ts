import assert from "node:assert/strict";
import { test } from "node:test";
import { ConstructionTaskStatus, CustomerType, InvoiceStatus, OrderStatus, StorePosition } from "@prisma/client";
import { InvoicesService } from "./invoices.service";

const invoiceAccess = {
  can: async (actor: { userId: string }, capability: string, action: string, context: { ownerId?: string }) => {
    const actorId = actor.userId;
    const managerOrFinance = actorId.includes("manager") || actorId.includes("finance") || actorId.includes("admin");
    if (capability === "finance" && action === "write") {
      return context.ownerId ? managerOrFinance || context.ownerId === actorId : managerOrFinance;
    }
    if (capability === "finance.document" && action === "read") {
      return managerOrFinance || context.ownerId === actorId;
    }
    return true;
  },
  scope: async (actor: { userId: string }, _capability: string, _action: string, _context: { ownerId?: string }) => ({
    allowed: true,
    global: false,
    storeIds: ["store-1"],
    ...(actor.userId.startsWith("sales") ? { ownerId: actor.userId } : {})
  })
};

test("InvoicesService applies and issues invoice for paid completed order", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findMany: async () => {
        const order = await prisma.order.findUnique();
        return [{ ...order, customerId: order.customerId ?? 'customer-1', orderNo: order.orderNo ?? 'TEST-ORDER', customer: { customerType: CustomerType.PERSONAL } }];
      },
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        salesPersonId: "sales-1",
        status: OrderStatus.COMPLETED,
        amount: { outstandingCents: 0, totalAmountCents: 100000 }
      })
    },
    invoice: {
      findMany: async () => [],
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
  const service = new InvoicesService(prisma as never, invoiceAccess as never);

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

test("InvoicesService accepts a paid order whose construction record is completed", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findMany: async () => [{ id: "order-construction-completed", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.DISPATCHED, orderNo: "TEST-ORDER", customerId: "customer-1", customer: { customerType: CustomerType.PERSONAL }, constructionRecord: { status: ConstructionTaskStatus.COMPLETED }, amount: { outstandingCents: 0, totalAmountCents: 100000 } }],
      findUnique: async () => ({
        id: "order-construction-completed",
        storeId: "store-1",
        salesPersonId: "sales-1",
        status: OrderStatus.DISPATCHED,
        constructionRecord: { status: ConstructionTaskStatus.COMPLETED },
        amount: { outstandingCents: 0, totalAmountCents: 100000 }
      })
    },
    invoice: {
      findMany: async () => [],
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "invoice-construction-completed", status: InvoiceStatus.APPLIED };
      }
    }
  };
  const service = new InvoicesService(prisma as never, invoiceAccess as never);

  await service.apply(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    { orderId: "order-construction-completed", title: "客户发票", taxNo: "TAX-1", amountCents: 100000 }
  );

  assert.equal(writes.length, 1);
});

test("InvoicesService rejects sales applying invoice for another sales person's order", async () => {
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: {
      findMany: async () => {
        const order = await prisma.order.findUnique();
        return [{ ...order, customerId: order.customerId ?? 'customer-1', orderNo: order.orderNo ?? 'TEST-ORDER', customer: { customerType: CustomerType.PERSONAL } }];
      },
      findUnique: async () => ({
        id: "order-2",
        storeId: "store-1",
        salesPersonId: "sales-2",
        status: OrderStatus.COMPLETED,
        amount: { outstandingCents: 0, totalAmountCents: 100000 }
      })
    },
    invoice: {
      findMany: async () => [],
      create: async () => {
        throw new Error("sales should not invoice another sales person's order");
      }
    }
  };
  const service = new InvoicesService(prisma as never, invoiceAccess as never);

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
      findMany: async () => [],
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
  const service = new InvoicesService(prisma as never, invoiceAccess as never);

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
      findMany: async () => [],
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
  const service = new InvoicesService(prisma as never, invoiceAccess as never);

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

test("InvoicesService list includes order status and amount summary for invoice filters", async () => {
  let findManyArgs: unknown;
  const prisma = {
    storeMember: { findUnique: async () => null },
    invoice: {
      findMany: async (args: unknown) => {
        findManyArgs = args;
        return [];
      }
    }
  };
  const service = new InvoicesService(prisma as never, invoiceAccess as never);

  await service.list(
    { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
    { storeId: "store-1" }
  );

  const serialized = JSON.stringify(findManyArgs);
  assert.match(serialized, /"status":true/);
  assert.match(serialized, /"amount":\{"select":\{"paidAmountCents":true,"outstandingCents":true\}\}/);
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
  const service = new InvoicesService(prisma as never, invoiceAccess as never);

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
  const service = new InvoicesService(prisma as never, invoiceAccess as never);

  await service.list(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    { storeId: "store-1" }
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    OR: [
      { order: { salesPersonId: "sales-1" } },
      { allocations: { some: { order: { salesPersonId: "sales-1" } } } }
    ]
  });
});

test("InvoicesService creates a company multi-order invoice with explicit allocations", async () => {
  let createArgs: any;
  let findManyArgs: any;
  const orders = [
    { id: "company-order-1", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.COMPLETED, orderNo: "C-001", customerId: "company-1", customer: { customerType: CustomerType.COMPANY }, constructionRecord: null, amount: { outstandingCents: 0, totalAmountCents: 10000 } },
    { id: "company-order-2", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.WARRANTIED, orderNo: "C-002", customerId: "company-1", customer: { customerType: CustomerType.COMPANY }, constructionRecord: null, amount: { outstandingCents: 0, totalAmountCents: 20000 } }
  ];
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: { findMany: async () => orders },
    invoice: {
      findMany: async () => [],
      create: async (args: unknown) => { createArgs = args; return { id: "company-invoice-1", status: InvoiceStatus.APPLIED, allocations: [] }; }
    }
  };
  const service = new InvoicesService(prisma as never, invoiceAccess as never);
  await service.apply(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    {
      orderIds: ["company-order-1", "company-order-2"],
      allocations: [
        { orderId: "company-order-1", amountCents: 7000 },
        { orderId: "company-order-2", amountCents: 13000 }
      ],
      title: "企业客户发票",
      amountCents: 20000
    }
  );
  assert.equal(createArgs.data.customerId, "company-1");
  assert.equal(createArgs.data.orderId, "company-order-1");
  assert.deepEqual(createArgs.data.allocations.create, [
    { orderId: "company-order-1", amountCents: 7000 },
    { orderId: "company-order-2", amountCents: 13000 }
  ]);
});

test("InvoicesService rejects multi-order invoice for a personal customer", async () => {
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: { findMany: async () => [
      { id: "personal-order-1", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.COMPLETED, orderNo: "P-001", customerId: "personal-1", customer: { customerType: CustomerType.PERSONAL }, constructionRecord: null, amount: { outstandingCents: 0, totalAmountCents: 10000 } },
      { id: "personal-order-2", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.COMPLETED, orderNo: "P-002", customerId: "personal-1", customer: { customerType: CustomerType.PERSONAL }, constructionRecord: null, amount: { outstandingCents: 0, totalAmountCents: 10000 } }
    ] },
    invoice: { findMany: async () => [], create: async () => { throw new Error("should not create"); } }
  };
  const service = new InvoicesService(prisma as never, invoiceAccess as never);
  await assert.rejects(
    () => service.apply(
      { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
      { orderIds: ["personal-order-1", "personal-order-2"], title: "个人发票", amountCents: 20000 }
    ),
    /多订单合并开票仅适用于企业客户/
  );
});

test("InvoicesService ignores voided invoices when calculating remaining amount", async () => {
  let createArgs: any;
  let findManyArgs: any;
  const prisma = {
    storeMember: { findUnique: async () => null },
    order: { findMany: async () => [{ id: "voided-order", storeId: "store-1", salesPersonId: "sales-1", status: OrderStatus.COMPLETED, orderNo: "V-001", customerId: "company-1", customer: { customerType: CustomerType.COMPANY }, constructionRecord: null, amount: { outstandingCents: 0, totalAmountCents: 10000 } }] },
    invoice: {
      findMany: async (args: unknown) => { findManyArgs = args; return []; },
      create: async (args: unknown) => { createArgs = args; return { id: "invoice-after-void", status: InvoiceStatus.APPLIED, allocations: [] }; }
    }
  };
  const service = new InvoicesService(prisma as never, invoiceAccess as never);
  await service.apply(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    { orderId: "voided-order", title: "作废后重新申请", amountCents: 10000 }
  );
  assert.equal(createArgs.data.amountCents, 10000);
  assert.equal(findManyArgs.where.status.not, InvoiceStatus.VOIDED);
});




test("InvoicesService refuses to reissue an invoice that is not voided", async () => {
  const prisma = {
    invoice: { findUnique: async () => ({ id: "issued-invoice", status: InvoiceStatus.ISSUED }) }
  };
  const service = new InvoicesService(prisma as never, invoiceAccess as never);
  await assert.rejects(
    () => service.reissue(
      { id: "finance-1", isAuditor: true, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } },
      "issued-invoice",
      { invoiceNo: "INV-REISSUE" }
    ),
    /仅作废发票可以重新开具/
  );
});



