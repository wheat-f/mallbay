import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("app providers use prototype color tokens for Ant Design", () => {
  const source = readFileSync("src/providers/app-providers.tsx", "utf8");

  assert.match(source, /colorPrimary: "#0F3A5F"/);
  assert.match(source, /colorError: "#D71920"/);
  assert.match(source, /colorBgLayout: "#F6F8FB"/);
  assert.match(source, /borderRadius: 10/);
  assert.doesNotMatch(source, /colorPrimary: "#1677ff"/);
});

test("global css exposes MallBay prototype design tokens", () => {
  const source = readFileSync("app/globals.css", "utf8");

  assert.match(source, /--mb-primary: #0f3a5f/);
  assert.match(source, /--mb-surface-alt: #eef3f8/);
  assert.match(source, /--mb-radius-lg: 16px/);
  assert.match(source, /management-sidebar/);
  assert.match(source, /management-topbar/);
});

test("management shell wraps business routes and excludes public and mobile routes", () => {
  const source = readFileSync("src/features/workbench/management-shell.tsx", "utf8");

  assert.match(source, /shouldUseManagementShell/);
  assert.match(source, /management-mobile-nav/);
  assert.match(source, /mobileMenuItems/);
  assert.match(source, /key: "profile"/);
  assert.match(source, /pathname === "\/"/);
  assert.match(source, /"\/auth"/);
  assert.match(source, /"\/stores\/"/);
  assert.match(source, /"\/construction\/tasks"/);
  assert.match(source, /"\/construction\/schedules"/);
  assert.match(source, /"\/construction\/camera"/);
  assert.match(source, /"\/construction\/leaves"/);
  assert.match(source, /"\/construction\/offline"/);
  assert.match(source, /"\/construction\/profile"/);
  assert.match(source, /"\/after-sales\/tasks"/);
  assert.match(source, /"\/orders"/);
  assert.match(source, /"\/members"/);
  assert.match(source, /"\/settings"/);
  assert.match(source, /"\/inventory"/);
  assert.match(source, /router\.push\("\/settings"\)/);
});

test("management shell has a compact mobile navigation layout", () => {
  const source = readFileSync("app/globals.css", "utf8");

  assert.match(source, /\.management-mobile-nav/);
  assert.match(source, /@media \(max-width: 720px\)/);
  assert.match(source, /\.management-sidebar\s*\{\s*display: none;/);
  assert.match(source, /\.management-main\s*\{\s*padding-left: 0;/);
  assert.match(source, /\.management-mobile-nav\s*\{\s*display: grid;/);
  assert.match(source, /\.management-content\s*\{[^}]*padding-bottom: 92px;/s);
});

test("store page header hides default workbench back inside management shell", () => {
  const source = readFileSync("src/features/workbench/store-page-header.tsx", "utf8");

  assert.match(source, /showWorkbenchBack = !shouldUseManagementShell\(pathname\)/);
  assert.match(source, /\{showWorkbenchBack \? \(/);
});
