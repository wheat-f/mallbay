import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("commissions page uses business selectors instead of manual ids", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /orderApi\.list\(\{/);
  assert.match(pageSource, /constructionApi\.assignments\(\{/);
  assert.match(pageSource, /constructionApi\.workers\(storeId!\)/);
  assert.match(pageSource, /getCommissionRuleTypeLabel/);
  assert.match(pageSource, /getConstructionStatusLabel/);
  assert.match(pageSource, /getConstructionWorkerLabel/);
  assert.match(pageSource, /const commissionOrderOptions =/);
  assert.match(pageSource, /const constructionRecordOptions =/);
  assert.match(pageSource, /const workerOptions =/);
  assert.match(pageSource, /placeholder="选择销售提成订单"/);
  assert.match(pageSource, /options=\{commissionOrderOptions\}/);
  assert.match(pageSource, /placeholder="选择施工记录"/);
  assert.match(pageSource, /options=\{constructionRecordOptions\}/);
  assert.match(pageSource, /placeholder="选择调整人员"/);
  assert.match(pageSource, /options=\{workerOptions\}/);
  assert.match(pageSource, /订单未加载/);
  assert.doesNotMatch(pageSource, /dataIndex: "ruleType"/);
  assert.doesNotMatch(pageSource, /record\.status\]\.filter/);
  assert.doesNotMatch(pageSource, /order\.orderNo \?\? order\.id/);
  assert.doesNotMatch(pageSource, /record\.order\?\.orderNo \?\? record\.orderId/);
  assert.doesNotMatch(pageSource, /label: `\$\{worker\.userId\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="订单 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="施工记录 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="调整人员 ID"/);
});

test("commissions page exposes settlement source summary without fake settled records", () => {
  const pageSource = readFileSync("app/commissions/page.tsx", "utf8");

  assert.match(pageSource, /const settlementRows =/);
  assert.match(pageSource, /可结算订单/);
  assert.match(pageSource, /施工记录/);
  assert.match(pageSource, /提成规则/);
  assert.match(pageSource, /title="结算日志明细"/);
  assert.match(pageSource, /当前版本展示可结算来源，不伪造已结算流水/);
});
