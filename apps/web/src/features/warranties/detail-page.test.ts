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
