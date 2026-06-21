import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildLeaveRequestOperationInput,
  buildPhotoUploadOperationInput,
  buildScheduleListItems,
  buildTaskStatusOperationInput,
  buildOfflineQueueSummary,
  buildTaskDetailView,
  buildTaskListItems,
  buildTaskSegments,
  filterTasksBySegment,
  type CachedConstructionTask
} from "./construction-task-view";

const cachedTasks: CachedConstructionTask[] = [
  {
    id: "record-1",
    orderId: "order-1",
    orderNo: "MB20260606001",
    customerName: "申周翰",
    vehicleLabel: "湘A101ZQ / 宝马5系 / 黑色",
    constructionType: "漆面保护膜",
    constructionLocation: "到店",
    appointmentDate: "2026-06-18",
    appointmentTimeSlot: "09:00",
    status: "DISPATCHED",
    photoStages: ["BEFORE"]
  },
  {
    id: "record-2",
    orderId: "order-2",
    orderNo: "MB20260606002",
    customerName: "小明",
    vehicleLabel: "湘B88888 / 奥迪A6 / 白色",
    constructionType: "玻璃膜",
    constructionLocation: "外出",
    appointmentDate: "2026-06-19",
    appointmentTimeSlot: "13:30",
    outsideAddress: "湖南长沙",
    status: "IN_CONSTRUCTION",
    photoStages: ["BEFORE", "DURING"]
  }
];

test("buildTaskListItems formats cached construction tasks for mini list page", () => {
  assert.deepEqual(buildTaskListItems(cachedTasks), [
    {
      id: "record-1",
      title: "MB20260606001 · 申周翰",
      meta: "湘A101ZQ / 宝马5系 / 黑色",
      schedule: "2026-06-18 09:00 · 到店",
      statusLabel: "待开工",
      photoProgress: "照片 1/3"
    },
    {
      id: "record-2",
      title: "MB20260606002 · 小明",
      meta: "湘B88888 / 奥迪A6 / 白色",
      schedule: "2026-06-19 13:30 · 外出 · 湖南长沙",
      statusLabel: "施工中",
      photoProgress: "照片 2/3"
    }
  ]);
});

test("buildTaskDetailView exposes photo stage actions and customer vehicle snapshot", () => {
  assert.deepEqual(buildTaskDetailView(cachedTasks[1]), {
    id: "record-2",
    orderId: "order-2",
    title: "MB20260606002",
    statusLabel: "施工中",
    customerVehicle: "小明 · 湘B88888 / 奥迪A6 / 白色",
    construction: "玻璃膜 · 外出",
    schedule: "2026-06-19 13:30",
    address: "湖南长沙",
    statusActions: [
      { status: "COMPLETED", label: "完工", disabled: false }
    ],
    photoStages: [
      { stage: "BEFORE", label: "施工前", uploaded: true },
      { stage: "DURING", label: "施工中", uploaded: true },
      { stage: "AFTER", label: "施工后", uploaded: false }
    ]
  });
});

test("buildTaskSegments shares worker task grouping with web desktop worker pages", () => {
  const completedTask: CachedConstructionTask = {
    ...cachedTasks[0],
    id: "record-3",
    orderId: "order-3",
    status: "COMPLETED",
    appointmentDate: "2026-06-17"
  };
  const rows = [...cachedTasks, completedTask];

  assert.deepEqual(buildTaskSegments(rows, "2026-06-18").map((item) => [item.key, item.count]), [
    ["today", 1],
    ["pending", 1],
    ["active", 1],
    ["completed", 1]
  ]);
  assert.deepEqual(filterTasksBySegment(rows, "completed", "2026-06-18").map((item) => item.id), ["record-3"]);
});

