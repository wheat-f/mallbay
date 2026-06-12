import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getConstructionPhotoStageLabel,
  getConstructionQualityResultLabel,
  getConstructionStatusLabel,
  getConstructionWorkerLabel
} from "./display";

test("getConstructionWorkerLabel prefers nickname username and skill tags", () => {
  assert.equal(
    getConstructionWorkerLabel({
      userId: "user-1",
      skillTags: ["PPF", "WINDOW_FILM"],
      user: { username: "zhouqi", nickname: "周七" }
    }),
    "周七 · PPF/WINDOW_FILM"
  );
  assert.equal(getConstructionWorkerLabel({ userId: "cmprn332u0000lpibg4bbog5t" }), "施工人员未加载");
  assert.equal(getConstructionWorkerLabel("cmprn332u0000lpibg4bbog5t"), "施工人员未加载");
});

test("getConstructionPhotoStageLabel formats photo stages", () => {
  assert.equal(getConstructionPhotoStageLabel("BEFORE"), "施工前");
  assert.equal(getConstructionPhotoStageLabel("DURING"), "施工中");
  assert.equal(getConstructionPhotoStageLabel("AFTER"), "施工后");
  assert.equal(getConstructionPhotoStageLabel("UNKNOWN"), "UNKNOWN");
});

test("getConstructionStatusLabel formats construction task statuses", () => {
  assert.equal(getConstructionStatusLabel("DISPATCHED"), "已派工");
  assert.equal(getConstructionStatusLabel("IN_CONSTRUCTION"), "施工中");
  assert.equal(getConstructionStatusLabel("COMPLETED"), "已完工");
  assert.equal(getConstructionStatusLabel("UNKNOWN"), "UNKNOWN");
});

test("getConstructionQualityResultLabel formats quality check results", () => {
  assert.equal(getConstructionQualityResultLabel("PASS"), "通过");
  assert.equal(getConstructionQualityResultLabel("REWORK_REQUIRED"), "需要返工");
  assert.equal(getConstructionQualityResultLabel("UNKNOWN"), "UNKNOWN");
  assert.equal(getConstructionQualityResultLabel(null), "-");
});
