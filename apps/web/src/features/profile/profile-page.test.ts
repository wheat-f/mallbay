import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync("app/profile/page.tsx", "utf8");
const globalCss = readFileSync("app/globals.css", "utf8");

test("profile page follows the prototype account security workspace", () => {
  assert.match(pageSource, /profile-security-workspace/);
  assert.match(pageSource, /profile-security-summary/);
  assert.match(pageSource, /profile-security-grid/);
  assert.match(pageSource, /profile-security-status-card/);
  assert.match(pageSource, /profile-action-list/);
  assert.match(pageSource, /profile-account-timeline/);
  assert.match(pageSource, /profile-identity-card/);
  assert.match(pageSource, /profile-binding-panel/);
  assert.match(pageSource, /profile-avatar-panel/);
  assert.match(pageSource, /账号安全/);
  assert.doesNotMatch(pageSource, /返回上一页/);
  assert.doesNotMatch(pageSource, /router\.back\(\)/);
  assert.doesNotMatch(pageSource, /operation-panel profile-/);
  assert.match(globalCss, /\.profile-security-grid/);
  assert.match(globalCss, /\.profile-security-status-card/);
  assert.match(globalCss, /\.profile-account-timeline/);
});

test("profile edit interactions use prototype drawer instead of legacy modals", () => {
  assert.match(pageSource, /\bDrawer\b/);
  assert.match(pageSource, /profile-edit-drawer/);
  assert.match(pageSource, /ProfileEditDrawer/);
  assert.match(globalCss, /\.profile-edit-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(globalCss, /width:\s*min\(420px,\s*calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(pageSource, /\bModal\b/);
  assert.doesNotMatch(pageSource, /width=\{420\}/);
  assert.doesNotMatch(pageSource, /useEffect\(\(\)\s*=>\s*setVal/);
  assert.doesNotMatch(pageSource, /if\s*\(!open\)\s*setVal/);
  assert.doesNotMatch(pageSource, /if\s*\(!open\)\s*reset\(\)/);
});
