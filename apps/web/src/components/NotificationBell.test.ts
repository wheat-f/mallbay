import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("notification bell keeps the prototype danger dot in the management topbar", () => {
  const source = readFileSync("src/components/NotificationBell.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(source, /className="notif-bell-btn"/);
  assert.match(source, /className="notif-bell-prototype-dot"/);
  assert.match(cssSource, /\.notif-bell-btn\s*\{[\s\S]*position: relative;/);
  assert.match(cssSource, /\.notif-bell-prototype-dot\s*\{/);
  assert.match(cssSource, /background: var\(--mb-danger\)/);
  assert.match(cssSource, /width: 8px/);
  assert.match(cssSource, /height: 8px/);
});
