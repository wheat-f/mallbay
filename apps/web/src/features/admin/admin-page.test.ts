import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("admin page follows the prototype store review command center layout", () => {
  const pageSource = readFileSync("app/admin/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /admin-review-command-page/);
  assert.match(pageSource, /admin-review-hero/);
  assert.match(pageSource, /admin-review-queue/);
  assert.match(pageSource, /admin-status-distribution/);
  assert.match(pageSource, /admin-operation-guide/);
  assert.match(pageSource, /admin-store-table-card/);
  assert.match(pageSource, /mallbay 门店审核与管理/);
  assert.match(pageSource, /审核队列/);
  assert.match(pageSource, /门店状态/);
  assert.doesNotMatch(pageSource, /Review Queue/);
  assert.doesNotMatch(pageSource, /Store Status/);
  assert.match(pageSource, /待处理信息变更/);
  assert.match(pageSource, /门店状态分布/);
  assert.match(pageSource, /本周处理审核量/);
  assert.match(pageSource, /操作指引/);
  assert.match(pageSource, /所有门店列表/);

  assert.match(cssSource, /\.admin-review-command-page/);
  assert.match(cssSource, /\.admin-review-hero/);
  assert.match(cssSource, /\.admin-review-queue/);
  assert.match(cssSource, /\.admin-status-distribution/);
  assert.match(cssSource, /\.admin-operation-guide/);
  assert.match(cssSource, /\.admin-store-table-card/);
});

test("admin page keeps existing store creation and review navigation behavior", () => {
  const pageSource = readFileSync("app/admin/page.tsx", "utf8");

  assert.match(pageSource, /storeApi\.adminList/);
  assert.match(pageSource, /CreateStoreDrawer/);
  assert.match(pageSource, /setCreateOpen\(true\)/);
  assert.match(pageSource, /router\.push\(`\/admin\/stores\/\$\{row\.id\}`\)/);
  assert.match(pageSource, /PENDING_REVIEW/);
});

test("admin store list switches from desktop table to mobile cards on small screens", () => {
  const pageSource = readFileSync("app/admin/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /admin-store-desktop-table/);
  assert.match(pageSource, /admin-store-mobile-cards/);
  assert.match(pageSource, /admin-store-mobile-card/);
  assert.match(pageSource, /admin-store-mobile-actions/);

  const desktopTableIndex = cssSource.indexOf(".admin-store-desktop-table");
  const mobileCardsIndex = cssSource.indexOf(".admin-store-mobile-cards");
  const storeListBreakpoint = cssSource.match(
    /@media \(max-width: (\d+)px\) \{\s*\.admin-store-table-card\.ant-card \.ant-card-body\s*\{[\s\S]*?\.admin-store-desktop-table\s*\{\s*display: none;\s*\}\s*\.admin-store-mobile-cards\s*\{\s*display: grid;/
  );
  const mediaDesktopIndex = cssSource.indexOf(".admin-store-desktop-table", desktopTableIndex + 1);
  const mediaCardsIndex = cssSource.indexOf(".admin-store-mobile-cards", mobileCardsIndex + 1);

  assert.notEqual(desktopTableIndex, -1);
  assert.notEqual(mobileCardsIndex, -1);
  assert.equal(storeListBreakpoint?.[1], "900");
  assert.notEqual(mediaDesktopIndex, -1);
  assert.notEqual(mediaCardsIndex, -1);
  assert.ok(mobileCardsIndex < mediaCardsIndex);
  assert.ok(desktopTableIndex < mediaDesktopIndex);
});

test("admin store creation guards manager selection with business-safe copy", () => {
  const pageSource = readFileSync("app/admin/page.tsx", "utf8");

  assert.match(pageSource, /请先选择店长/);
  assert.doesNotMatch(pageSource, /managerId: selectedUser!\.id/);
});
