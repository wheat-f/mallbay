# Mini Requirements Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining gaps between the current `apps/mini` implementation and the Phase 6 mini-program requirements by improving cached task data quality, material task selection, and acceptance traceability.

**Architecture:** Keep `apps/mini` as the WeChat mini-program entry and keep Web desktop worker pages separate. Reuse the existing storage keys and API boundaries; do not add database tables. Extend mini data mapping and page state only where the requirement gap exists.

**Tech Stack:** WeChat mini-program pages (`.js/.wxml/.wxss`), TypeScript helper tests under `apps/mini/src`, Node test runner via `tsx`, existing MallBay construction and after-sales APIs.

---

## Scope

This plan implements the product gaps found in the mini-program requirements review:

1. Task sync should cache real customer and vehicle summaries instead of placeholder text when the API response contains them.
2. Material verification should support selecting a specific cached construction task instead of always using the first task.
3. Documentation should provide an explicit mini requirements coverage matrix and manual acceptance record template.
4. Verification should cover mini tests/typecheck and ensure no local browser/output artifacts are committed.

This plan does not implement WeChat platform configuration, real AppID/AppSecret setup, HTTPS domain registration, upload domain registration, or production release. Those remain external execution items from `docs/features/phase-6-mini-program-integration-plan.md`.

## File Structure

- Modify `apps/mini/src/construction-task-view.ts`
  - Add typed helpers for building cached mini task rows from assignment API records.
  - Keep display helpers in one place so page JS and tests have the same expected behavior.

- Modify `apps/mini/src/construction-task-view.test.ts`
  - Add regression coverage for mapping order customer and vehicle summaries into `CachedConstructionTask`.
  - Keep existing page exposure tests.

- Modify `apps/mini/src/mini-construction-api.ts`
  - Use the shared task mapper for `pullAssignedTasks`.
  - Preserve support for both array and `{ items: [...] }` assignment responses.

- Modify `apps/mini/src/mini-construction-api.test.ts`
  - Update expected cached task data from placeholders to real customer and vehicle labels.

- Modify `apps/mini/pages/tasks/index.js`
  - Mirror the shared mapping logic for runtime mini-program code.
  - Store real customer and vehicle labels when available.

- Modify `apps/mini/pages/materials/index.js`
  - Add selected task state and task switching.
  - Load cached material data for the selected task.
  - Sync materials for the selected task only.

- Modify `apps/mini/pages/materials/index.wxml`
  - Add a task picker when more than one cached task exists.
  - Keep current task detail and sync button visible.

- Modify `apps/mini/pages/materials/index.wxss`
  - Style the task picker and keep the page readable on small screens.

- Modify `apps/mini/README.md`
  - Update the current capability statement to mention real customer/vehicle cache and selectable material task context.

- Create `docs/features/phase-6-mini-program-requirements-coverage.md`
  - Add a requirement-by-requirement matrix: implemented, partially implemented, external pending.
  - Add manual acceptance evidence fields.

- Modify `docs/README.md`
  - Add the new coverage document to the documentation index.

---

### Task 1: Cache Real Customer And Vehicle Data For Mini Tasks

**Files:**
- Modify: `apps/mini/src/construction-task-view.ts`
- Modify: `apps/mini/src/construction-task-view.test.ts`
- Modify: `apps/mini/src/mini-construction-api.ts`
- Modify: `apps/mini/src/mini-construction-api.test.ts`
- Modify: `apps/mini/pages/tasks/index.js`

- [ ] **Step 1: Add a failing mapper test for real customer and vehicle labels**

Add this test to `apps/mini/src/construction-task-view.test.ts` after the existing `cachedTasks` fixture tests:

