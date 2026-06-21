import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

function cssBlock(cssSource: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cssSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

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
  assert.doesNotMatch(pageSource, /order\.orderNo \?\? order\.id/);
  assert.match(pageSource, /order\.orderNo \?\? "未编号订单"/);
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
  assert.match(pageSource, /title: "售后单号"/);
  assert.doesNotMatch(pageSource, /title: "售后"/);
  assert.doesNotMatch(pageSource, /title: "售后 ID"/);
  assert.doesNotMatch(pageSource, /dataIndex: "orderId"/);
});

test("after-sales page follows the prototype work-order workspace layout", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");

  assert.match(pageSource, /after-sales-filter-card/);
  assert.match(pageSource, /质保单号 \/ 车牌号 \/ VIN \/ 客户电话/);
  assert.doesNotMatch(pageSource, /车牌号 \/ 客户电话 \/ 订单号 \/ 售后问题/);
  assert.match(pageSource, /after-sales-workspace/);
  assert.match(pageSource, /after-sales-ticket-list/);
  assert.match(pageSource, /after-sales-process-panel/);
  assert.match(pageSource, /售后工单列表/);
  assert.match(pageSource, /售后工单处理/);
  assert.match(pageSource, /新建售后单/);
  assert.match(pageSource, /保存并派单/);
  assert.match(pageSource, /\["处理中", afterSaleSummary\.assigned, "师傅处理中"\]/);
  assert.match(pageSource, /\["已完成", afterSaleSummary\.resolved, "已归档售后记录"\]/);
  assert.doesNotMatch(pageSource, /\["已派单", afterSaleSummary\.assigned/);
  assert.doesNotMatch(pageSource, /\["已解决", afterSaleSummary\.resolved/);
});

test("after-sales page exposes the prototype split filter fields", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /after-sales-prototype-filters/);
  assert.match(pageSource, /车架号 \(VIN\)/);
  assert.match(pageSource, /placeholder="输入VIN"/);
  assert.match(pageSource, /客户电话/);
  assert.match(pageSource, /placeholder="输入手机号"/);
  assert.match(pageSource, /质保单号/);
  assert.match(pageSource, /placeholder="输入质保单号"/);
  assert.match(pageSource, />重置</);
  assert.match(cssSource, /\.after-sales-prototype-filters/);
});

