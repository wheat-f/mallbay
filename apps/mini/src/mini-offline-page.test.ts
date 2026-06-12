import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("offline mini runtime keeps failed operations pending until the third retry", () => {
  const offlinePageSource = readFileSync("pages/offline/index.js", "utf8");
  const appSource = readFileSync("app.js", "utf8");

  for (const source of [offlinePageSource, appSource]) {
    assert.match(source, /MAX_OFFLINE_SYNC_RETRIES = 3/);
    assert.match(source, /attempts >= MAX_OFFLINE_SYNC_RETRIES \? "FAILED" : "PENDING"/);
    assert.match(source, /item\.status !== "FAILED"/);
  }
});

test("task detail photo queue shows a clear local cache limit prompt", () => {
  const taskDetailSource = readFileSync("pages/task-detail/index.js", "utf8");

  assert.match(taskDetailSource, /MAX_OFFLINE_QUEUE_ITEMS = 100/);
  assert.match(taskDetailSource, /queue\.length >= MAX_OFFLINE_QUEUE_ITEMS/);
  assert.match(taskDetailSource, /本地缓存已达上限/);
  assert.match(taskDetailSource, /takenAt: new Date\(\)\.toISOString\(\)/);
  assert.match(taskDetailSource, /return;/);
});

test("offline mini runtime uploads photo taken time", () => {
  const offlinePageSource = readFileSync("pages/offline/index.js", "utf8");
  const appSource = readFileSync("app.js", "utf8");

  for (const source of [offlinePageSource, appSource]) {
    assert.match(source, /if \(payload\.takenAt\)/);
    assert.match(source, /formData\.takenAt = payload\.takenAt/);
  }
});

test("mini app exposes offline leave request page and task entry", () => {
  const appJsonSource = readFileSync("app.json", "utf8");
  const tasksWxmlSource = readFileSync("pages/tasks/index.wxml", "utf8");
  const tasksJsSource = readFileSync("pages/tasks/index.js", "utf8");
  const leaveJsSource = readFileSync("pages/leave/index.js", "utf8");
  const leaveWxmlSource = readFileSync("pages/leave/index.wxml", "utf8");

  assert.match(appJsonSource, /pages\/leave\/index/);
  assert.match(tasksWxmlSource, /请假/);
  assert.match(tasksWxmlSource, /bindtap="openLeaveRequest"/);
  assert.match(tasksJsSource, /openLeaveRequest/);
  assert.match(tasksJsSource, /\/pages\/leave\/index/);
  assert.match(leaveJsSource, /type: "LEAVE_REQUEST"/);
  assert.match(leaveJsSource, /mallbay_store_id/);
  assert.match(leaveJsSource, /wx\.setStorageSync\(OFFLINE_QUEUE_KEY/);
  assert.match(leaveWxmlSource, /开始日期/);
  assert.match(leaveWxmlSource, /结束日期/);
  assert.match(leaveWxmlSource, /请假原因/);
});

test("tasks mini runtime accepts wrapped assignment list responses", () => {
  const tasksJsSource = readFileSync("pages/tasks/index.js", "utf8");

  assert.match(tasksJsSource, /normalizeAssignmentsResponse\(response\.data\)/);
  assert.match(tasksJsSource, /Array\.isArray\(data\.items\)/);
});

test("task detail mini runtime queues offline status changes", () => {
  const taskDetailJsSource = readFileSync("pages/task-detail/index.js", "utf8");
  const taskDetailWxmlSource = readFileSync("pages/task-detail/index.wxml", "utf8");

  assert.match(taskDetailJsSource, /queueStatusChange/);
  assert.match(taskDetailJsSource, /type: "TASK_STATUS"/);
  assert.match(taskDetailJsSource, /orderId: this\.data\.task\.orderId/);
  assert.match(taskDetailJsSource, /if \(status === "IN_CONSTRUCTION"\)/);
  assert.match(taskDetailJsSource, /payload\.startedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(taskDetailJsSource, /if \(status === "COMPLETED"\)/);
  assert.match(taskDetailJsSource, /payload\.completedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(taskDetailWxmlSource, /statusActions/);
  assert.match(taskDetailWxmlSource, /bindtap="queueStatusChange"/);
});