```ts
test("toCachedConstructionTask maps assignment customer and vehicle summaries for offline use", async () => {
  const { toCachedConstructionTask } = await import("./construction-task-view");

  assert.deepEqual(
    toCachedConstructionTask({
      id: "record-10",
      orderId: "order-10",
      status: "DISPATCHED",
      order: {
        orderNo: "ORD20260621010",
        constructionType: "PPF",
        constructionLocation: "OUTSIDE",
        appointmentDate: "2026-06-21T00:00:00.000Z",
        appointmentTimeSlot: "09:00-12:00",
        outsideAddress: "长沙市岳麓区",
        customer: { name: "申周翰", phone: "13800000000" },
        vehicle: { plateNo: "湘A101ZQ", brand: "宝马", model: "5系", color: "黑色" }
      },
      photos: [{ stage: "BEFORE" }]
    }),
    {
      id: "record-10",
      orderId: "order-10",
      orderNo: "ORD20260621010",
      customerName: "申周翰",
      vehicleLabel: "湘A101ZQ / 宝马 / 5系 / 黑色",
      constructionType: "漆面保护膜",
      constructionLocation: "外出",
      appointmentDate: "2026-06-21",
      appointmentTimeSlot: "09:00-12:00",
      outsideAddress: "长沙市岳麓区",
      status: "DISPATCHED",
      photoStages: ["BEFORE"]
    }
  );
});
```

- [ ] **Step 2: Run the failing mini test**

Run:

```bash
corepack pnpm --filter @mallbay/mini test -- src/construction-task-view.test.ts
```

Expected: FAIL because `toCachedConstructionTask` is not exported from `construction-task-view.ts`.

- [ ] **Step 3: Implement shared assignment-to-cache mapping**

Add these exports to `apps/mini/src/construction-task-view.ts` below the `CachedWorkerSchedule` type:

```ts
export type MiniAssignmentRecord = {
  id?: string;
  orderId?: string;
  status?: CachedConstructionTaskStatus;
  order?: {
    orderNo?: string | null;
    constructionType?: string | null;
    constructionLocation?: string | null;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
    outsideAddress?: string | null;
    customer?: {
      name?: string | null;
      companyName?: string | null;
      contactName?: string | null;
      phone?: string | null;
    } | null;
    vehicle?: {
      plateNo?: string | null;
      brand?: string | null;
      model?: string | null;
      carModel?: string | null;
      color?: string | null;
    } | null;
  } | null;
  photos?: { stage?: ConstructionPhotoStage | null }[];
};
```

Add this function near the other exported helpers:

```ts
export function toCachedConstructionTask(record: MiniAssignmentRecord): CachedConstructionTask {
  const order = record.order ?? {};
  return {
    id: record.id ?? "",
    orderId: record.orderId ?? "",
    orderNo: order.orderNo ?? record.orderId ?? "",
    customerName: getCustomerLabel(order.customer),
    vehicleLabel: getVehicleLabel(order.vehicle),
    constructionType: getConstructionTypeLabel(order.constructionType),
    constructionLocation: getConstructionLocationLabel(order.constructionLocation),
    appointmentDate: formatDate(order.appointmentDate ?? undefined),
    appointmentTimeSlot: order.appointmentTimeSlot ?? undefined,
    outsideAddress: order.outsideAddress ?? undefined,
    status: record.status ?? "DISPATCHED",
    photoStages: (record.photos ?? []).map((photo) => photo.stage).filter(Boolean) as ConstructionPhotoStage[]
  };
}
```

Add these private helpers near the bottom of the file:

```ts
function getCustomerLabel(customer: MiniAssignmentRecord["order"] extends infer Order
  ? Order extends { customer?: infer Customer }
    ? Customer
    : never
  : never) {
  if (!customer || typeof customer !== "object") return "客户待同步";
  const item = customer as { name?: string | null; companyName?: string | null; contactName?: string | null; phone?: string | null };
  return item.name?.trim() || item.companyName?.trim() || item.contactName?.trim() || item.phone?.trim() || "客户待同步";
}

function getVehicleLabel(vehicle: MiniAssignmentRecord["order"] extends infer Order
  ? Order extends { vehicle?: infer Vehicle }
    ? Vehicle
    : never
  : never) {
  if (!vehicle || typeof vehicle !== "object") return "车辆待同步";
  const item = vehicle as { plateNo?: string | null; brand?: string | null; model?: string | null; carModel?: string | null; color?: string | null };
  return [item.plateNo, item.brand, item.model ?? item.carModel, item.color]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" / ") || "车辆待同步";
}

function getConstructionTypeLabel(value?: string | null) {
  const labels: Record<string, string> = {
    PPF: "漆面保护膜",
    COLOR_FILM: "改色膜",
    HEAT_FILM: "玻璃膜",
    INSPECTION: "复检"
  };
  return value ? labels[value] ?? value : "施工类型待同步";
}

function getConstructionLocationLabel(value?: string | null) {
  const labels: Record<string, string> = {
    IN_STORE: "到店",
    OUTSIDE: "外出"
  };
  return value ? labels[value] ?? value : "施工地点待同步";
}

function formatDate(value?: string) {
  if (!value) return undefined;
  return value.slice(0, 10);
}
```

