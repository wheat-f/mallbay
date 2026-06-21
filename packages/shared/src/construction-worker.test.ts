import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkerTaskSegments,
  filterWorkerTasks,
  getWorkerPhotoStageLabel,
  getWorkerScheduleStatusLabel,
  getWorkerTaskStatusLabel,
  getWorkerLeaveStatusLabel,
  type WorkerTaskSummary
} from "./construction-worker";

test("construction worker labels are shared across web and mini worker contexts", () => {
  assert.equal(getWorkerTaskStatusLabel("DISPATCHED"), "待开工");
  assert.equal(getWorkerTaskStatusLabel("IN_CONSTRUCTION"), "施工中");
  assert.equal(getWorkerTaskStatusLabel("COMPLETED"), "已完工");
  assert.equal(getWorkerPhotoStageLabel("BEFORE"), "施工前");
  assert.equal(getWorkerLeaveStatusLabel("PENDING"), "待审批");
  assert.equal(getWorkerScheduleStatusLabel("OUTSIDE"), "外出施工");
});

test("worker task segments split today pending active and completed", () => {
  const today = "2026-06-21";
  const rows: WorkerTaskSummary[] = [
    { id: "r1", orderId: "o1", status: "DISPATCHED", appointmentDate: today },
    { id: "r2", orderId: "o2", status: "IN_CONSTRUCTION", appointmentDate: "2026-06-20" },
    { id: "r3", orderId: "o3", status: "COMPLETED", appointmentDate: "2026-06-19" }
  ];

  assert.deepEqual(buildWorkerTaskSegments(rows, today).map((item) => [item.key, item.count]), [
    ["today", 1],
    ["pending", 1],
    ["active", 1],
    ["completed", 1]
  ]);
  assert.deepEqual(filterWorkerTasks(rows, "active", today).map((item) => item.id), ["r2"]);
});
