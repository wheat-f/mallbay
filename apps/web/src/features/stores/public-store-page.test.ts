import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("public store detail page uses the prototype public shell instead of the legacy dashboard header", () => {
  const pageSource = readFileSync("app/stores/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(pageSource, /dashboard-header/);
  assert.doesNotMatch(pageSource, /<Layout/);
  assert.doesNotMatch(pageSource, /Layout\.Content/);
  assert.doesNotMatch(pageSource, /Automotive SaaS|Gallery/);
  assert.match(pageSource, /门店运营系统/);
  assert.match(pageSource, /<span>mallbay<\/span>/);
  assert.doesNotMatch(pageSource, /<span>MallBay<\/span>/);
  assert.match(pageSource, /门店影像/);
  assert.match(pageSource, /公开状态/);
  assert.doesNotMatch(pageSource, /公开营业/);
  assert.match(pageSource, /认证服务门店/);
  assert.match(pageSource, /认证技师/);
  assert.match(pageSource, /工位/);
  assert.match(pageSource, /store-public-shell/);
  assert.match(pageSource, /store-public-hero/);
  assert.match(pageSource, /store-public-meta/);
  assert.match(pageSource, /store-public-cover/);
  assert.match(pageSource, /store-public-info-card/);
  assert.match(pageSource, /返回门店大厅/);
  assert.match(cssSource, /\.store-public-shell/);
  assert.match(cssSource, /\.store-public-hero/);
  assert.match(cssSource, /\.store-public-info-card/);
  assert.doesNotMatch(cssSource, /\.dashboard-header/);
});
