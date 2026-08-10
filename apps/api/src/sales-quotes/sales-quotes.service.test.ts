import assert from "node:assert/strict";
import { test } from "node:test";
import { SalesQuotesService } from "./sales-quotes.service";
import { calculatePricing } from "../pricing/domain/pricing-engine";

const salesAccess = {
  can: async (actor: string, capability: string) => {
    if (capability === "finance") return actor.includes("finance") || actor.includes("manager");
    if (capability === "store") return actor.includes("manager") || actor.includes("admin");
    return true;
  },
  resolve: async () => ({ roles: [{ roleCode: "MANAGER" }] })
};

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
  const service = new SalesQuotesService(prisma as never, capacity as never, {} as never, undefined, undefined, salesAccess as never);
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
    { execute: async () => { created = true; return { id: "order-2" }; } } as never,
    undefined,
    undefined,
    salesAccess as never
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
  const service = new SalesQuotesService(prisma as never, {} as never, {} as never, undefined, undefined, salesAccess as never);
  const detail = await service.get({ id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: "SALES" } } as never, "quote-1", "store-1");
  assert.equal(detail.id, "quote-1");
  assert.deepEqual((detailQuery as { include: { customer: { select: Record<string, boolean> } } }).include.customer.select, { id: true, name: true });
});

test("销售读取本人报价时服务端不返回内部成本与毛利字段", async () => {
  const prisma = {
    salesQuote: {
      findFirst: async () => ({
        id: "quote-private", storeId: "store-1", salesPersonId: "sales-1", items: [], approvals: [],
        estimatedCostCents: 80000,
        estimatedMaterialCostCents: 45000,
        estimatedConstructionCostCents: 35000,
        estimatedTotalCostCents: 80000,
        estimatedMarginBps: 2500,
        costCompleteness: "TEMPORARY",
        temporaryCostCents: 80000,
        temporaryCostReason: "供应商报价单",
        pricingCalculation: {
          ruleSetVersion: 1,
          inputHash: "pricing-input-hash",
          outputSnapshot: { costEstimate: { estimatedTotalCostCents: 80000 } }
        }
      })
    }
  };
  const service = new SalesQuotesService(prisma as never, {} as never, {} as never, undefined, undefined, salesAccess as never);
  const detail = await service.get(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: "SALES" } } as never,
    "quote-private",
    "store-1"
  ) as Record<string, unknown>;

  for (const field of [
    "estimatedCostCents", "estimatedMaterialCostCents", "estimatedConstructionCostCents", "estimatedTotalCostCents",
    "estimatedMarginBps", "costCompleteness", "temporaryCostCents", "temporaryCostReason"
  ]) {
    assert.equal(field in detail, false, `${field} must be redacted for sales`);
  }
  assert.deepEqual((detail.pricingCalculation as Record<string, unknown>), { ruleSetVersion: 1, inputHash: "pricing-input-hash" });
});

test("报价产品明细由服务端全量导出，销售只能导出本人且不含内部成本", async () => {
  let exportQuery: Record<string, unknown> | undefined;
  const quote = {
    id: "quote-export-1", quoteNo: "SQ-001", status: "PENDING_APPROVAL", createdAt: new Date("2026-07-16T09:00:00.000Z"), validUntil: new Date("2026-07-17T09:00:00.000Z"),
    suggestedLaborCostCents: 1000, suggestedConstructionChargeCents: 1000, finalLaborCostCents: 1100, finalConstructionChargeCents: 1100, finalTotalCents: 11100,
    estimatedMaterialCostCents: 5000, estimatedConstructionCostCents: 1500, estimatedTotalCostCents: 6500, costCompleteness: "COMPLETE", temporaryCostCents: null, temporaryCostReason: null, estimatedMarginBps: 4000,
    customer: { name: "客户甲", companyName: null, contactPerson: null }, vehicle: { carPlate: "京A00001", carModel: "测试车型" },
    items: [{ productId: "product-1", productSnapshot: { brand: "品牌", name: "产品", model: "型号", specification: "规格" }, quantity: 1, salesUnit: "ROLL", suggestedUnitPriceCents: 10000, finalUnitPriceCents: 10000, finalAmountCents: 10000 }]
  };
  const prisma = { salesQuote: { findMany: async (query: Record<string, unknown>) => { exportQuery = query; return [quote]; } } };
  const service = new SalesQuotesService(prisma as never, {} as never, {} as never, undefined, undefined, salesAccess as never);
  const salesRows = await service.exportDetails({ id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: "SALES" } } as never, { storeId: "store-1", exportDimension: "product" });
  assert.equal((exportQuery as { where: { salesPersonId?: string } }).where.salesPersonId, "sales-1");
  assert.equal(salesRows.length, 1);
  assert.equal("estimatedTotalCostCents" in salesRows[0], false);

  const financeRows = await service.exportDetails({ id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: "FINANCE" } } as never, { storeId: "store-1", exportDimension: "date" });
  assert.equal(financeRows[0].estimatedTotalCostCents, 6500);
  assert.equal(financeRows[0].estimatedMarginBps, 4000);
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
  const service = new SalesQuotesService(prisma as never, capacity as never, {} as never, undefined, undefined, salesAccess as never);
  const submitted = await service.submit({ id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: "SALES" } } as never, "quote-1", { storeId: "store-1" });
  assert.equal((submitted as { status: string }).status, "PENDING_APPROVAL");
  assert.equal(held, true);
  assert.equal(approvalCreated, true);
});

test("临时成本报价即使价格正常也必须按毛利审批提交", async () => {
  const calculation = calculatePricing({
    ruleSetVersion: 2,
    constructionType: "PPF",
    constructionLocation: "IN_STORE",
    baseLaborCostCents: 0,
    lines: [{ id: "line-1", productId: "product-1", category: "PPF", brand: "3M", model: "PLUS", salesUnit: "METER", quantity: 1, baseUnitPriceCents: 100000 }]
  }, []);
  let approvalType: string | undefined;
  const quote = {
    id: "quote-temp",
    quoteNo: "SQTEMP",
    storeId: "store-1",
    salesPersonId: "manager-1",
    status: "DRAFT",
    costCompleteness: "TEMPORARY",
    temporaryCostCents: 40000,
    temporaryCostReason: "供应商最新批次报价",
    items: [{ id: "item-1", finalUnitPriceCents: 100000 }],
    finalLaborCostCents: 0,
    estimatedTotalCostCents: 40000,
    appointmentDate: null,
    pricingCalculation: {
      inputSnapshot: { constructionType: "PPF", constructionLocation: "IN_STORE" },
      outputSnapshot: { calculation, protectionPolicy: { normalDeviationBps: 500, approvalDeviationBps: 1500, minimumMarginBps: 0, softHoldHours: 24 } }
    }
  };
  const prisma = {
    salesQuote: { findFirst: async () => quote },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      salesQuote: { updateMany: async () => ({ count: 1 }), findUnique: async () => ({ ...quote, status: "PENDING_APPROVAL" }) },
      pricingApproval: { create: async ({ data }: { data: { approvalType: string } }) => { approvalType = data.approvalType; return { id: "approval-temp" }; } }
    })
  };
  const service = new SalesQuotesService(prisma as never, { holdQuote: async () => undefined, releaseQuote: async () => undefined } as never, {} as never, undefined, undefined, salesAccess as never);
  await service.submit({ id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: "MANAGER" } } as never, "quote-temp", { storeId: "store-1" });
  assert.equal(approvalType, "MARGIN");
});
