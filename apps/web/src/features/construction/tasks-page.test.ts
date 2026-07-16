import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("construction tasks page renders status with business labels", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");

  assert.match(pageSource, /getWorkerTaskStatusLabel/);
  assert.doesNotMatch(pageSource, /<Tag>\{row\.status\}<\/Tag>/);
});

test("construction tasks page does not fall back to technical order ids", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");
  const detailPageSource = readFileSync("app/construction/tasks/[id]/page.tsx", "utf8");

  assert.match(pageSource, /订单信息待确认/);
  assert.match(detailPageSource, /订单信息待确认/);
  assert.doesNotMatch(pageSource, /订单未加载/);
  assert.doesNotMatch(detailPageSource, /订单未加载/);
  assert.doesNotMatch(pageSource, /row\.order\?\.orderNo \?\? row\.orderId/);
  assert.doesNotMatch(detailPageSource, /record\.order\?\.orderNo \?\? params\.id/);
});

test("construction offline queue does not show technical order ids as order labels", () => {
  const pageSource = readFileSync("app/construction/offline/page.tsx", "utf8");

  assert.match(pageSource, /待关联订单/);
  assert.doesNotMatch(pageSource, /orderNo: getPayloadString\(payload, "orderNo"\) \?\? getPayloadString\(payload, "orderId"\)/);
});

test("construction tasks page opens the worker execution detail instead of the manager construction record", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");

  assert.match(pageSource, /router\.push\(`\/construction\/tasks\/\$\{row\.orderId\}`\)/);
  assert.doesNotMatch(pageSource, /router\.push\(`\/construction\/orders\/\$\{row\.orderId\}`\)/);
});

test("construction tasks page is a desktop worker task center, not the mobile shell", () => {
  const pageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(pageSource, /ConstructionMobileShell/);
  assert.match(pageSource, /StorePageHeader/);
  assert.match(pageSource, /worker-task-center-page/);
  assert.match(pageSource, /worker-task-center-hero/);
  assert.match(pageSource, /worker-task-center-kpis/);
  assert.match(pageSource, /worker-task-center-filters/);
  assert.match(pageSource, /worker-task-center-table/);
  assert.match(pageSource, /worker-task-center-mobile-cards/);
  assert.match(pageSource, /我的施工任务/);
  assert.match(pageSource, /刷新任务/);
  assert.match(pageSource, /今日任务/);
  assert.match(pageSource, /待开工/);
  assert.match(pageSource, /施工中/);
  assert.match(pageSource, /已完成/);
  assert.match(pageSource, /buildWorkerTaskSegments/);
  assert.match(pageSource, /filterWorkerTasks/);
  assert.match(pageSource, /canStartTask/);
  assert.match(pageSource, /canCompleteTask/);
  assert.doesNotMatch(pageSource, /router\.push\("\/construction\/camera"\)/);
  assert.match(cssSource, /\.worker-task-center-page/);
  assert.match(cssSource, /\.worker-task-center-hero/);
  assert.match(cssSource, /\.worker-task-center-filters/);
  assert.match(cssSource, /\.worker-task-center-table/);
});

