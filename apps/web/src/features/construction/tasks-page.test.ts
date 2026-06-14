import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("construction tasks page renders status with business labels", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");

  assert.match(pageSource, /getConstructionStatusLabel/);
  assert.doesNotMatch(pageSource, /<Tag>\{row\.status\}<\/Tag>/);
});

test("construction tasks page does not fall back to technical order ids", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");

  assert.match(pageSource, /订单未加载/);
  assert.doesNotMatch(pageSource, /row\.order\?\.orderNo \?\? row\.orderId/);
});

test("construction tasks page opens the mobile task detail instead of the desktop construction record", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");

  assert.match(pageSource, /router\.push\(`\/construction\/tasks\/\$\{row\.orderId\}`\)/);
  assert.doesNotMatch(pageSource, /router\.push\(`\/construction\/orders\/\$\{row\.orderId\}`\)/);
});

test("construction tasks page follows the prototype worker task center layout", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /worker-task-status-hero/);
  assert.match(pageSource, /construction-task-segments/);
  assert.match(pageSource, /今日任务/);
  assert.match(pageSource, /待接单/);
  assert.match(pageSource, /施工中/);
  assert.match(pageSource, /已完成/);
  assert.match(pageSource, /worker-task-empty-card/);
  assert.match(cssSource, /\.worker-task-status-hero/);
  assert.match(cssSource, /\.construction-task-segments/);
  assert.match(cssSource, /\.worker-task-empty-card/);
});

test("construction mobile task detail page covers photo upload and task actions", () => {
  const detailPagePath = "app/construction/tasks/[id]/page.tsx";

  assert.equal(existsSync(detailPagePath), true);

  const pageSource = readFileSync(detailPagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /ConstructionMobileShell/);
  assert.match(pageSource, /active="tasks"/);
  assert.match(pageSource, /施工任务详情/);
  assert.match(pageSource, /worker-task-detail-hero/);
  assert.match(pageSource, /worker-task-progress/);
  assert.match(pageSource, /worker-task-sticky-actions/);
  assert.match(pageSource, /开始验车/);
  assert.match(pageSource, /上传照片/);
  assert.match(pageSource, /提交完工/);
  assert.match(pageSource, /照片清单/);
  assert.match(pageSource, /construction-mobile-task-detail/);
  assert.match(pageSource, /construction-mobile-photo-checklist/);
  assert.match(pageSource, /验车照片/);
  assert.match(pageSource, /膜箱照片/);
  assert.match(pageSource, /施工过程照片/);
  assert.match(pageSource, /施工后照片/);
  assert.match(pageSource, /constructionApi\.uploadPhoto/);
  assert.match(pageSource, /constructionApi\.startOrder/);
  assert.match(pageSource, /constructionApi\.completeOrder/);
  assert.doesNotMatch(pageSource, /params\.id<\/h1>/);
  assert.doesNotMatch(pageSource, /record\?\.order\?\.orderNo \?\? params\.id/);
  assert.match(cssSource, /\.worker-task-detail-hero/);
  assert.match(cssSource, /\.worker-task-progress/);
  assert.match(cssSource, /\.worker-task-sticky-actions/);
  assert.match(cssSource, /construction-mobile-task-detail/);
  assert.match(cssSource, /construction-mobile-photo-checklist/);
});

test("construction mobile pages use the worker mobile shell and bottom navigation", () => {
  const tasksPageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");
  const schedulesPageSource = readFileSync("app/construction/schedules/page.tsx", "utf8");
  const cameraPageSource = readFileSync("app/construction/camera/page.tsx", "utf8");
  const leavesPageSource = readFileSync("app/construction/leaves/page.tsx", "utf8");
  const offlinePageSource = readFileSync("app/construction/offline/page.tsx", "utf8");
  const profilePageSource = readFileSync("app/construction/profile/page.tsx", "utf8");
  const shellSource = readFileSync("src/features/construction/mobile-shell.tsx", "utf8");

  assert.match(tasksPageSource, /ConstructionMobileShell/);
  assert.match(schedulesPageSource, /constructionApi\.schedules/);
  assert.match(cameraPageSource, /active="camera"/);
  assert.match(leavesPageSource, /active="leaves"/);
  assert.match(offlinePageSource, /constructionApi\.offlineSync/);
  assert.match(profilePageSource, /active="profile"/);
  assert.match(shellSource, /mobile-worker-shell/);
  assert.match(shellSource, /construction-mobile-tabs/);
  assert.match(shellSource, /mobile-worker-bottom-nav/);
  assert.match(shellSource, /active: "tasks" \| "schedules" \| "camera" \| "leaves" \| "profile"/);
  assert.match(shellSource, /\/construction\/camera/);
  assert.match(shellSource, /\/construction\/leaves/);
  assert.match(shellSource, /\/construction\/offline/);
  assert.match(shellSource, /\/construction\/profile/);
  assert.doesNotMatch(shellSource, /href: "\/profile"/);
});

