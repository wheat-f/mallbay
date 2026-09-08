import assert from "node:assert/strict";
import test from "node:test";
import { HEADQUARTERS_ADMIN_GRANTS } from "./hq-admin-bootstrap";

test("HQ administrators retain the product suggested-price write capability", () => {
  assert.equal(
    HEADQUARTERS_ADMIN_GRANTS.some(([permissionCode, action, scope]) =>
      permissionCode === "products" && action === "suggested-price-write" && scope === "GLOBAL"
    ),
    true
  );
});