- [ ] **Step 4: Remove duplicate mapping from `mini-construction-api.ts`**

Update `apps/mini/src/mini-construction-api.ts` imports:

```ts
import {
  toCachedConstructionTask,
  type CachedConstructionTask,
  type ConstructionPhotoStage
} from "./construction-task-view";
```

Delete the local `toCachedConstructionTask`, `getConstructionTypeLabel`, `getConstructionLocationLabel`, and `formatDate` functions from `apps/mini/src/mini-construction-api.ts`.

Keep this line unchanged in `pullAssignedTasks`:

```ts
const tasks = normalizeAssignmentsResponse(response).map(toCachedConstructionTask);
```

- [ ] **Step 5: Mirror the mapping in the runtime mini page**

In `apps/mini/pages/tasks/index.js`, replace the existing `toCachedTask(record)` function with:

```js
function toCachedTask(record) {
  const order = record.order || {};
  return {
    id: record.id || "",
    orderId: record.orderId || "",
    orderNo: order.orderNo || record.orderId || "",
    customerName: getCustomerLabel(order.customer),
    vehicleLabel: getVehicleLabel(order.vehicle),
    constructionType: getConstructionTypeLabel(order.constructionType),
    constructionLocation: getConstructionLocationLabel(order.constructionLocation),
    appointmentDate: order.appointmentDate ? order.appointmentDate.slice(0, 10) : "",
    appointmentTimeSlot: order.appointmentTimeSlot || "",
    outsideAddress: order.outsideAddress || "",
    status: record.status || "DISPATCHED",
    photoStages: (record.photos || []).map((photo) => photo.stage).filter(Boolean)
  };
}
```

Add these helper functions before `getConstructionTypeLabel`:

```js
function getCustomerLabel(customer) {
  if (!customer) return "客户待同步";
  return trimFirst([customer.name, customer.companyName, customer.contactName, customer.phone]) || "客户待同步";
}

function getVehicleLabel(vehicle) {
  if (!vehicle) return "车辆待同步";
  return [vehicle.plateNo, vehicle.brand, vehicle.model || vehicle.carModel, vehicle.color]
    .map((value) => (value || "").trim())
    .filter(Boolean)
    .join(" / ") || "车辆待同步";
}

function trimFirst(values) {
  return values.map((value) => (value || "").trim()).find(Boolean) || "";
}
```

- [ ] **Step 6: Update API helper test expectations**

In `apps/mini/src/mini-construction-api.test.ts`, update the first test input `order` to include:

```ts
customer: { name: "申周翰" },
vehicle: { plateNo: "湘A101ZQ", brand: "宝马", model: "5系", color: "黑色" }
```

Update the expected cached task fields:

```ts
customerName: "申周翰",
vehicleLabel: "湘A101ZQ / 宝马 / 5系 / 黑色",
```

- [ ] **Step 7: Run mini tests and typecheck**

Run:

