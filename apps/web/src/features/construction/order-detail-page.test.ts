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