test("buildScheduleListItems formats worker schedules for the mini schedule page", () => {
  assert.deepEqual(
    buildScheduleListItems([
      {
        id: "schedule-1",
        date: "2026-06-21T00:00:00.000Z",
        status: "WORKING",
        note: "漆面保护膜 09:00",
        worker: { username: "shigong", nickname: "施工师傅" }
      },
      {
        id: "schedule-2",
        date: "2026-06-22",
        status: "REST",
        note: "",
        worker: null
      }
    ]),
    [
      {
        id: "schedule-1",
        date: "2026-06-21",
        statusLabel: "店内排班",
        note: "漆面保护膜 09:00",
        workerName: "施工师傅"
      },
      {
        id: "schedule-2",
        date: "2026-06-22",
        statusLabel: "休息",
        note: "休息",
        workerName: "我的排班"
      }
    ]
  );
});

test("buildOfflineQueueSummary groups pending failed and retrying operations", () => {
  assert.deepEqual(
    buildOfflineQueueSummary([
      { id: "1", type: "PHOTO_UPLOAD", attempts: 0, status: "PENDING" },
      { id: "2", type: "TASK_STATUS", attempts: 1, status: "PENDING" },
      { id: "3", type: "LEAVE_REQUEST", attempts: 3, status: "FAILED" }
    ]),
    {
      total: 3,
      pending: 2,
      retrying: 1,
      failed: 1,
      description: "待同步 2 条，重试中 1 条，失败 1 条"
    }
  );
});

test("buildPhotoUploadOperationInput stores local media path and taken time for offline sync", () => {
  assert.deepEqual(buildPhotoUploadOperationInput("record-1", "AFTER", "wxfile://tmp/after.jpg", "2026-06-11T10:00:00.000Z"), {
    type: "PHOTO_UPLOAD",
    payload: {
      recordId: "record-1",
      stage: "AFTER",
      localPath: "wxfile://tmp/after.jpg",
      takenAt: "2026-06-11T10:00:00.000Z"
    }
  });
});

test("buildTaskDetailView exposes start action for dispatched tasks", () => {
  assert.deepEqual(buildTaskDetailView(cachedTasks[0]).statusActions, [
    { status: "IN_CONSTRUCTION", label: "开工", disabled: false }
  ]);
});

test("buildLeaveRequestOperationInput stores leave request payload for offline sync", () => {
  assert.deepEqual(
    buildLeaveRequestOperationInput("store-1", "2026-06-20", "2026-06-21", "外出培训"),
    {
      type: "LEAVE_REQUEST",
      payload: {
        storeId: "store-1",
        startDate: "2026-06-20",
        endDate: "2026-06-21",
        reason: "外出培训"
      }
    }
  );
});

test("buildTaskStatusOperationInput stores order status transition for offline sync", () => {
  assert.deepEqual(buildTaskStatusOperationInput("order-1", "IN_CONSTRUCTION", "2026-06-11T11:00:00.000Z"), {
    type: "TASK_STATUS",
    payload: {
      orderId: "order-1",
      status: "IN_CONSTRUCTION",
      startedAt: "2026-06-11T11:00:00.000Z"
    }
  });
});

test("buildTaskStatusOperationInput stores local completion time for completed tasks", () => {
  assert.deepEqual(buildTaskStatusOperationInput("order-1", "COMPLETED", "2026-06-11T12:00:00.000Z"), {
    type: "TASK_STATUS",
    payload: {
      orderId: "order-1",
      status: "COMPLETED",
      completedAt: "2026-06-11T12:00:00.000Z"
    }
  });
});

test("mini app exposes a schedule page and task quick entry", () => {
  const appConfig = JSON.parse(readFileSync("app.json", "utf8")) as { pages: string[] };
  const taskPageSource = readFileSync("pages/tasks/index.js", "utf8");
  const taskPageMarkup = readFileSync("pages/tasks/index.wxml", "utf8");
  const schedulePageSource = readFileSync("pages/schedule/index.js", "utf8");

  assert.ok(appConfig.pages.includes("pages/schedule/index"));
  assert.match(taskPageSource, /openSchedule/);
  assert.match(taskPageMarkup, /bindtap="openSchedule"/);
  assert.match(schedulePageSource, /\/construction\/schedules/);
  assert.match(schedulePageSource, /mallbay_construction_schedules/);
});
