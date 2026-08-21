import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ConstructionCostSettlementService, assertConfirmLines, assertManualConstructionChargeAllocation, assertVarianceReasons, buildCostException, isAbnormal, isMaterialReceiptCostAdjustment, summarizeActualMaterialCost } from "./construction-cost-settlement.service";
import { InventoryMovementType } from "@prisma/client";

const costAccess = {
  can: async (actor: { userId: string }, capability: string) => ["finance", "finance.cost"].includes(capability) ? actor.userId.includes("finance") || actor.userId.includes("admin") : true,
  resolve: async (actor: { userId: string }) => ({ roles: [{ roleCode: actor.userId.includes("finance") || actor.userId.includes("admin") ? "FINANCE" : "MANAGER" }] })
};

test("成本异常由申报偏差或预计材料成本缺失触发，不能进入批量确认", () => {
  assert.equal(isAbnormal({ estimatedMaterialCostCents: 100, workerLines: [{ standardMinutes: 120, declaredMinutes: 120 }] }), false);
  assert.equal(isAbnormal({ estimatedMaterialCostCents: 100, workerLines: [{ standardMinutes: 120, declaredMinutes: 130 }] }), true);
  assert.equal(isAbnormal({ estimatedMaterialCostCents: null, workerLines: [{ standardMinutes: 120, declaredMinutes: null }] }), true);
});

test("店长确认必须覆盖所有已派工人员且不能重复", () => {
  assert.doesNotThrow(() => assertConfirmLines([{ workerUserId: "w1" }, { workerUserId: "w2" }], [{ workerUserId: "w1" }, { workerUserId: "w2" }]));
  assert.throws(() => assertConfirmLines([{ workerUserId: "w1" }, { workerUserId: "w2" }], [{ workerUserId: "w1" }]), BadRequestException);
  assert.throws(() => assertConfirmLines([{ workerUserId: "w1" }, { workerUserId: "w2" }], [{ workerUserId: "w1" }, { workerUserId: "w1" }]), BadRequestException);
});

test("确认工时偏离标准时必须选择系统偏差原因", () => {
  const existing = [{ workerUserId: "w1", standardMinutes: 120 }];
  assert.throws(() => assertVarianceReasons(existing, [{ workerUserId: "w1", confirmedMinutes: 100 }]), BadRequestException);
  assert.doesNotThrow(() => assertVarianceReasons(existing, [{ workerUserId: "w1", confirmedMinutes: 100, varianceReasonCode: "VEHICLE_CONDITION" }]));
  assert.doesNotThrow(() => assertVarianceReasons(existing, [{ workerUserId: "w1", confirmedMinutes: 120 }]));
});

test("店长手工分摊施工收费必须覆盖全员且合计与订单施工收费一致", () => {
  assert.doesNotThrow(() => assertManualConstructionChargeAllocation([{ manualConstructionChargeCents: 10000 }, { manualConstructionChargeCents: 8000 }], 18000));
  assert.throws(() => assertManualConstructionChargeAllocation([{ manualConstructionChargeCents: 18000 }, {}], 18000), BadRequestException);
  assert.throws(() => assertManualConstructionChargeAllocation([{ manualConstructionChargeCents: 9000 }, { manualConstructionChargeCents: 8000 }], 18000), BadRequestException);
});

test("实际毛利低于底线或实际总成本超过预计时形成成本异常", () => {
  assert.deepEqual(buildCostException({ estimatedMaterialCostCents: 100, estimatedConstructionCostCents: 200 }, 320, 3000, { minimumMarginBps: 2000 }), {
    exceptionType: "ACTUAL_COST_OVER_ESTIMATE", expectedCents: 300, actualCents: 320, varianceCents: 20
  });
  assert.deepEqual(buildCostException({ estimatedMaterialCostCents: 100, estimatedConstructionCostCents: 200 }, 320, 1000, { minimumMarginBps: 2000 }), {
    exceptionType: "ACTUAL_MARGIN_BELOW_THRESHOLD", expectedCents: 2000, actualCents: 1000, varianceCents: -1000
  });
});

test("实际材料成本按订单出库和施工损耗的批次单位成本逐行冻结", () => {
  const result = summarizeActualMaterialCost([
    { id: "out-1", batchId: "batch-a", productId: "product-a", movementType: InventoryMovementType.ORDER_OUT, quantity: 2, batch: { unitCostCents: 1250 } },
    { id: "loss-1", batchId: "batch-b", productId: "product-a", movementType: InventoryMovementType.DAMAGE_OUT, quantity: 0.5, batch: { unitCostCents: 2400 } }
  ]);
  assert.equal(result.totalCents, 3700);
  assert.deepEqual(result.lines.map((line) => line.costCents), [2500, 1200]);
  assert.equal(result.hasMissingCost, false);
});

