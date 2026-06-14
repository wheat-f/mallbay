import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("construction order detail page uses worker labels instead of uploader ids", () => {
  const pageSource = readFileSync("app/construction/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /getConstructionWorkerLabel/);
  assert.match(pageSource, /getConstructionPhotoStageLabel/);
  assert.match(pageSource, /getConstructionStatusLabel/);
  assert.match(pageSource, /getConstructionQualityResultLabel/);
  assert.match(pageSource, /record\?\.order\?\.orderNo/);
  assert.doesNotMatch(pageSource, /dataIndex: "stage"/);
  assert.doesNotMatch(pageSource, /dataIndex: "uploadedById"/);
  assert.doesNotMatch(pageSource, /<Tag>\{record\?\.status/);
  assert.doesNotMatch(pageSource, /<Tag>订单：\{params\.id\}<\/Tag>/);
  assert.doesNotMatch(pageSource, /<Tag>质检：\{record\?\.qualityResult/);
});

test("construction order detail page does not expose route ids as visible fallbacks", () => {
  const pageSource = readFileSync("app/construction/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /施工记录待生成/);
  assert.match(pageSource, /订单待派工/);
  assert.doesNotMatch(pageSource, /record\?\.order\?\.orderNo\s*\?\?\s*params\.id/);
  assert.doesNotMatch(pageSource, /<h1>\{[^}]*params\.id[^}]*\}<\/h1>/);
  assert.doesNotMatch(pageSource, /<strong>\{[^}]*params\.id[^}]*\}<\/strong>/);
});

test("construction order detail page follows the prototype quality workspace layout", () => {
  const pageSource = readFileSync("app/construction/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /construction-detail-shell/);
  assert.match(pageSource, /construction-detail-hero/);
  assert.match(pageSource, /construction-status-steps/);
  assert.match(pageSource, /construction-photo-board/);
  assert.match(pageSource, /construction-photo-stage-card/);
  assert.match(pageSource, /construction-quality-panel/);
  assert.match(pageSource, /construction-team-panel/);
  assert.doesNotMatch(pageSource, /StorePageHeader/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
  assert.doesNotMatch(pageSource, /<Table/);
});
