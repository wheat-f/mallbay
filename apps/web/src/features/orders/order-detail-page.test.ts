import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("order detail audit events render actor business labels", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /getAuditActorLabel/);
  assert.doesNotMatch(pageSource, /操作人：\$\{event\.actorId\}/);
});

test("order detail renders suggested and final labor cost with adjustment reason", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /建议人工费/);
  assert.match(pageSource, /最终人工费/);
  assert.match(pageSource, /人工费调整原因/);
  assert.match(pageSource, /suggestedLaborCostCents/);
  assert.match(pageSource, /laborCostAdjustmentReason/);
});

test("order detail exposes pending dispatch confirmation and fulfillment links", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /shouldShowFulfillmentConfirmation/);
  assert.match(pageSource, /确认提交派工与库房匹配/);
  assert.match(pageSource, /进入库房匹配/);
  assert.match(pageSource, /router\.push\("\/inventory"\)/);
  assert.match(pageSource, /进入施工派工/);
  assert.match(pageSource, /router\.push\("\/construction\/assignments"\)/);
});
