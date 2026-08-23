import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { ReturnsWorkflow } from "./returns.service";

const user = { id: "u1" };

test("ReturnsWorkflow exposes one command execution seam for every write action", async () => {
  const workflow = new ReturnsWorkflow({} as never, {} as never, {} as never, {} as never) as any;
  const calls: string[] = [];
  const methods = [
    "createSales", "submitSales", "approveSales", "receiveSales", "approveInspection", "convertInspection",
    "submitCostVerification", "confirmCostVerification", "resubmitCostVerification", "refundSales", "cancelSales",
    "createPurchase", "submitPurchase", "approvePurchase", "outboundPurchase", "settlePurchase", "reverseSettlement", "cancelPurchase"
  ];
  for (const method of methods) workflow[method] = async () => { calls.push(method); return method; };

  const commands = [
    { action: "CREATE_SALES", user, dto: {} }, { action: "SUBMIT_SALES", user, id: "r", dto: {} },
    { action: "APPROVE_SALES", user, id: "r", dto: {} }, { action: "RECEIVE_SALES", user, id: "r", dto: {} },
    { action: "APPROVE_INSPECTION", user, id: "r", dto: {} }, { action: "CONVERT_INSPECTION", user, id: "r", dto: {} },
    { action: "SUBMIT_COST_VERIFICATION", user, id: "r", dto: {} }, { action: "CONFIRM_COST_VERIFICATION", user, id: "r", dto: {} },
    { action: "RESUBMIT_COST_VERIFICATION", user, id: "r", dto: {} }, { action: "REFUND_SALES", user, id: "r", dto: {} },
    { action: "CANCEL_SALES", user, id: "r", dto: {} }, { action: "CREATE_PURCHASE", user, dto: {} },
    { action: "SUBMIT_PURCHASE", user, id: "r", dto: {} }, { action: "APPROVE_PURCHASE", user, id: "r", dto: {} },
    { action: "OUTBOUND_PURCHASE", user, id: "r", detailId: "d", quantity: 1, dto: {} },
    { action: "SETTLE_PURCHASE", user, id: "r", dto: {} }, { action: "REVERSE_SETTLEMENT", user, id: "r", adjustmentId: "a", dto: {} },
    { action: "CANCEL_PURCHASE", user, id: "r", dto: {} },
  ];

  for (const command of commands) await workflow.execute(command);
  assert.deepEqual(calls, methods);
});

test("Returns command routes and consistency contracts are centralized", () => {
  const sourceRoot = path.resolve(__dirname);
  const controller = readFileSync(path.join(sourceRoot, "returns.controller.ts"), "utf8");
  const workflow = readFileSync(path.join(sourceRoot, "returns.service.ts"), "utf8");

  assert.equal(controller.match(/this\.returns\.(create|submit|approve|receive|refund|cancel|settle|outbound|reverseSettlement|convertInspection|approveInspection|submitCostVerification|confirmCostVerification|resubmitCostVerification)\(/g), null);
  assert.match(controller, /this\.returns\.execute\(/);
  assert.match(workflow, /return this\.runTransaction\(async \(tx\) => \{[\s\S]*tx\.salesReturnDetail\.createMany/);
  assert.match(workflow, /const requestSummary = .*details: dto\.details/);
  assert.match(workflow, /SALES_RETURN_REFUNDED/);
});
