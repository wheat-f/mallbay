import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("public store lobby uses the prototype public shell instead of the legacy home layout", () => {
  const pageSource = readFileSync("app/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const layoutSource = readFileSync("app/layout.tsx", "utf8");

  assert.doesNotMatch(pageSource, /<Layout/);
  assert.doesNotMatch(pageSource, /Layout\.Content/);
  assert.doesNotMatch(pageSource, /home-shell/);
  assert.doesNotMatch(pageSource, /text-slate/);
  assert.doesNotMatch(pageSource, /Automotive SaaS|Public Stores/);
  assert.match(pageSource, /门店运营系统/);
  assert.match(pageSource, /<span>mallbay<\/span>/);
  assert.doesNotMatch(pageSource, /<span>MallBay<\/span>/);
  assert.match(pageSource, /认证服务门店/);
  assert.match(pageSource, /认证技师/);
  assert.match(pageSource, /工位/);
  assert.match(pageSource, /store-lobby-card-meta/);
  assert.doesNotMatch(pageSource, /<h2>公开门店<\/h2>/);
  assert.match(pageSource, /home-lobby-shell/);
  assert.match(pageSource, /home-lobby-hero/);
  assert.match(pageSource, /home-lobby-toolbar/);
  assert.match(pageSource, /store-lobby-card/);
  assert.match(cssSource, /\.home-lobby-shell/);
  assert.match(cssSource, /\.home-lobby-hero/);
  assert.match(cssSource, /\.store-lobby-card/);
  assert.match(cssSource, /\.store-lobby-card-meta/);
  assert.doesNotMatch(cssSource, /\.home-shell|\.home-header|\.home-content|\.store-card/);
  assert.match(layoutSource, /title:\s*"mallbay"/);
  assert.match(layoutSource, /description:\s*"漆面保护膜门店运营系统"/);
  assert.doesNotMatch(layoutSource, /title:\s*"MallBay"/);
  assert.doesNotMatch(layoutSource, /Store SaaS operating system/);
});
