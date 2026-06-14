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
  assert.match(shellSource, /任务排班/);
  assert.match(shellSource, /我的施工/);
  assert.match(shellSource, /物料管理/);
  assert.match(shellSource, /个人中心/);
  assert.match(shellSource, /active: "tasks" \| "schedules" \| "camera" \| "leaves" \| "profile"/);
  assert.match(shellSource, /\/construction\/camera/);
  assert.match(shellSource, /\/construction\/offline/);
  assert.match(shellSource, /\/construction\/profile/);
  assert.doesNotMatch(shellSource, /label: "拍照"/);
  assert.doesNotMatch(shellSource, /label: "请假"/);
  assert.doesNotMatch(shellSource, /href: "\/profile"/);
  assert.match(readFileSync("app/globals.css", "utf8"), /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test("construction mobile camera and leave pages expose prototype quick actions", () => {
  const cameraPageSource = readFileSync("app/construction/camera/page.tsx", "utf8");
  const leavesPageSource = readFileSync("app/construction/leaves/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cameraPageSource, /施工照片上传/);
  assert.match(cameraPageSource, /construction-camera-workspace/);
  assert.match(cameraPageSource, /construction-camera-offline-banner/);
  assert.match(cameraPageSource, /construction-camera-upload-section/);
  assert.match(cameraPageSource, /construction-camera-photo-card/);
  assert.match(cameraPageSource, /construction-camera-preview/);
  assert.match(cameraPageSource, /construction-camera-upload-placeholder/);
  assert.match(cameraPageSource, /construction-camera-gallery/);
  assert.match(cameraPageSource, /construction-camera-bottom-actions/);
  assert.match(cameraPageSource, /验车照片/);
  assert.match(cameraPageSource, /膜箱照片/);
  assert.match(cameraPageSource, /膜桶照片/);
  assert.match(cameraPageSource, /车架号照片/);
  assert.match(cameraPageSource, /施工过程照片/);
  assert.match(cameraPageSource, /施工后照片/);
  assert.match(cameraPageSource, /门头合影照片/);
  assert.match(cameraPageSource, /保存并同步/);
  assert.match(cameraPageSource, /提交完工/);
  assert.match(leavesPageSource, /请假申请/);
  assert.match(leavesPageSource, /construction-leave-workspace/);
  assert.match(leavesPageSource, /variant="calendar"/);
  assert.match(leavesPageSource, /提交请假申请/);
  assert.match(leavesPageSource, /construction-leave-application-panel/);
  assert.match(leavesPageSource, /construction-leave-date-card/);
  assert.match(leavesPageSource, /construction-leave-type-pills/);
  assert.match(leavesPageSource, /construction-leave-rule-card/);
  assert.match(leavesPageSource, /construction-leave-history-card/);
  assert.match(leavesPageSource, /constructionApi\.createLeave/);
  assert.match(leavesPageSource, /请假时间/);
  assert.match(leavesPageSource, /请假类型/);
  assert.match(leavesPageSource, /请假事由/);
  assert.match(leavesPageSource, /事假/);
  assert.match(leavesPageSource, /病假/);
  assert.match(leavesPageSource, /年假/);
  assert.match(leavesPageSource, /其他/);
  assert.match(leavesPageSource, /审批通过后/);
  assert.match(cssSource, /\.construction-camera-workspace/);
  assert.match(cssSource, /\.construction-camera-offline-banner/);
  assert.match(cssSource, /\.construction-camera-upload-section/);
  assert.match(cssSource, /\.construction-camera-photo-card/);
  assert.match(cssSource, /\.construction-camera-preview/);
  assert.match(cssSource, /\.construction-camera-upload-placeholder/);
  assert.match(cssSource, /\.construction-camera-gallery/);
  assert.match(cssSource, /\.construction-camera-bottom-actions/);
  assert.match(cssSource, /\.construction-leave-workspace/);
  assert.match(cssSource, /\.construction-leave-application-panel/);
  assert.match(cssSource, /\.construction-leave-date-card/);
  assert.match(cssSource, /\.construction-leave-type-pills/);
  assert.match(cssSource, /\.construction-leave-rule-card/);
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

test("construction schedules page renders prototype task-style schedule cards", () => {
  const pageSource = readFileSync("app/construction/schedules/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const shellSource = readFileSync("src/features/construction/mobile-shell.tsx", "utf8");

  assert.match(pageSource, /variant="calendar"/);
  assert.match(pageSource, /construction-schedule-task-card/);
  assert.match(pageSource, /construction-schedule-task-section/);
  assert.match(pageSource, /construction-schedule-task-main/);
  assert.match(pageSource, /construction-schedule-task-meta/);
  assert.match(pageSource, /construction-schedule-task-actions/);
  assert.match(pageSource, /getScheduleTaskTitle/);
  assert.match(pageSource, /getScheduleTaskMeta/);
  assert.match(pageSource, /查看详情/);
  assert.match(pageSource, /立即接单/);
  assert.match(cssSource, /\.construction-schedule-task-card/);
  assert.match(cssSource, /\.construction-schedule-task-section/);
  assert.match(cssSource, /\.construction-schedule-task-main/);
  assert.match(cssSource, /\.construction-schedule-task-meta/);
  assert.match(cssSource, /\.construction-schedule-task-actions/);
  assert.match(cssSource, /\.construction-mobile-shell-calendar/);
  assert.match(shellSource, /variant\?: "hero" \| "calendar"/);
  assert.match(shellSource, /construction-mobile-shell-\$\{variant\}/);
});

test("construction offline page follows the prototype upload queue layout", () => {
  const pageSource = readFileSync("app/construction/offline/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /construction-offline-alert/);
  assert.match(pageSource, /construction-offline-status-card/);
  assert.match(pageSource, /construction-offline-actions/);
  assert.match(pageSource, /construction-offline-appbar/);
  assert.match(pageSource, /construction-offline-order-group/);
  assert.match(pageSource, /construction-offline-queue-item/);
  assert.match(pageSource, /construction-offline-thumb/);
  assert.match(pageSource, /construction-offline-state-badge/);
  assert.match(pageSource, /construction-offline-footer/);
  assert.match(pageSource, /construction-offline-group/);
  assert.match(pageSource, /construction-offline-progress/);
  assert.match(pageSource, /offlinePreviewQueue/);
  assert.match(pageSource, /groupOfflineQueue/);
  assert.match(pageSource, /离线上传队列/);
  assert.match(pageSource, /订单 #/);
  assert.match(pageSource, /刷新/);
  assert.match(pageSource, /重试同步/);
  assert.match(pageSource, /预计还需/);
  assert.match(pageSource, /lastSyncStorageKey/);
  assert.match(pageSource, /清理缓存/);
  assert.match(pageSource, /from "next\/image"/);
  assert.match(pageSource, /unoptimized/);
  assert.match(cssSource, /\.construction-offline-alert/);
  assert.match(cssSource, /\.construction-offline-status-card/);
  assert.match(cssSource, /\.construction-offline-actions/);
  assert.match(cssSource, /\.construction-offline-appbar/);
  assert.match(cssSource, /\.construction-offline-order-group/);
  assert.match(cssSource, /\.construction-offline-queue-item/);
  assert.match(cssSource, /\.construction-offline-thumb/);
  assert.match(cssSource, /\.construction-offline-state-badge/);
  assert.match(cssSource, /\.construction-offline-footer/);
  assert.match(cssSource, /\.construction-offline-group/);
  assert.match(cssSource, /\.construction-offline-progress/);
});

test("construction profile page follows the prototype connection and offline settings center", () => {
  const pageSource = readFileSync("app/construction/profile/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /title="连接与离线设置"/);
  assert.match(pageSource, /variant="settings"/);
  assert.match(pageSource, /construction-profile-status-card/);
  assert.match(pageSource, /construction-profile-config-section/);
  assert.match(pageSource, /construction-profile-config-list/);
  assert.match(pageSource, /construction-profile-cache-card/);
  assert.match(pageSource, /construction-profile-cache-actions/);
  assert.match(pageSource, /construction-profile-toggle-list/);
  assert.match(pageSource, /当前网络状态/);
  assert.match(pageSource, /延迟 \(Ping\)/);
  assert.match(pageSource, /API 终端地址/);
  assert.match(pageSource, /离线缓存空间/);
  assert.match(pageSource, /建议限制/);
  assert.doesNotMatch(pageSource, /construction-profile-hero/);
  assert.doesNotMatch(pageSource, /Avatar/);
  assert.doesNotMatch(pageSource, /快捷入口/);
  assert.doesNotMatch(pageSource, /MallBay Worker|Workplace Solutions/);
  assert.match(pageSource, /NEXT_PUBLIC_API_URL/);
  assert.match(cssSource, /\.construction-profile-status-card/);
  assert.match(cssSource, /\.construction-mobile-shell-settings/);
  assert.match(cssSource, /\.construction-mobile-settings-header/);
  assert.match(cssSource, /\.construction-profile-config-section/);
  assert.match(cssSource, /\.construction-profile-setting-row/);
  assert.match(cssSource, /\.construction-profile-config-list/);
  assert.match(cssSource, /\.construction-profile-cache-card/);
  assert.match(cssSource, /\.construction-profile-cache-actions/);
  assert.match(cssSource, /\.construction-profile-toggle-list/);
});
