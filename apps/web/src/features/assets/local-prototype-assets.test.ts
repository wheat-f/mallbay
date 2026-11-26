import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const filesCheckedForRemoteImages = [
  "app/after-sales/tasks/page.tsx",
  "app/construction/offline/page.tsx",
  "app/globals.css"
];

test("prototype image assets are served from local static files", () => {
  const combinedSource = filesCheckedForRemoteImages.map((file) => readFileSync(file, "utf8")).join("\n");
  const afterSalesSource = readFileSync("app/after-sales/tasks/page.tsx", "utf8");
  const offlineSource = readFileSync("app/construction/offline/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const nextConfigSource = readFileSync("next.config.ts", "utf8");

  assert.doesNotMatch(combinedSource, /https:\/\/lh3\.googleusercontent\.com/);
  assert.doesNotMatch(nextConfigSource, /remotePatterns/);
  assert.doesNotMatch(nextConfigSource, /lh3\.googleusercontent\.com/);

  assert.match(cssSource, /\/prototype-assets\/auth-hero\.png/);
  assert.equal(existsSync("public/prototype-assets/auth-hero.png"), true, "/prototype-assets/auth-hero.png should exist in public");
  assert.doesNotMatch(afterSalesSource, /\/prototype-assets\//);
  assert.doesNotMatch(offlineSource, /\/prototype-assets\//);
});