test("after-sales page uses mobile ticket cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/after-sales/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /after-sales-ticket-mobile-cards/);
  assert.match(pageSource, /after-sales-ticket-mobile-card/);
  assert.match(pageSource, /after-sales-ticket-desktop-table/);
  assert.match(cssSource, /\.after-sales-ticket-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{\n\s{2}\.after-sales-ticket-desktop-table \{\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.after-sales-ticket-mobile-cards \{\n\s{4}display: grid;/);
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
  assert.match(pageSource, /返回售后列表/);
  assert.doesNotMatch(pageSource, /返回售后管理/);
  assert.doesNotMatch(pageSource, /StorePageHeader/);
  assert.match(pageSource, /after-sale-detail-hero/);
  assert.match(pageSource, /after-sale-detail-actions/);
  assert.match(pageSource, /原订单摘要/);
  assert.doesNotMatch(pageSource, /工单ID: \$\{afterSale\.orderId\}/);
  assert.doesNotMatch(pageSource, /value=\{getAfterSaleOrderLabel\(afterSale\)\} hint=\{`工单ID:/);
  assert.match(pageSource, /问题描述与取证/);
  assert.match(pageSource, /售后处理对比/);
  assert.match(pageSource, /责任判定/);
  assert.match(pageSource, /惩罚处理/);
  assert.match(pageSource, /客户信息待确认/);
  assert.match(pageSource, /车辆信息待确认/);
  assert.doesNotMatch(pageSource, /客户未加载/);
  assert.doesNotMatch(pageSource, /车辆未加载/);
  assert.match(pageSource, /本月累计售后/);
  assert.match(pageSource, /工艺二次培训或降级处理/);
  assert.match(pageSource, /处罚金额在处理面板录入后自动沉淀到售后记录/);
  assert.doesNotMatch(pageSource, /处罚金额将在处理面板录入后自动沉淀到售后记录/);
  assert.doesNotMatch(pageSource, /摘要接口未返回/);
  assert.match(pageSource, /处理日志/);
  assert.match(pageSource, /确认判罚并归档/);
  assert.match(pageSource, /getAfterSaleDetailTimeline/);
  assert.match(pageSource, /after-sale-detail-page/);
  assert.match(pageSource, /after-sale-detail-grid/);
  assert.match(pageSource, /after-sale-evidence-grid/);
  assert.match(pageSource, /after-sale-penalty-panel/);

  assert.match(cssSource, /\.after-sale-detail-page/);
  assert.match(cssSource, /\.after-sale-detail-hero/);
  assert.match(cssSource, /\.after-sale-detail-actions/);
  assert.match(cssSource, /\.after-sale-detail-grid/);
  assert.match(cssSource, /\.after-sale-evidence-grid/);
  assert.match(cssSource, /\.after-sale-penalty-panel/);
  assert.match(cssSource, /\.after-sale-detail-timeline/);
});

test("after-sales task center is a web management task board", () => {
  const pagePath = "app/after-sales/tasks/page.tsx";

  assert.equal(existsSync(pagePath), true);

  const pageSource = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const nextConfigSource = readFileSync("next.config.ts", "utf8");

  assert.match(pageSource, /售后任务中心/);
  assert.match(pageSource, /StorePageHeader/);
  assert.match(pageSource, /from "next\/image"/);
  assert.match(pageSource, /unoptimized/);
  assert.match(pageSource, /afterSalesApi\.list/);
  assert.match(pageSource, /worker-after-sales-task-page/);
  assert.match(pageSource, /worker-after-sales-hero/);
  assert.match(pageSource, /worker-after-sales-kpis/);
  assert.match(pageSource, /worker-after-sales-tabs/);
  assert.match(pageSource, /worker-after-sales-table/);
  assert.match(pageSource, /worker-after-sales-mobile-cards/);
  assert.doesNotMatch(pageSource, /after-sales-mobile-shell/);
  assert.doesNotMatch(pageSource, /after-sales-mobile-bottom-nav/);
  assert.doesNotMatch(pageSource, /href="\/dashboard"/);
  assert.match(pageSource, /待处理/);
  assert.match(pageSource, /处理中/);
  assert.match(pageSource, /已完成/);
  assert.match(pageSource, /立即处理/);
  assert.match(pageSource, /href=\{`\/after-sales\/\$\{item\.id\}`\}/);
  assert.doesNotMatch(pageSource, /<Button href="\/after-sales">查看详情<\/Button>/);
  assert.doesNotMatch(pageSource, /href="\/after-sales"[\s\S]{0,120}立即处理/);
  assert.match(pageSource, /getAfterSaleOrderLabel/);
  assert.match(pageSource, /getAfterSalesTaskImage/);
  assert.match(pageSource, /description\.includes\("划痕"\)/);
  assert.match(pageSource, /item\.warrantyId \? "已关联质保单" : "质保单待关联"/);
  assert.doesNotMatch(pageSource, /`质保单：\$\{item\.warrantyId\}`/);
  assert.match(cssSource, /\.worker-after-sales-task-page/);
  assert.match(cssSource, /\.worker-after-sales-hero/);
  assert.match(cssSource, /\.worker-after-sales-kpis/);
  assert.match(cssSource, /\.worker-after-sales-tabs/);
  assert.match(cssSource, /\.worker-after-sales-table/);
  assert.match(cssSource, /\.worker-after-sales-mobile-cards/);
  assert.match(pageSource, /\/prototype-assets\/after-sales-task-1\.png/);
  assert.match(pageSource, /\/prototype-assets\/after-sales-task-2\.png/);
  assert.doesNotMatch(pageSource, /lh3\.googleusercontent\.com/);
  assert.doesNotMatch(nextConfigSource, /lh3\.googleusercontent\.com/);
});

test("after-sales mobile task header stays within the viewport", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");
  const shellBlock = cssBlock(cssSource, ".after-sales-mobile-shell");
  const headerBlock = cssBlock(cssSource, ".after-sales-mobile-header");

  assert.match(shellBlock, /overflow-x:\s*clip;/);
  assert.match(headerBlock, /width:\s*auto;/);
  assert.match(headerBlock, /max-width:\s*430px;/);
  assert.match(headerBlock, /margin:\s*0 auto 18px;/);
  assert.doesNotMatch(headerBlock, /calc\(100% \+ 28px\)/);
});