```bash
corepack pnpm --filter @mallbay/mini test -- src/construction-task-view.test.ts src/mini-construction-api.test.ts
corepack pnpm --filter @mallbay/mini typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

```bash
git add apps/mini/src/construction-task-view.ts apps/mini/src/construction-task-view.test.ts apps/mini/src/mini-construction-api.ts apps/mini/src/mini-construction-api.test.ts apps/mini/pages/tasks/index.js
git commit -m "Improve mini task cache summaries"
```

---

### Task 2: Add Task Selection To Mini Materials Page

**Files:**
- Modify: `apps/mini/pages/materials/index.js`
- Modify: `apps/mini/pages/materials/index.wxml`
- Modify: `apps/mini/pages/materials/index.wxss`
- Modify: `apps/mini/src/construction-task-view.test.ts`

- [ ] **Step 1: Add failing page source assertions**

Append these assertions inside the existing `mini app exposes material verification and after-sales task entries` test in `apps/mini/src/construction-task-view.test.ts`:

```ts
assert.match(materialsPageSource, /selectedTaskIndex/);
assert.match(materialsPageSource, /onTaskChange/);
assert.match(materialsPageSource, /loadCachedMaterials\(currentTask && currentTask\.orderId\)/);
assert.match(readFileSync("pages/materials/index.wxml", "utf8"), /picker/);
assert.match(readFileSync("pages/materials/index.wxml", "utf8"), /bindchange="onTaskChange"/);
```

- [ ] **Step 2: Run the failing mini test**

Run:

```bash
corepack pnpm --filter @mallbay/mini test -- src/construction-task-view.test.ts
```

Expected: FAIL because `selectedTaskIndex` and `onTaskChange` are not implemented.

- [ ] **Step 3: Implement selected task state**

In `apps/mini/pages/materials/index.js`, replace the `data` object with:

```js
data: {
  tasks: [],
  taskOptions: [],
  selectedTaskIndex: 0,
  currentTask: null,
  materials: [],
  summary: null,
  syncing: false,
  emptyText: "暂无锁定物料，请先同步施工任务或完成库存匹配"
},
```

Replace `onShow()` with:

```js
onShow() {
  const tasks = wx.getStorageSync(TASK_CACHE_KEY) || [];
  const selectedTaskIndex = Math.min(this.data.selectedTaskIndex || 0, Math.max(tasks.length - 1, 0));
  const currentTask = tasks[selectedTaskIndex] || null;
  this.setData({
    tasks,
    taskOptions: tasks.map(toTaskOption),
    selectedTaskIndex,
    currentTask
  });
  this.loadCachedMaterials(currentTask && currentTask.orderId);
},
```

Add this method after `onShow()`:

```js
onTaskChange(event) {
  const selectedTaskIndex = Number(event.detail.value || 0);
  const currentTask = this.data.tasks[selectedTaskIndex] || null;
  this.setData({
    selectedTaskIndex,
    currentTask
  });
  this.loadCachedMaterials(currentTask && currentTask.orderId);
},
```

Add this helper near the bottom:

```js
function toTaskOption(task) {
  return [task.orderNo || task.orderId || "施工任务", task.customerName, task.vehicleLabel]
    .filter(Boolean)
    .join(" · ");
}
```

- [ ] **Step 4: Add picker markup**

In `apps/mini/pages/materials/index.wxml`, add this block above the current task summary:

```xml
<view class="task-picker-card" wx:if="{{taskOptions.length > 1}}">
  <text class="section-label">选择施工任务</text>
  <picker mode="selector" range="{{taskOptions}}" value="{{selectedTaskIndex}}" bindchange="onTaskChange">
    <view class="task-picker-value">{{taskOptions[selectedTaskIndex]}}</view>
  </picker>
</view>
```

Ensure the sync button and current task display continue to use `currentTask`.

- [ ] **Step 5: Add picker styling**

Append to `apps/mini/pages/materials/index.wxss`:

```css
.task-picker-card {
  margin-bottom: 20rpx;
  padding: 24rpx;
  border-radius: 18rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 30rpx rgba(15, 58, 95, 0.08);
}

.section-label {
  display: block;
  margin-bottom: 12rpx;
  color: #64748b;
  font-size: 24rpx;
}

