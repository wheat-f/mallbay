import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("after-sales page records penalty money in yuan and submits cents to API", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /penaltyAmountYuan\?: number/);
  assert.match(pageSource, /name="penaltyAmountYuan"/);
  assert.match(pageSource, /处罚金额（元）/);
  assert.match(pageSource, /penaltyAmountCents: yuanToCents\(values\.penaltyAmountYuan\)/);
  assert.doesNotMatch(pageSource, /name="penaltyAmountCents"/);
  assert.doesNotMatch(pageSource, /处罚分/);
});

test("after-sales page creates after-sale requests by selecting an order", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /orderApi\.list\(\{/);
  assert.match(pageSource, /const orderOptions =/);
  assert.match(pageSource, /<Select[\s\S]*placeholder="选择订单"/);
  assert.match(pageSource, /options=\{orderOptions\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="订单 ID"/);
});

test("after-sales page assigns and judges by selecting after-sales and workers", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /constructionApi\.workers\(storeId!\)/);
  assert.match(pageSource, /getConstructionWorkerLabel/);
  assert.match(pageSource, /const afterSaleOptions =/);
  assert.match(pageSource, /const workerOptions =/);
  assert.match(pageSource, /mode="multiple"[\s\S]*options=\{workerOptions\}/);
  assert.match(pageSource, /name="penaltyWorkerUserId"[\s\S]*options=\{workerOptions\}/);
  assert.doesNotMatch(pageSource, /label: `\$\{worker\.userId\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="售后 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="施工人员 ID/);
  assert.doesNotMatch(pageSource, /<Input placeholder="处罚人员 ID"/);
});

test("after-sales page table uses business labels instead of technical id columns", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /getAfterSaleBusinessLabel/);
  assert.match(pageSource, /getAfterSaleOrderLabel/);
  assert.doesNotMatch(pageSource, /title: "售后 ID"/);
  assert.doesNotMatch(pageSource, /dataIndex: "orderId"/);
});

test("after-sales page follows the prototype work-order workspace layout", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /after-sales-filter-card/);
  assert.match(pageSource, /after-sales-workspace/);
  assert.match(pageSource, /after-sales-ticket-list/);
  assert.match(pageSource, /after-sales-process-panel/);
  assert.match(pageSource, /售后工单列表/);
  assert.match(pageSource, /售后工单处理/);
  assert.match(pageSource, /新建售后单/);
  assert.match(pageSource, /保存并派单/);
});

test("after-sales page uses mobile ticket cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /after-sales-ticket-mobile-cards/);
  assert.match(pageSource, /after-sales-ticket-mobile-card/);
  assert.match(pageSource, /after-sales-ticket-desktop-table/);
  assert.match(cssSource, /\.after-sales-ticket-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.after-sales-ticket-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.after-sales-ticket-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("after-sales page exposes inline responsibility and penalty handling", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /责任判定/);
  assert.match(pageSource, /施工处罚设定/);
  assert.match(pageSource, /处理方案说明/);
  assert.match(pageSource, /selectedAfterSaleId/);
  assert.match(pageSource, /afterSalesActionForm/);
  assert.doesNotMatch(pageSource, /operation-action-grid/);
});

test("after-sales list links work orders to the prototype detail and penalty page", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /useRouter/);
  assert.equal(pageSource.includes("router.push(`/after-sales/${row.id}`)"), true);
  assert.match(pageSource, /查看详情/);
});

test("after-sales detail page follows the prototype detail penalty layout", () => {
  const detailPath = "app/after-sales/[id]/page.tsx";

  assert.equal(existsSync(detailPath), true);

  const pageSource = readFileSync(detailPath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /afterSalesApi\.list/);
  assert.match(pageSource, /售后工单详情与责任判罚/);
  assert.match(pageSource, /原订单摘要/);
  assert.match(pageSource, /问题描述与取证/);
  assert.match(pageSource, /售后处理对比/);
  assert.match(pageSource, /责任判定/);
  assert.match(pageSource, /惩罚处理/);
  assert.match(pageSource, /处理日志/);
  assert.match(pageSource, /确认判罚并归档/);
  assert.match(pageSource, /getAfterSaleDetailTimeline/);
  assert.match(pageSource, /after-sale-detail-page/);
  assert.match(pageSource, /after-sale-detail-grid/);
  assert.match(pageSource, /after-sale-evidence-grid/);
  assert.match(pageSource, /after-sale-penalty-panel/);

  assert.match(cssSource, /\.after-sale-detail-page/);
  assert.match(cssSource, /\.after-sale-detail-grid/);
  assert.match(cssSource, /\.after-sale-evidence-grid/);
  assert.match(cssSource, /\.after-sale-penalty-panel/);
  assert.match(cssSource, /\.after-sale-detail-timeline/);
});

test("after-sales mobile task center follows the worker prototype", () => {
  const pagePath = "app/after-sales/tasks/page.tsx";

  assert.equal(existsSync(pagePath), true);

  const pageSource = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /售后任务中心/);
  assert.match(pageSource, /afterSalesApi\.list/);
  assert.match(pageSource, /after-sales-mobile-shell/);
  assert.match(pageSource, /after-sales-mobile-hero/);
  assert.match(pageSource, /after-sales-mobile-tabs/);
  assert.match(pageSource, /after-sales-mobile-card/);
  assert.match(pageSource, /after-sales-mobile-bottom-nav/);
  assert.match(pageSource, /待处理/);
  assert.match(pageSource, /处理中/);
  assert.match(pageSource, /已完成/);
  assert.match(pageSource, /立即处理/);
  assert.match(pageSource, /getAfterSaleOrderLabel/);
  assert.match(cssSource, /\.after-sales-mobile-shell/);
  assert.match(cssSource, /\.after-sales-mobile-hero/);
  assert.match(cssSource, /\.after-sales-mobile-card/);
  assert.match(cssSource, /\.after-sales-mobile-bottom-nav/);
});
