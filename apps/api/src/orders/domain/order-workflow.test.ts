import assert from "node:assert/strict";
import { test } from "node:test";
import { ConstructionTaskStatus, OrderStatus, QualityCheckResult, WarrantyStatus } from "@prisma/client";
import { deriveOrderWorkflow } from "./order-workflow";

test("workflow exposes pending balance capabilities after quality pass", () => {
  const workflow = deriveOrderWorkflow({
    status: OrderStatus.COMPLETED,
    amount: { paidAmountCents: 5000, outstandingCents: 5000 },
    constructionRecord: { status: ConstructionTaskStatus.COMPLETED, qualityResult: QualityCheckResult.PASS },
    warranty: { status: WarrantyStatus.PENDING_ACTIVATION },
    inventoryAllocations: [{ status: "OUTBOUND" as never }]
  });

  assert.equal(workflow.currentStage, "PENDING_BALANCE");
  assert.equal(workflow.warrantyStatus, "PENDING_ACTIVATION");
  assert.equal(workflow.capabilities.canCollectBalance, true);
  assert.equal(workflow.capabilities.canCompleteOrder, false);
});

test("workflow marks final delivery only when quality and payment are complete", () => {
  const workflow = deriveOrderWorkflow({
    status: OrderStatus.COMPLETED,
    amount: { paidAmountCents: 10000, outstandingCents: 0 },
    constructionRecord: { status: ConstructionTaskStatus.COMPLETED, qualityResult: QualityCheckResult.PASS },
    warranty: { status: WarrantyStatus.ACTIVE },
    inventoryAllocations: [{ status: "OUTBOUND" as never }]
  });

  assert.equal(workflow.currentStage, "COMPLETED");
  assert.equal(workflow.paymentStatus, "PAID");
});

test("workflow makes paid, quality-passed orders without a warranty eligible for atomic final delivery", () => {
  const workflow = deriveOrderWorkflow({
    status: OrderStatus.IN_CONSTRUCTION,
    amount: { paidAmountCents: 10000, outstandingCents: 0 },
    constructionRecord: { status: ConstructionTaskStatus.COMPLETED, qualityResult: QualityCheckResult.PASS },
    warranty: null
  });

  assert.equal(workflow.currentStage, "PENDING_DELIVERY");
  assert.equal(workflow.capabilities.canCompleteOrder, true);
  assert.equal(workflow.capabilities.canGenerateWarranty, false);
});

