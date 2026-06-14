import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("public store detail page uses the prototype public shell instead of the legacy dashboard header", () => {
  const pageSource = readFileSync("app/stores/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(pageSource, /dashboard-header/);
  assert.doesNotMatch(pageSource, /<Layout/);
  assert.doesNotMatch(pageSource, /Layout\.Content/);
  assert.match(pageSource, /store-public-shell/);
  assert.match(pageSource, /store-public-hero/);
  assert.match(pageSource, /store-public-cover/);
  assert.match(pageSource, /store-public-info-card/);
  assert.match(pageSource, /返回门店大厅/);
  assert.match(cssSource, /\.store-public-shell/);
  assert.match(cssSource, /\.store-public-hero/);
  assert.match(cssSource, /\.store-public-info-card/);
  assert.doesNotMatch(cssSource, /\.dashboard-header/);
});
