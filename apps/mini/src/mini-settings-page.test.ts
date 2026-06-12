import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("settings page exposes wechat mini login action", () => {
  const jsSource = readFileSync("pages/settings/index.js", "utf8");
  const wxmlSource = readFileSync("pages/settings/index.wxml", "utf8");

  assert.match(jsSource, /loginWithWechat/);
  assert.match(jsSource, /wx\.login/);
  assert.match(jsSource, /\/auth\/wechat-login/);
  assert.match(wxmlSource, /微信一键登录/);
  assert.match(wxmlSource, /bindtap="loginWithWechat"/);
});