test("construction task detail page is a desktop execution workspace", () => {
  const detailPagePath = "app/construction/tasks/[id]/page.tsx";

  assert.equal(existsSync(detailPagePath), true);

  const pageSource = readFileSync(detailPagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(pageSource, /ConstructionMobileShell/);
  assert.match(pageSource, /StorePageHeader/);
  assert.match(pageSource, /施工任务详情/);
  assert.match(pageSource, /返回任务列表/);
  assert.match(pageSource, /未找到该施工任务/);
  assert.doesNotMatch(pageSource, /施工任务未加载/);
  assert.match(pageSource, /worker-task-detail-page/);
  assert.match(pageSource, /worker-task-detail-hero/);
  assert.match(pageSource, /worker-task-progress/);
  assert.match(pageSource, /worker-task-detail-actions/);
  assert.match(pageSource, /worker-task-detail-grid/);
  assert.match(pageSource, /worker-task-material-card/);
  assert.match(pageSource, /worker-task-photo-card/);
  assert.match(pageSource, /worker-task-photo-checklist/);
  assert.match(pageSource, /worker-task-photo-preview-list/);
  assert.match(pageSource, /previewPhoto/);
  assert.match(pageSource, /<Modal/);
  assert.match(pageSource, /<Image src=\{previewPhoto\.url\}/);
  assert.match(pageSource, /开始验车/);
  assert.match(pageSource, /上传文件/);
  assert.match(pageSource, /提交完工/);
  assert.match(pageSource, /领取物料/);
  assert.match(pageSource, /物料领取/);
  assert.match(pageSource, /请先领取已锁定的施工物料/);
  assert.match(pageSource, /照片凭证/);
  assert.match(pageSource, /验车照片/);
  assert.match(pageSource, /膜箱照片/);
  assert.match(pageSource, /施工过程照片/);
  assert.match(pageSource, /施工后照片/);
  assert.match(pageSource, /getWorkerTaskStatusLabel/);
  assert.match(pageSource, /getWorkerPhotoStageLabel/);
  assert.match(pageSource, /constructionApi\.uploadPhoto/);
  assert.match(pageSource, /constructionApi\.startOrder/);
  assert.match(pageSource, /constructionApi\.completeOrder/);
  assert.match(pageSource, /constructionApi\.orderMaterials/);
  assert.match(pageSource, /constructionApi\.pickupMaterials/);
  assert.match(pageSource, /constructionApi\.workCostDeclaration/);
  assert.match(pageSource, /constructionApi\.declareCostWork/);
  assert.match(pageSource, /工时偏差申报/);
  assert.match(pageSource, /CONSTRUCTION_TIME_VARIANCE_REASON/);
  assert.match(pageSource, /偏差原因（必选，来自系统字典）/);
  assert.match(pageSource, /pendingAllocationIds/);
  assert.match(pageSource, /materialPickupState/);
  assert.match(pageSource, /completeBlockReason/);
  assert.doesNotMatch(pageSource, /施工照片链接/);
  assert.doesNotMatch(pageSource, /粘贴施工照片链接/);
  assert.doesNotMatch(pageSource, /params\.id<\/h1>/);
  assert.doesNotMatch(pageSource, /record\?\.order\?\.orderNo \?\? params\.id/);
  assert.doesNotMatch(pageSource, /desktopHref=\{`\/construction\/orders\/\$\{params\.id\}`\}/);
  assert.doesNotMatch(pageSource, /construction-mobile-task-detail/);
  assert.match(cssSource, /\.worker-task-detail-hero/);
  assert.match(cssSource, /\.worker-task-progress/);
  assert.match(cssSource, /\.worker-task-detail-actions/);
  assert.match(cssSource, /\.worker-task-detail-grid/);
  assert.match(cssSource, /\.worker-task-material-card/);
  assert.match(cssSource, /\.worker-task-photo-checklist/);
});

test("construction worker pages use web management shell while keeping the mini shell source", () => {
  const tasksPageSource = readFileSync("app/construction/tasks/page.tsx", "utf8");
  const schedulesPageSource = readFileSync("app/construction/schedules/page.tsx", "utf8");
  const cameraPageSource = readFileSync("app/construction/camera/page.tsx", "utf8");
  const materialsPagePath = "app/construction/materials/page.tsx";
  const leavesPageSource = readFileSync("app/construction/leaves/page.tsx", "utf8");
  const offlinePageSource = readFileSync("app/construction/offline/page.tsx", "utf8");
  const profilePageSource = readFileSync("app/construction/profile/page.tsx", "utf8");
  const mobileShellPath = "src/features/construction/mobile-shell.tsx";

  assert.equal(existsSync(materialsPagePath), true);
  assert.equal(existsSync(mobileShellPath), false);
  const materialsPageSource = readFileSync(materialsPagePath, "utf8");

  assert.doesNotMatch(tasksPageSource, /ConstructionMobileShell/);
  assert.match(tasksPageSource, /StorePageHeader/);
  assert.doesNotMatch(schedulesPageSource, /ConstructionMobileShell/);
  assert.match(schedulesPageSource, /StorePageHeader/);
  assert.match(schedulesPageSource, /constructionApi\.schedules/);
  assert.doesNotMatch(cameraPageSource, /ConstructionMobileShell/);
  assert.match(cameraPageSource, /StorePageHeader/);
  assert.match(cameraPageSource, /worker-camera-page/);
  assert.doesNotMatch(materialsPageSource, /ConstructionMobileShell/);
  assert.match(materialsPageSource, /StorePageHeader/);
  assert.doesNotMatch(leavesPageSource, /ConstructionMobileShell/);
  assert.match(leavesPageSource, /StorePageHeader/);
  assert.doesNotMatch(offlinePageSource, /ConstructionMobileBottomNav/);
  assert.match(offlinePageSource, /StorePageHeader/);
  assert.match(offlinePageSource, /constructionApi\.offlineSync/);
  assert.doesNotMatch(profilePageSource, /ConstructionMobileShell/);
  assert.match(profilePageSource, /StorePageHeader/);
  const cssSource = readFileSync("app/globals.css", "utf8");
  assert.doesNotMatch(cssSource, /\.construction-mobile-tabs/);
  assert.doesNotMatch(cssSource, /\.construction-mobile-tab--camera/);
});

test("construction worker pages no longer redirect desktop web users through a mobile shell", () => {
  const schedulesPageSource = readFileSync("app/construction/schedules/page.tsx", "utf8");
  const cameraPageSource = readFileSync("app/construction/camera/page.tsx", "utf8");
  const materialsPageSource = readFileSync("app/construction/materials/page.tsx", "utf8");
  const offlinePageSource = readFileSync("app/construction/offline/page.tsx", "utf8");
  const profilePageSource = readFileSync("app/construction/profile/page.tsx", "utf8");

  assert.equal(existsSync("src/features/construction/mobile-shell.tsx"), false);
  assert.doesNotMatch(schedulesPageSource, /desktopHref="\/construction\/capacities"/);
  assert.doesNotMatch(cameraPageSource, /desktopHref="\/construction\/assignments"/);
  assert.match(cameraPageSource, /StorePageHeader/);
  assert.doesNotMatch(materialsPageSource, /desktopHref="\/inventory"/);
  assert.match(materialsPageSource, /StorePageHeader/);
  assert.doesNotMatch(offlinePageSource, /window\.matchMedia\("\(min-width: 901px\)"\)/);
  assert.doesNotMatch(offlinePageSource, /router\.replace\("\/construction\/assignments"\)/);
  assert.match(offlinePageSource, /StorePageHeader/);
  assert.doesNotMatch(profilePageSource, /desktopHref="\/profile"/);
  assert.match(profilePageSource, /StorePageHeader/);
});

test("construction profile page shows worker archive instead of offline settings", () => {
  const pageSource = readFileSync("app/construction/profile/page.tsx", "utf8");
  const navigationSource = readFileSync("src/features/workbench/navigation.ts", "utf8");
  const shellSource = readFileSync("src/features/workbench/management-shell.tsx", "utf8");

  assert.match(pageSource, /施工档案/);
  assert.match(pageSource, /施工履约档案/);
  assert.match(pageSource, /照片与质检归档/);
  assert.match(pageSource, /constructionApi\.assignments/);
  assert.match(pageSource, /getWorkerTaskStatusLabel/);
  assert.match(pageSource, /getWorkerPhotoStageLabel/);
  assert.match(pageSource, /storeMember\?\.store\.name \?\? "未加入门店"/);
  assert.match(navigationSource, /查看施工记录、照片和质检档案/);
  assert.match(shellSource, /搜索工单、照片或质检记录/);
  assert.doesNotMatch(pageSource, /连接与离线设置/);
  assert.doesNotMatch(pageSource, /当前网络状态/);
  assert.doesNotMatch(pageSource, /延迟 \(Ping\)/);
  assert.doesNotMatch(pageSource, /离线缓存空间/);
});

test("construction materials page follows the prototype material management entry", () => {
  const materialsPagePath = "app/construction/materials/page.tsx";

  assert.equal(existsSync(materialsPagePath), true);

  const pageSource = readFileSync(materialsPagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(pageSource, /ConstructionMobileShell/);
  assert.match(pageSource, /StorePageHeader/);
  assert.match(pageSource, /施工物料辅助工作台/);
  assert.match(pageSource, /worker-materials-page/);
  assert.match(pageSource, /worker-materials-hero/);
  assert.match(pageSource, /construction-materials-workspace/);
  assert.match(pageSource, /construction-materials-summary/);
  assert.match(pageSource, /construction-materials-card/);
  assert.match(pageSource, /construction-materials-batch/);
  assert.match(pageSource, /construction-materials-actions/);
  assert.match(pageSource, /待领物料/);
  assert.match(pageSource, /批次追溯/);
  assert.match(pageSource, /扫码核验/);
  assert.match(pageSource, /物料准备清单/);
  assert.match(pageSource, /标签核对/);
  assert.match(pageSource, /辅助入口/);
  assert.match(pageSource, /异常损耗记录后同步库存流水/);
  assert.doesNotMatch(pageSource, /异常损耗后续进入库存流水/);
  assert.doesNotMatch(pageSource, /施工照片上传/);
  assert.doesNotMatch(pageSource, /膜箱照片/);
  assert.doesNotMatch(pageSource, /膜桶照片/);
  assert.match(pageSource, /constructionApi\.orderMaterials/);
  assert.match(pageSource, /constructionApi\.verifyMaterialBatch/);
  assert.match(pageSource, /constructionApi\.pickupMaterials/);
  assert.match(pageSource, /pendingAllocationIds/);
  assert.match(pageSource, /batch\) => !batch\.pickedUp/);
  assert.match(pageSource, /hasPendingPickup/);
  assert.doesNotMatch(pageSource, /allAllocationIds/);
  assert.match(pageSource, /constructionApi\.recordMaterialLoss/);
  assert.doesNotMatch(pageSource, /const materialBatches/);
  assert.doesNotMatch(pageSource, /MB20260614008/);
  assert.doesNotMatch(pageSource, /XPEL Ultimate Plus/);
  assert.doesNotMatch(pageSource, /router\.push\("\/construction\/camera"\)/);
  assert.match(pageSource, /router\.push\("\/inventory\/movements"\)/);
  assert.match(pageSource, /router\.push\("\/construction\/tasks"\)/);
  assert.match(cssSource, /\.worker-materials-page/);
  assert.match(cssSource, /\.worker-materials-hero/);
  assert.match(cssSource, /\.construction-materials-workspace/);
  assert.match(cssSource, /\.construction-materials-summary/);
  assert.match(cssSource, /\.construction-materials-card/);
  assert.match(cssSource, /\.construction-materials-batch/);
  assert.match(cssSource, /\.construction-materials-actions/);
});

test("construction camera and leave pages expose prototype quick actions in web layout", () => {
  const cameraPageSource = readFileSync("app/construction/camera/page.tsx", "utf8");
  const leavesPageSource = readFileSync("app/construction/leaves/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cameraPageSource, /施工照片凭证/);
  assert.match(cameraPageSource, /选择施工任务/);
  assert.match(cameraPageSource, /施工照片上传/);
  assert.doesNotMatch(cameraPageSource, /ConstructionMobileShell/);
  assert.doesNotMatch(cameraPageSource, /from "next\/image"/);
  assert.doesNotMatch(cameraPageSource, /prototype-assets/);
  assert.match(cameraPageSource, /StorePageHeader/);
  assert.match(cameraPageSource, /worker-camera-page/);
  assert.match(cameraPageSource, /worker-camera-hero/);
  assert.match(cameraPageSource, /construction-camera-workspace/);
  assert.match(cameraPageSource, /construction-camera-offline-banner/);
  assert.match(cameraPageSource, /construction-camera-upload-section/);
  assert.match(cameraPageSource, /construction-camera-photo-card/);
  assert.match(cameraPageSource, /construction-camera-preview/);
  assert.match(cameraPageSource, /construction-camera-upload-placeholder/);
  assert.match(cameraPageSource, /construction-camera-gallery/);
  assert.match(cameraPageSource, /construction-camera-bottom-actions/);
  assert.match(cameraPageSource, /膜箱照片/);
  assert.match(cameraPageSource, /膜桶照片/);
  assert.match(cameraPageSource, /施工过程照片/);
  assert.match(cameraPageSource, /constructionApi\.assignments/);
  assert.match(cameraPageSource, /constructionApi\.uploadPhoto/);
  assert.match(cameraPageSource, /getWorkerPhotoStageLabel/);
  assert.match(leavesPageSource, /请假申请/);
  assert.match(leavesPageSource, /construction-leave-workspace/);
  assert.doesNotMatch(leavesPageSource, /ConstructionMobileShell/);
  assert.match(leavesPageSource, /StorePageHeader/);
  assert.match(leavesPageSource, /提交请假申请/);
  assert.match(leavesPageSource, /construction-leave-application-panel/);
  assert.match(leavesPageSource, /worker-leave-page/);
  assert.match(leavesPageSource, /worker-leave-summary/);
  assert.match(leavesPageSource, /worker-leave-grid/);
  assert.match(leavesPageSource, /DatePicker\.RangePicker/);
  assert.match(leavesPageSource, /construction-leave-rule-card/);
  assert.match(leavesPageSource, /construction-leave-history-card/);
  assert.match(leavesPageSource, /constructionApi\.createLeave/);
  assert.match(leavesPageSource, /constructionApi\.leaves/);
  assert.match(leavesPageSource, /getWorkerLeaveStatusLabel/);
  assert.match(leavesPageSource, /请假时间/);
  assert.match(leavesPageSource, /请假类型/);
  assert.match(leavesPageSource, /请假事由/);
  assert.match(leavesPageSource, /事假/);
  assert.match(leavesPageSource, /病假/);
  assert.match(leavesPageSource, /年假/);
  assert.match(leavesPageSource, /其他/);
  assert.match(leavesPageSource, /审批通过后/);
  assert.match(leavesPageSource, /item\.workerId === workerId \|\| item\.worker\?\.id === workerId/);
  assert.match(cssSource, /\.construction-camera-workspace/);
  assert.match(cssSource, /\.construction-camera-offline-banner/);
  assert.match(cssSource, /\.construction-camera-upload-section/);
  assert.match(cssSource, /\.construction-camera-photo-card/);
  assert.match(cssSource, /\.construction-camera-preview/);
  assert.match(cssSource, /\.construction-camera-upload-placeholder/);
  assert.match(cssSource, /\.construction-camera-gallery/);
  assert.match(cssSource, /\.construction-camera-bottom-actions/);
  assert.match(cssSource, /\.worker-camera-page/);
  assert.match(cssSource, /\.worker-camera-hero/);
  assert.match(cssSource, /\.worker-camera-grid/);
  assert.match(cssSource, /\.construction-leave-workspace/);
  assert.match(cssSource, /\.construction-leave-application-panel/);
  assert.match(cssSource, /\.worker-leave-page/);
  assert.match(cssSource, /\.worker-leave-summary/);
  assert.match(cssSource, /\.worker-leave-grid/);
  assert.match(cssSource, /\.construction-leave-rule-card/);
  assert.match(cssSource, /\.construction-leave-history-card/);
});

test("construction schedules page follows the prototype weekly schedule layout", () => {
  const pageSource = readFileSync("app/construction/schedules/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(pageSource, /ConstructionMobileShell/);
  assert.match(pageSource, /StorePageHeader/);
  assert.match(pageSource, /worker-schedule-page/);
  assert.match(pageSource, /worker-schedule-summary/);
  assert.match(pageSource, /worker-schedule-grid/);
  assert.match(pageSource, /我的排班/);
  assert.match(pageSource, /请假申请/);
  assert.match(pageSource, /我的当日记录/);
  assert.match(pageSource, /weekDays/);
  assert.match(pageSource, /construction-schedule-week/);
  assert.match(pageSource, /construction-schedule-card/);
  assert.match(pageSource, /getWorkerScheduleStatusLabel/);
  assert.match(cssSource, /\.worker-schedule-page/);
  assert.match(cssSource, /\.worker-schedule-summary/);
  assert.match(cssSource, /\.worker-schedule-grid/);
  assert.match(cssSource, /\.construction-schedule-week/);
  assert.match(cssSource, /\.construction-schedule-card/);
});

test("construction schedules page avoids future implementation copy", () => {
  const pageSource = readFileSync("app/construction/schedules/page.tsx", "utf8");

  assert.match(pageSource, /用于补充外出、休息或店内可施工状态。正式请假请走请假申请。/);
  assert.match(pageSource, /查看周排班、当日安排和本人出勤状态/);
  assert.doesNotMatch(pageSource, /审批流后续接入/);
  assert.doesNotMatch(pageSource, /完整历史筛选后续接入/);
});

test("construction schedules page uses business-safe copy for unknown schedule status", () => {
  const pageSource = readFileSync("app/construction/schedules/page.tsx", "utf8");

  assert.match(pageSource, /getWorkerScheduleStatusLabel/);
  assert.match(pageSource, /排班说明待确认/);
  assert.doesNotMatch(pageSource, /\?\? status/);
});

test("construction schedules page renders prototype task-style schedule cards", () => {
  const pageSource = readFileSync("app/construction/schedules/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(pageSource, /variant="calendar"/);
  assert.match(pageSource, /construction-schedule-task-card/);
  assert.match(pageSource, /construction-schedule-task-section/);
  assert.match(pageSource, /construction-schedule-task-main/);
  assert.match(pageSource, /construction-schedule-task-meta/);
  assert.match(pageSource, /getScheduleTaskTitle/);
  assert.match(pageSource, /getScheduleTaskMeta/);
  assert.match(pageSource, /useRouter/);
  assert.match(pageSource, /查看任务/);
  assert.match(pageSource, /查看排班/);
  assert.match(pageSource, /router\.push\("\/construction\/tasks"\)/);
  assert.match(cssSource, /\.construction-schedule-task-card/);
  assert.match(cssSource, /\.construction-schedule-task-section/);
  assert.match(cssSource, /\.construction-schedule-task-main/);
  assert.match(cssSource, /\.construction-schedule-task-meta/);
  assert.match(cssSource, /\.worker-schedule-mobile-cards/);
  assert.equal(existsSync("src/features/construction/mobile-shell.tsx"), false);
});

test("construction offline page follows the prototype upload queue layout", () => {
  const pageSource = readFileSync("app/construction/offline/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(pageSource, /ConstructionMobileBottomNav/);
  assert.doesNotMatch(pageSource, /construction-mobile-shell construction-offline-mobile-shell/);
  assert.match(pageSource, /StorePageHeader/);
  assert.match(pageSource, /worker-offline-page/);
  assert.match(pageSource, /worker-offline-grid/);
  assert.match(pageSource, /construction-offline-alert/);
  assert.match(pageSource, /construction-offline-status-card/);
  assert.match(pageSource, /construction-offline-actions/);
  assert.match(pageSource, /construction-offline-order-group/);
  assert.match(pageSource, /construction-offline-queue-item/);
  assert.match(pageSource, /construction-offline-state-badge/);
  assert.match(pageSource, /construction-offline-table-card/);
  assert.match(pageSource, /construction-offline-mobile-cards/);
  assert.match(pageSource, /construction-offline-group/);
  assert.match(pageSource, /construction-offline-progress/);
  assert.match(pageSource, /offlinePreviewQueue/);
  assert.match(pageSource, /groupOfflineQueue/);
  assert.match(pageSource, /离线上传队列/);
  assert.match(pageSource, /订单 #/);
  assert.match(pageSource, /重试同步/);
  assert.match(pageSource, /预计还需/);
  assert.match(pageSource, /lastSyncStorageKey/);
  assert.match(pageSource, /清理缓存/);
  assert.match(pageSource, /Table/);
  assert.doesNotMatch(pageSource, /from "next\/image"/);
  assert.match(cssSource, /\.worker-offline-page/);
  assert.match(cssSource, /\.worker-offline-grid/);
  assert.match(cssSource, /\.construction-offline-alert/);
  assert.match(cssSource, /\.construction-offline-status-card/);
  assert.match(cssSource, /\.construction-offline-actions/);
  assert.match(cssSource, /\.construction-offline-order-group/);
  assert.match(cssSource, /\.construction-offline-queue-item/);
  assert.match(cssSource, /\.construction-offline-state-badge/);
  assert.match(cssSource, /\.construction-offline-table-card/);
  assert.match(cssSource, /\.construction-offline-mobile-cards/);
  assert.match(cssSource, /\.construction-offline-group/);
  assert.match(cssSource, /\.construction-offline-progress/);
});

test("construction profile page follows the archive workspace", () => {
  const pageSource = readFileSync("app/construction/profile/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.doesNotMatch(pageSource, /ConstructionMobileShell/);
  assert.match(pageSource, /StorePageHeader/);
  assert.match(pageSource, /worker-profile-page/);
  assert.match(pageSource, /worker-profile-grid/);
  assert.match(pageSource, /worker-archive-hero/);
  assert.match(pageSource, /worker-archive-kpis/);
  assert.match(pageSource, /worker-archive-main-card/);
  assert.match(pageSource, /worker-archive-photo-card/);
  assert.match(pageSource, /worker-archive-capability-card/);
  assert.match(pageSource, /参与工单/);
  assert.match(pageSource, /已完工/);
  assert.match(pageSource, /照片凭证/);
  assert.match(pageSource, /质检通过/);
  assert.match(pageSource, /最近施工记录/);
  assert.match(pageSource, /照片阶段统计/);
  assert.match(pageSource, /router\.push\("\/construction\/tasks"\)/);
  assert.match(pageSource, /router\.push\("\/construction\/schedules"\)/);
  assert.match(pageSource, /router\.push\(`\/workbench\/\$\{storeMember\.store\.id\}`\)/);
  assert.doesNotMatch(pageSource, /查看离线队列/);
  assert.doesNotMatch(pageSource, /立即同步/);
  assert.doesNotMatch(pageSource, /清理缓存/);
  assert.doesNotMatch(pageSource, /v\d+\.\d+\.\d+-dev/);
  assert.doesNotMatch(pageSource, /localhost:3001/);
  assert.match(cssSource, /\.worker-profile-page/);
  assert.match(cssSource, /\.worker-profile-grid/);
  assert.match(cssSource, /\.worker-archive-hero/);
  assert.match(cssSource, /\.worker-archive-kpis/);
  assert.match(cssSource, /\.worker-archive-main-card/);
  assert.match(cssSource, /\.worker-archive-photo-card/);
  assert.match(cssSource, /\.worker-archive-capability-card/);
});
