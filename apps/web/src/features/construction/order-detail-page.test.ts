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

  assert.match(pageSource, /施工质检 & 提成审核/);
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

test("construction order detail keeps one upload entry inside each photo stage card", () => {
  const pageSource = readFileSync("app/construction/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /上传\{stage\.title\}/);
  assert.match(pageSource, /ConstructionPhotoStageGrid/);
  assert.doesNotMatch(pageSource, /name="url" label="施工照片链接"/);
  assert.doesNotMatch(pageSource, /粘贴施工照片链接/);
  assert.doesNotMatch(pageSource, /图片 URL/);
  assert.doesNotMatch(pageSource, /粘贴图片 URL/);
});

test("construction order detail uses business-safe upload fallback copy", () => {
  const pageSource = readFileSync("app/construction/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /施工记录待生成，暂不能上传照片/);
  assert.doesNotMatch(pageSource, /施工记录未加载/);
  assert.doesNotMatch(pageSource, /constructionApi\.uploadPhoto\(record!\.id/);
});

test("construction order detail uses business-safe quality fallback copy", () => {
  const pageSource = readFileSync("app/construction/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /施工记录待生成，暂不能保存质检结果/);
  assert.doesNotMatch(pageSource, /constructionApi\.qualityCheck\(record!\.id/);
});

test("construction order detail returns to the dispatch list instead of the workbench", () => {
  const pageSource = readFileSync("app/construction/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /返回施工派单/);
  assert.match(pageSource, /router\.push\("\/construction\/assignments"\)/);
  assert.doesNotMatch(pageSource, /返回工作台/);
});

test("construction order detail previews archived construction photos", () => {
  const pageSource = readFileSync("app/construction/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /const \[previewPhoto, setPreviewPhoto\]/);
  assert.match(pageSource, /<Modal/);
  assert.match(pageSource, /<Image src=\{previewPhoto\.url\}/);
  assert.match(pageSource, /onClick=\{\(\) => onPreview\(photo\)\}/);
  assert.match(pageSource, /stagePhotos\.map\(\(photo, index\)/);
  assert.doesNotMatch(pageSource, /stagePhotos\.slice/);
  assert.doesNotMatch(pageSource, /href=\{photo\.url\} target="_blank"/);
});

test("construction order detail loads the active workspace by workflow status", () => {
  const pageSource = readFileSync("app/construction/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /const workspace = getConstructionWorkspace\(record\)/);
  assert.match(pageSource, /workspace === "photos"/);
  assert.match(pageSource, /workspace === "quality"/);
  assert.match(pageSource, /if \(record\.qualityResult\) return "summary"/);
  assert.match(pageSource, /if \(record\.status === "COMPLETED"\) return "quality"/);
  assert.doesNotMatch(pageSource, /<aside className="construction-detail-side">[\s\S]*<Form form=\{qualityForm\}/);
});