.task-picker-value {
  min-height: 72rpx;
  padding: 18rpx 20rpx;
  border: 1rpx solid #dbe4ef;
  border-radius: 14rpx;
  color: #0f3a5f;
  font-size: 26rpx;
  background: #f8fafc;
}
```

- [ ] **Step 6: Run mini tests and typecheck**

Run:

```bash
corepack pnpm --filter @mallbay/mini test -- src/construction-task-view.test.ts
corepack pnpm --filter @mallbay/mini typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add apps/mini/pages/materials/index.js apps/mini/pages/materials/index.wxml apps/mini/pages/materials/index.wxss apps/mini/src/construction-task-view.test.ts
git commit -m "Add mini material task selector"
```

---

### Task 3: Add Mini Requirements Coverage Documentation

**Files:**
- Create: `docs/features/phase-6-mini-program-requirements-coverage.md`
- Modify: `docs/README.md`
- Modify: `apps/mini/README.md`

- [ ] **Step 1: Create requirements coverage document**

Create `docs/features/phase-6-mini-program-requirements-coverage.md` with:

```markdown
# Phase 6 微信小程序需求覆盖矩阵

- 文档类型：需求覆盖与验收记录
- 文档状态：待真机验收
- 适用范围：`apps/mini` 师傅端任务、施工拍照、离线队列、请假、排班、物料、售后任务、微信登录
- 来源依据：
  - [漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)
  - [Phase 6 微信小程序与离线功能说明](./phase-6-mini-offline.md)
  - [Phase 6 微信小程序联调与发布实施计划](./phase-6-mini-program-integration-plan.md)

## 覆盖结论

当前小程序已满足本地开发环境下的师傅端移动作业最小闭环。微信平台合法域名、HTTPS、uploadFile 域名、真实 AppID/AppSecret 和真机断网恢复属于外部验收项，不能仅凭代码视为发布完成。

## 需求矩阵

| 需求 | 当前状态 | 代码入口 | 验收方式 |
| --- | --- | --- | --- |
| 师傅任务列表 | 已实现 | `apps/mini/pages/tasks/index` | 同步后展示订单、客户、车辆、预约时间和施工状态 |
| 任务详情 | 已实现 | `apps/mini/pages/task-detail/index` | 打开任务可看到客户车辆快照、施工信息、状态动作和照片阶段 |
| 施工拍照离线队列 | 已实现 | `apps/mini/pages/task-detail/index` | 断网选择照片后生成 `PHOTO_UPLOAD` |
| 开工/完工离线队列 | 已实现 | `apps/mini/pages/task-detail/index` | 断网点击开工或完工后生成 `TASK_STATUS`，包含本地时间 |
| 请假离线提交 | 已实现 | `apps/mini/pages/leave/index` | 断网提交后生成 `LEAVE_REQUEST` |
| 离线重试 3 次 | 已实现 | `apps/mini/src/offline-queue.ts`、`apps/mini/src/mini-construction-api.ts` | 单测和手动同步失败验证 |
| 100 条缓存上限 | 已实现 | `apps/mini/pages/task-detail/index`、`apps/mini/pages/leave/index` | 队列满后提示“本地缓存已达上限，请联网同步后再继续操作” |
| 自动同步 | 已实现 | `apps/mini/app.js` | 小程序启动或回前台，配置完整且超过 60 秒后同步 |
| 排班同步 | 已实现 | `apps/mini/pages/schedule/index` | 同步并缓存本人排班 |
| 物料同步 | 已实现 | `apps/mini/pages/materials/index` | 选择施工任务后同步订单物料和锁定批次 |
| 售后任务 | 已实现 | `apps/mini/pages/after-sales/index`、`apps/mini/pages/after-sales-detail/index` | 同步分配给自己的售后任务并查看详情 |
| 微信 code 登录 | 代码已实现，待真机验收 | `apps/mini/pages/settings/index`、`apps/mini/src/mini-wechat-login.ts` | 使用真实 AppID 和绑定 openId 账号验收 |
| 合法域名和 HTTPS | 外部待执行 | 微信公众平台配置 | 真机 request/uploadFile 成功 |
| 发布审核 | 外部待执行 | 微信公众平台 | 按发布前检查清单验收 |

## 手工验收记录模板