test("construction mobile camera and leave pages expose prototype quick actions", () => {
  const cameraPageSource = readFileSync("app/construction/camera/page.tsx", "utf8");
  const leavesPageSource = readFileSync("app/construction/leaves/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cameraPageSource, /拍照入口/);
  assert.match(cameraPageSource, /construction-camera-workspace/);
  assert.match(cameraPageSource, /construction-camera-stage-grid/);
  assert.match(cameraPageSource, /construction-camera-queue-card/);
  assert.match(cameraPageSource, /验车照片/);
  assert.match(cameraPageSource, /膜箱照片/);
  assert.match(cameraPageSource, /施工过程照片/);
  assert.match(cameraPageSource, /离线队列/);
  assert.match(leavesPageSource, /请假申请/);
  assert.match(leavesPageSource, /construction-leave-workspace/);
  assert.match(leavesPageSource, /construction-leave-form-card/);
  assert.match(leavesPageSource, /construction-leave-history-card/);
  assert.match(leavesPageSource, /constructionApi\.createLeave/);
  assert.match(leavesPageSource, /休息/);
  assert.match(leavesPageSource, /外出施工/);
  assert.match(cssSource, /\.construction-camera-workspace/);
  assert.match(cssSource, /\.construction-camera-stage-grid/);
  assert.match(cssSource, /\.construction-camera-queue-card/);
  assert.match(cssSource, /\.construction-leave-workspace/);
  assert.match(cssSource, /\.construction-leave-form-card/);
  assert.match(cssSource, /\.construction-leave-history-card/);
});

test("construction schedules page follows the prototype weekly schedule layout", () => {
  const pageSource = readFileSync("app/construction/schedules/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /construction-schedule-tabs/);
  assert.match(pageSource, /我的排班/);
  assert.match(pageSource, /请假申请/);
  assert.match(pageSource, /历史记录/);
  assert.match(pageSource, /weekDays/);
  assert.match(pageSource, /construction-schedule-week/);
  assert.match(pageSource, /construction-schedule-card/);
  assert.match(pageSource, /construction-leave-fab/);
  assert.match(cssSource, /\.construction-schedule-tabs/);
  assert.match(cssSource, /\.construction-schedule-week/);
  assert.match(cssSource, /\.construction-schedule-card/);
  assert.match(cssSource, /\.construction-leave-fab/);
});

test("construction offline page follows the prototype upload queue layout", () => {
  const pageSource = readFileSync("app/construction/offline/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /construction-offline-alert/);
  assert.match(pageSource, /construction-offline-status-card/);
  assert.match(pageSource, /construction-offline-actions/);
  assert.match(pageSource, /construction-offline-group/);
  assert.match(pageSource, /construction-offline-progress/);
  assert.match(pageSource, /lastSyncStorageKey/);
  assert.match(pageSource, /清理缓存/);
  assert.match(cssSource, /\.construction-offline-alert/);
  assert.match(cssSource, /\.construction-offline-status-card/);
  assert.match(cssSource, /\.construction-offline-actions/);
  assert.match(cssSource, /\.construction-offline-group/);
  assert.match(cssSource, /\.construction-offline-progress/);
});

test("construction profile page follows the prototype account and connection center", () => {
  const pageSource = readFileSync("app/construction/profile/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /construction-profile-hero/);
  assert.match(pageSource, /construction-profile-status-card/);
  assert.match(pageSource, /construction-profile-config-list/);
  assert.match(pageSource, /construction-profile-cache-card/);
  assert.match(pageSource, /construction-profile-toggle-list/);
  assert.match(pageSource, /MallBay 施工端/);
  assert.match(pageSource, /门店施工协同解决方案/);
  assert.doesNotMatch(pageSource, /MallBay Worker|Workplace Solutions/);
  assert.match(pageSource, /NEXT_PUBLIC_API_URL/);
  assert.match(cssSource, /\.construction-profile-hero/);
  assert.match(cssSource, /\.construction-profile-status-card/);
  assert.match(cssSource, /\.construction-profile-config-list/);
  assert.match(cssSource, /\.construction-profile-cache-card/);
  assert.match(cssSource, /\.construction-profile-toggle-list/);
});
