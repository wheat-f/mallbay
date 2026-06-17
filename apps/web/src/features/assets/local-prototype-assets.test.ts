import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const filesWithPrototypeImages = [
  "app/after-sales/tasks/page.tsx",
  "app/construction/camera/page.tsx",
  "app/construction/offline/page.tsx",
  "app/globals.css"
];

test("prototype image assets are served from local static files", () => {
  const combinedSource = filesWithPrototypeImages.map((file) => readFileSync(file, "utf8")).join("\n");
  const nextConfigSource = readFileSync("next.config.ts", "utf8");

  assert.doesNotMatch(combinedSource, /https:\/\/lh3\.googleusercontent\.com/);
  assert.doesNotMatch(nextConfigSource, /remotePatterns/);
  assert.doesNotMatch(nextConfigSource, /lh3\.googleusercontent\.com/);

  [
    "/prototype-assets/auth-hero.png",
    "/prototype-assets/after-sales-task-1.png",
    "/prototype-assets/after-sales-task-2.png",
    "/prototype-assets/construction-camera-inspection.png",
    "/prototype-assets/construction-camera-film-box.png",
    "/prototype-assets/construction-camera-process-a.png",
    "/prototype-assets/construction-camera-process-b.png",
    "/prototype-assets/construction-camera-completed.png",
    "/prototype-assets/construction-offline-1.png",
    "/prototype-assets/construction-offline-2.png",
    "/prototype-assets/construction-offline-3.png"
  ].forEach((assetPath) => {
    assert.match(combinedSource, new RegExp(assetPath.replace(/\//g, "\\/")));
    assert.equal(existsSync(`public${assetPath}`), true, `${assetPath} should exist in public`);
  });
});