| 验收项 | 结果 | 证据 | 日期 | 执行人 |
| --- | --- | --- | --- | --- |
| 开发者工具导入 `apps/mini` | 未执行 |  |  |  |
| 配置 API 地址、token、门店 ID 后同步任务 | 未执行 |  |  |  |
| 任务详情断网开工入队 | 未执行 |  |  |  |
| 任务详情断网完工入队 | 未执行 |  |  |  |
| 任务详情断网拍照入队 | 未执行 |  |  |  |
| 请假断网入队 | 未执行 |  |  |  |
| 恢复网络后同步成功项移除 | 未执行 |  |  |  |
| 失败项 3 次后标记同步失败 | 未执行 |  |  |  |
| 微信 code 登录返回 token 和门店上下文 | 未执行 |  |  |  |
| 真机 HTTPS request 域名通过 | 未执行 |  |  |  |
| 真机 uploadFile 域名通过 | 未执行 |  |  |  |
```

- [ ] **Step 2: Add docs index entry**

Add this line to `docs/README.md` near the other Phase 6 entries:

```markdown
- [features/phase-6-mini-program-requirements-coverage.md](./features/phase-6-mini-program-requirements-coverage.md)：Phase 6 微信小程序需求覆盖矩阵与验收记录。
```

- [ ] **Step 3: Update mini README capability wording**

In `apps/mini/README.md`, update the task and material bullets to:

```markdown
- 任务列表页可从 `/construction/assignments` 手动同步师傅任务并写入本地缓存，缓存包含订单、客户、车辆、预约时间、施工状态和照片进度，兼容数组响应和 `{ items: [...] }` 包装响应。
- 物料页通过 `GET /construction/orders/:orderId/materials` 按选中的施工任务同步订单物料和锁定批次，并写入 `mallbay_construction_materials_<orderId>`。
```

- [ ] **Step 4: Run docs checks**

Run:

```bash
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add docs/features/phase-6-mini-program-requirements-coverage.md docs/README.md apps/mini/README.md
git commit -m "Document mini program requirements coverage"
```

---

### Task 4: Final Verification And Browser-Free Mini Acceptance

**Files:**
- No code files required unless verification finds defects.

- [ ] **Step 1: Run mini verification**

Run:

```bash
corepack pnpm --filter @mallbay/mini test
corepack pnpm --filter @mallbay/mini typecheck
```

Expected:

- 34 or more tests pass.
- Typecheck exits 0.

- [ ] **Step 2: Run relevant API verification for shared contracts**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- src/construction/construction.service.test.ts src/auth/auth.service.test.ts
corepack pnpm --filter @mallbay/api typecheck
```

Expected:

- Construction material endpoint tests pass.
- WeChat login config tests pass.
- API typecheck exits 0.

- [ ] **Step 3: Run workspace hygiene checks**

Run:

```bash
corepack pnpm lint
git diff --check
git status --short
```

Expected:

- Lint exits 0. Existing warnings are acceptable only if there are no new errors.
- `git diff --check` exits 0.
- `git status --short` shows only intended tracked changes before commit; `.playwright-cli/` and `output/` must remain untracked and uncommitted.

- [ ] **Step 4: Commit any verification fixes**

If verification required fixes, commit them:

```bash
git add apps/mini docs/features docs/README.md
git commit -m "Stabilize mini requirements closure"
```

If no fixes were required, skip this step.

- [ ] **Step 5: Push branch**

Run:

```bash
git push origin codex/submit-store-use-case
```

Expected: remote branch updates successfully.

---

## Self-Review

Spec coverage:

- Phase 6 minimum task list/detail/photo/offline/leave/sync requirements are covered by existing implementation and preserved by Tasks 1 and 4.
- Customer/vehicle offline cache quality gap is covered by Task 1.
- Material task selection gap is covered by Task 2.
- External WeChat platform and true-device release requirements are documented, not implemented, by Task 3.

Placeholder scan:

- This plan contains no `TBD`, no unspecified “add tests” steps, and no unresolved implementation placeholders.

Type consistency:

- `CachedConstructionTask`, `ConstructionPhotoStage`, and `MiniAssignmentRecord` are defined in `apps/mini/src/construction-task-view.ts`.
- Runtime page JS mirrors the TypeScript helper behavior without adding a build-time dependency from mini page JS to TypeScript source.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-21-mini-requirements-gap-closure.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

