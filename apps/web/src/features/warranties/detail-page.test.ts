import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("warranties page links warranty rows to the warranty detail page", () => {
  const pageSource = readFileSync("app/warranties/page.tsx", "utf8");

  assert.match(pageSource, /useRouter/);
  assert.match(pageSource, /router\.push\(`\/warranties\/\$\{row\.id\}`\)/);
  assert.match(pageSource, />\s*详情\s*<\/Button>/);
});

test("warranty detail page shows warranty core information and traceability entries", () => {
  const detailSource = readFileSync("app/warranties/[id]/page.tsx", "utf8");

  assert.match(detailSource, /warrantiesApi\.detail\(warrantyId\)/);
  assert.match(detailSource, /title="质保详情"/);
  assert.match(detailSource, /title="质保核心信息"/);
  assert.match(detailSource, /title="关联订单"/);
  assert.match(detailSource, /title="原材料溯源"/);
  assert.match(detailSource, /title="施工影像存证"/);
});

test("warranty detail page follows the prototype traceability workspace layout", () => {
  const detailSource = readFileSync("app/warranties/[id]/page.tsx", "utf8");

  assert.match(detailSource, /warranty-detail-hero/);
  assert.match(detailSource, /warranty-detail-summary/);
  assert.match(detailSource, /warranty-detail-workspace/);
  assert.match(detailSource, /warranty-core-card/);
  assert.match(detailSource, /warranty-order-card/);
  assert.match(detailSource, /warranty-trace-banner/);
  assert.match(detailSource, /warranty-photo-evidence/);
  assert.match(detailSource, /warranty-life-card/);
  assert.match(detailSource, /下载电子质保卡/);
  assert.doesNotMatch(detailSource, /detail-layout/);
});

test("warranty detail trace banner keeps action button readable on dark background", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");
  const buttonRule = cssSource.match(/\.warranty-trace-banner \.ant-btn\s*{[^}]*}/s)?.[0] ?? "";
  const buttonSpanRule = cssSource.match(/\.warranty-trace-banner \.ant-btn span\s*{[^}]*}/s)?.[0] ?? "";

  assert.match(buttonRule, /color: var\(--mb-primary\)/);
  assert.match(buttonRule, /font-weight: 800/);
  assert.match(buttonSpanRule, /color: var\(--mb-primary\)/);
});
