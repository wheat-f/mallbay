import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const detailPath = "app/admin/stores/[id]/page.tsx";

test("admin store detail page follows the prototype review detail workspace", () => {
  assert.equal(existsSync(detailPath), true);

  const pageSource = readFileSync(detailPath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /admin-store-detail-page/);
  assert.match(pageSource, /admin-store-detail-hero/);
  assert.match(pageSource, /admin-store-review-grid/);
  assert.match(pageSource, /admin-store-profile-card/);
  assert.match(pageSource, /admin-store-review-diff/);
  assert.match(pageSource, /admin-store-photo-review/);
  assert.match(pageSource, /admin-store-actions-rail/);
  assert.match(pageSource, /门店审核详情/);
  assert.match(pageSource, /当前门店资料/);
  assert.match(pageSource, /待审核提交/);
  assert.match(pageSource, /字段对比/);
  assert.match(pageSource, /照片变更/);
  assert.match(pageSource, /审核操作/);
  assert.match(pageSource, /操作风险提示/);
  assert.doesNotMatch(pageSource, /<Descriptions/);
  assert.doesNotMatch(pageSource, /className="section-card/);

  assert.match(cssSource, /\.admin-store-detail-page/);
  assert.match(cssSource, /\.admin-store-detail-hero/);
  assert.match(cssSource, /\.admin-store-review-grid/);
  assert.match(cssSource, /\.admin-store-profile-card/);
  assert.match(cssSource, /\.admin-store-review-diff/);
  assert.match(cssSource, /\.admin-store-photo-review/);
  assert.match(cssSource, /\.admin-store-actions-rail/);
});

test("admin store detail keeps existing review and manager operations", () => {
  const pageSource = readFileSync(detailPath, "utf8");

  assert.match(pageSource, /storeApi\.adminGetStore/);
  assert.match(pageSource, /storeApi\.reviewSubmission/);
  assert.match(pageSource, /storeApi\.freeze/);
  assert.match(pageSource, /storeApi\.unfreeze/);
  assert.match(pageSource, /storeApi\.changeManager/);
  assert.match(pageSource, /function RejectDrawer/);
  assert.match(pageSource, /function ChangeManagerDrawer/);
  assert.match(pageSource, /setRejectOpen\(true\)/);
  assert.match(pageSource, /setChangeManagerOpen\(true\)/);
});
