import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("warranties page links warranty rows to the warranty detail page", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /useRouter/);
  assert.match(pageSource, /router\.push\(`\/warranties\/\$\{row\.id\}`\)/);
  assert.match(pageSource, />\s*查看电子质保\s*<\/Button>/);
});

test("warranty detail page shows warranty core information and traceability entries", () => {
  const detailSource = readFileSync("app/warranties/[id]/page.tsx", "utf8");

  assert.match(detailSource, /warrantiesApi\.detail\(warrantyId\)/);
  assert.match(detailSource, /<h1>[\s\S]*质保详情/);
  assert.match(detailSource, /title="质保核心信息"/);
  assert.match(detailSource, /title="关联订单"/);
  assert.match(detailSource, /title="原材料溯源"/);
  assert.match(detailSource, /title="施工影像存证"/);
});

test("warranty detail page follows the prototype traceability workspace layout", () => {
  const detailSource = readFileSync("app/warranties/[id]/page.tsx", "utf8");

  assert.match(detailSource, /warranty-detail-hero/);
  assert.match(detailSource, /warranty-detail-summary/);
  assert.match(detailSource, /label: "手机号码"/);
  assert.match(detailSource, /联系方式待确认/);
  assert.doesNotMatch(detailSource, /138 \*\*\*\* 9928/);
  assert.match(detailSource, /label: "客户姓名"/);
  assert.match(detailSource, /label: "车牌号码"/);
  assert.match(detailSource, /label: "车辆型号"/);
  assert.doesNotMatch(detailSource, /label: "质保到期"/);
  assert.match(detailSource, /warranty-detail-workspace/);
  assert.match(detailSource, /warranty-core-card/);
  assert.match(detailSource, /warranty-order-card/);
  assert.match(detailSource, /warranty-trace-banner/);
  assert.match(detailSource, /warranty-photo-evidence/);
  assert.match(detailSource, /warranty-life-card/);
  assert.match(detailSource, /warranty-after-sales-card/);
  assert.match(detailSource, /该车辆使用的膜卷批次会随订单库存分配沉淀，并关联供应商、出库记录和施工留痕。/);
  assert.doesNotMatch(detailSource, /当前页面不伪造批次数据/);
  assert.match(detailSource, /返回质保列表/);
  assert.doesNotMatch(detailSource, /返回质保管理/);
  assert.match(detailSource, /<span>质保查询<\/span>/);
  assert.match(detailSource, /查看质保日志/);
  assert.match(detailSource, /isWarrantyLogOpen/);
  assert.match(detailSource, /setIsWarrantyLogOpen\(true\)/);
  assert.match(detailSource, /<Drawer/);
  assert.match(detailSource, /title="质保日志"/);
  assert.match(detailSource, /getWarrantyLogEntries/);
  assert.match(detailSource, /质保创建/);
  assert.match(detailSource, /材料与施工追溯/);
  assert.match(detailSource, /作废\/重开质保/);
  assert.match(detailSource, /下载电子质保卡/);
  assert.match(detailSource, /售后服务记录/);
  assert.match(detailSource, /发起售后申请/);
  assert.match(detailSource, /电子质保单系统自动生成/);
  assert.match(detailSource, /暂无售后记录/);
  assert.doesNotMatch(detailSource, /StorePageHeader/);
  assert.doesNotMatch(detailSource, /detail-layout/);
});

test("warranty detail page keeps a visible loading state inside the management shell", () => {
  const detailSource = readFileSync("app/warranties/[id]/page.tsx", "utf8");

  assert.match(detailSource, /Skeleton/);
  assert.match(detailSource, /warrantyQuery\.isLoading/);
  assert.match(detailSource, /<Skeleton active/);
});

test("warranty detail trace banner keeps action button readable on dark background", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");
  const buttonRule = cssSource.match(/\.warranty-trace-banner \.ant-btn\s*{[^}]*}/s)?.[0] ?? "";
  const buttonSpanRule = cssSource.match(/\.warranty-trace-banner \.ant-btn span\s*{[^}]*}/s)?.[0] ?? "";

  assert.match(buttonRule, /color: var\(--mb-primary\)/);
  assert.match(buttonRule, /font-weight: 800/);
  assert.match(buttonSpanRule, /color: var\(--mb-primary\)/);
});
