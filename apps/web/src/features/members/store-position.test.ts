import assert from "node:assert/strict";
import { test } from "node:test";
import { getStorePositionLabel, STORE_POSITION_LABELS } from "./store-position";

test("maps every store position to the label used by invitations and workbenches", () => {
  assert.deepEqual(STORE_POSITION_LABELS, {
    MANAGER: "店长",
    SALES: "销售",
    CUSTOMER_SERVICE: "客服",
    PURCHASING: "采购",
    FINANCE: "财务",
    SCHEDULER: "施工主管",
    CONSTRUCTION: "施工员",
    APPRENTICE: "学徒"
  });
});

test("keeps an unknown position visible for diagnostics", () => {
  assert.equal(getStorePositionLabel("CUSTOMER_SERVICE"), "客服");
  assert.equal(getStorePositionLabel("UNKNOWN_POSITION"), "UNKNOWN_POSITION");
  assert.equal(getStorePositionLabel(null), "");
});
