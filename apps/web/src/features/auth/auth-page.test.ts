import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("auth page follows the prototype split-screen SaaS login layout", () => {
  const pageSource = readFileSync("app/auth/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /auth-prototype-shell/);
  assert.match(pageSource, /auth-hero-panel/);
  assert.match(pageSource, /aria-label="mallbay 平台介绍"/);
  assert.doesNotMatch(pageSource, /aria-label="MallBay 平台介绍"/);
  assert.match(pageSource, /auth-hero-media/);
  assert.match(pageSource, /auth-hero-overlay/);
  assert.match(pageSource, /auth-hero-content/);
  assert.match(pageSource, /auth-form-panel/);
  assert.match(pageSource, /auth-form-card/);
  assert.match(pageSource, /auth-mobile-brand/);
  assert.match(pageSource, /auth-mode-switch/);
  assert.match(pageSource, /auth-form-heading/);
  assert.match(pageSource, /auth-login-options/);
  assert.match(pageSource, /auth-disclaimer/);
  assert.match(pageSource, /auth-footer-links/);
  assert.match(pageSource, /欢迎回来/);
  assert.match(pageSource, /请输入您的凭据以访问管理后台/);
  assert.match(pageSource, /记住登录状态/);
  assert.match(pageSource, /忘记密码/);
  assert.match(pageSource, /重要提示/);

  assert.match(cssSource, /\.auth-prototype-shell/);
  assert.match(cssSource, /\.auth-hero-panel/);
  assert.match(cssSource, /\.auth-hero-media/);
  assert.match(cssSource, /\.auth-form-panel/);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*\.auth-hero-panel/);
});

test("auth page keeps encrypted credential submission behavior", () => {
  const pageSource = readFileSync("app/auth/page.tsx", "utf8");

  assert.match(pageSource, /authApi\.loginEncrypted\(\{ identifier: values\.identifier, password: values\.password \}\)/);
  assert.match(pageSource, /authApi\.registerEncrypted\(\{ username: values\.username, password: values\.password \}\)/);
  assert.match(pageSource, /setSession\(session\)/);
  assert.match(pageSource, /router\.push\("\/"\)/);
});
