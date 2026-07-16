import assert from "node:assert/strict";
import { test } from "node:test";
import { SalesQuotesService } from "./sales-quotes.service";
import { calculatePricing } from "../pricing/domain/pricing-engine";

test("报价过期任务只把仍待审批的报价标记为过期并释放对应占位", async () => {
  const released: string[] = [];
  const statuses: string[] = [];
  const prisma = {
    salesQuote: {
      findMany: async () => [{ id: "quote-1" }, { id: "quote-2" }],
      updateMany: async ({ where }: { where: { id: string } }) => {
        statuses.push(where.id);
        return { count: where.id === "quote-1" ? 1 : 0 };
      }
    }
  };
  const capacity = { releaseQuote: async (id: string) => { released.push(id); return undefined; } };
  const service = new SalesQuotesService(prisma as never, capacity as never, {} as never);
  const result = await service.expirePending(new Date("2026-07-16T00:00:00.000Z"));
  assert.equal(result, 2);
  assert.deepEqual(statuses, ["quote-1", "quote-2"]);
  assert.deepEqual(released, ["quote-1"]);
});

test("报价重复转单返回既有订单而不是再次创建", async () => {
  const prisma = {
    salesQuote: {
      findFirst: async () => ({
        id: "quote-1",
        storeId: "store-1",
        salesPersonId: "user-1",
        status: "CONVERTED",
        convertedOrderId: "order-1",
        validUntil: new Date("2026-07-17T00:00:00.000Z"),
        items: [],
        capacityReservation: null
      })
    }
  };
  let created = false;
  const service = new SalesQuotesService(
    prisma as never,
    {} as never,
    { execute: async () => { created = true; return { id: "order-2" }; } } as never
  );
  const result = await service.convertToOrder({
    id: "user-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: "MANAGER" }
  } as never, "quote-1");
  assert.deepEqual(result, { orderId: "order-1", quoteId: "quote-1" });
  assert.equal(created, false);
});

test("报价详情按销售归属返回关联快照", async () => {
  let detailQuery: Record<string, unknown> | undefined;
  const prisma = {
    salesQuote: {
      findFirst: async (query: Record<string, unknown>) => {
        detailQuery = query;
        return { id: "quote-1", storeId: "store-1", salesPersonId: "sales-1", items: [], approvals: [] };
      }
    }
  };
  const service = new SalesQuotesService(prisma as never, {} as never, {} as never);
  const detail = await service.get({ id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: "SALES" } } as never, "quote-1", "store-1");
  assert.equal(detail.id, "quote-1");
  assert.deepEqual((detailQuery as { include: { customer: { select: Record<string, boolean> } } }).include.customer.select, { id: true, name: true });
});

test("草稿报价提交后创建审批并占用容量", async () => {
  const calculation = calculatePricing({
    ruleSetVersion: 2,
    constructionType: "PPF",
    constructionLocation: "IN_STORE",
    baseLaborCostCents: 10000,
    lines: [{ id: "line-1", productId: "product-1", category: "PPF", brand: "3M", model: "PLUS", salesUnit: "METER", quantity: 1, baseUnitPriceCents: 100000 }]
  }, []);
  let held = false;
  let approvalCreated = false;
  const quote = {
    id: "quote-1",
    quoteNo: "SQ1",
    storeId: "store-1",
    salesPersonId: "sales-1",
    status: "DRAFT",
    items: [{ id: "item-1", finalUnitPriceCents: 90000 }],
    finalLaborCostCents: 10000,
    estimatedCostCents: 50000,
    appointmentDate: null,
    pricingCalculation: {
      inputSnapshot: { constructionType: "PPF", constructionLocation: "IN_STORE" },
      outputSnapshot: { calculation, protectionPolicy: { normalDeviationBps: 500, approvalDeviationBps: 1500, minimumMarginBps: 0, softHoldHours: 24 } }
    }
  };
  const prisma = {
    salesQuote: { findFirst: async () => quote },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      salesQuote: {
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ ...quote, status: "PENDING_APPROVAL" })
      },
      pricingApproval: { create: async () => { approvalCreated = true; return { id: "approval-1" }; } }
    })
  };
  const capacity = {
    holdQuote: async () => { held = true; },
    releaseQuote: async () => undefined
  };
  const service = new SalesQuotesService(prisma as never, capacity as never, {} as never);
  const submitted = await service.submit({ id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: "SALES" } } as never, "quote-1", { storeId: "store-1" });
  assert.equal((submitted as { status: string }).status, "PENDING_APPROVAL");
  assert.equal(held, true);
  assert.equal(approvalCreated, true);
});