test("未补录实际入库价的出库批次不能被静默计为零成本", () => {
  const result = summarizeActualMaterialCost([
    { id: "out-1", batchId: "batch-pending", productId: "product-a", movementType: InventoryMovementType.ORDER_OUT, quantity: 1, batch: { unitCostCents: null } }
  ]);
  assert.equal(result.totalCents, 0);
  assert.equal(result.hasMissingCost, true);
  assert.deepEqual(result.missingBatchIds, ["batch-pending"]);
  assert.equal(isMaterialReceiptCostAdjustment("MATERIAL_RECEIPT_COST_DIFFERENCE"), true);
  assert.equal(isMaterialReceiptCostAdjustment("MANUAL_COST"), false);
});

test("成本调整审批仅财务或系统审核员可执行，店长不能代替财务", async () => {
  const adjustment = { id: "adjustment-1", status: "PENDING", settlement: { storeId: "store-1" } };
  const updated: Array<{ status: string }> = [];
  const auditEvents: unknown[] = [];
  const prisma = {
    constructionCostAdjustment: {
      findUnique: async () => adjustment,
      updateMany: async ({ data }: { data: { status: string } }) => { updated.push(data); return { count: 1 }; }
    },
    auditEvent: { create: async ({ data }: { data: unknown }) => { auditEvents.push(data); return {}; } },
    $transaction: async <T>(work: (tx: typeof prisma) => Promise<T>) => work(prisma)
  };
  const service = new ConstructionCostSettlementService(prisma as never, undefined, undefined, costAccess as never);
  const manager = { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: "MANAGER" } };
  const finance = { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: "FINANCE" } };

  await assert.rejects(() => service.approveAdjustment(manager, adjustment.id, { status: "APPROVED" } as never), ForbiddenException);
  await service.approveAdjustment(finance, adjustment.id, { status: "APPROVED" } as never);
  assert.equal(updated.length, 1);
  assert.equal(updated[0].status, "APPROVED");
  assert.equal(auditEvents.length, 1);
});

test("财务可发起确认后成本调整，同一幂等键重试时复用原调整单", async () => {
  const existing = { id: "adjustment-existing", settlementId: "settlement-1", idempotencyKey: "retry-key" };
  let createCalls = 0;
  const service = new ConstructionCostSettlementService({
    constructionCostSettlement: {
      findUnique: async () => ({ id: "settlement-1", storeId: "store-1", status: "CONFIRMED", workerLines: [], adjustments: [] })
    },
    constructionCostAdjustment: {
      findFirst: async () => existing,
      create: async () => { createCalls += 1; return { id: "unexpected" }; }
    }
  } as never, undefined, undefined, costAccess as never);
  const finance = { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: "FINANCE" } };

  const result = await service.createAdjustment(finance, "settlement-1", {
    idempotencyKey: "retry-key",
    adjustmentType: "MANUAL_COST",
    amountCents: 100,
    reasonCode: "OTHER"
  });

  assert.equal(result.id, existing.id);
  assert.equal(createCalls, 0);
});

test("店长确认成本时不返回个人岗位成本、提成和补贴，财务仍能看到明细", async () => {
  const service = new ConstructionCostSettlementService({} as never, undefined, undefined, costAccess as never);
  const settlement = {
    storeId: "store-1",
    workerLines: [{ workerUserId: "worker-1", standardMinutes: 60, confirmedMinutes: 60, hourlyCostCentsSnapshot: 10000, baseCostCents: 10000, commissionCents: 1200, allowanceCents: 500 }]
  };
  const manager = { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: "MANAGER" } };
  const finance = { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: "FINANCE" } };
  const present = service as never as { presentSettlement: (user: unknown, record: typeof settlement) => Promise<{ workerLines: Array<Record<string, unknown>> }> };
  const managerView = await present.presentSettlement(manager, settlement);
  const financeView = await present.presentSettlement(finance, settlement);
  assert.equal("hourlyCostCentsSnapshot" in managerView.workerLines[0], false);
  assert.equal("commissionCents" in managerView.workerLines[0], false);
  assert.equal(financeView.workerLines[0].hourlyCostCentsSnapshot, 10000);
  assert.equal(financeView.workerLines[0].commissionCents, 1200);
});
