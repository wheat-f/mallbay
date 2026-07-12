# Web And Mini Worker Capability Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild worker-facing capabilities so Web has complete desktop business pages and Mini has complete WeChat mini program mobile entry pages, with no Web-only mobile shell as the source of truth.

**Architecture:** Web and Mini are two entry channels for the same construction/field-service capabilities. Web owns desktop management and desktop worker self-service pages under the management shell. Mini owns phone-first WeChat workflows. Both channels share API contracts, status labels, permission rules, and offline-sync semantics where applicable.

**Tech Stack:** Next.js App Router and Ant Design in `apps/web`; WeChat Mini Program pages in `apps/mini`; shared API/domain helpers in `packages/shared` where practical; NestJS construction/after-sales APIs in `apps/api`.

---

## Corrected Product Principle

The previous migration direction treated Web mobile pages as something to retire after Mini parity. That was incomplete.

The corrected principle is:

- Web does not need mobile-only施工端 shells or bottom navigation.
- Web must still implement the same施工人员 business capabilities as desktop pages.
- Mini is not a replacement for Web functionality; it is a new mobile entry path that will be published as a WeChat mini program.
- Features that currently exist only in Web mobile pages must be split into:
  - Web desktop implementation.
  - Mini mobile implementation.
  - Shared API/domain behavior.

## Current Findings

### Mini Already Has

- `apps/mini/pages/tasks/index`: construction task list from cached assignments.
- `apps/mini/pages/task-detail/index`: task detail, offline start/complete, photo enqueue.
- `apps/mini/pages/offline/index`: offline queue and sync.
- `apps/mini/pages/leave/index`: offline leave request.
- `apps/mini/pages/settings/index`: API config, token/store config, WeChat login.

### Web Has Mobile-Only Or Mobile-First Implementations That Need Desktop Parity

| Capability | Current Web file | Current issue | Web target | Mini target |
| --- | --- | --- | --- | --- |
| My construction tasks | `apps/web/app/construction/tasks/page.tsx` | Rendered through `ConstructionMobileShell`, not a desktop management page | Keep route but rebuild as desktop worker task center | Keep/improve `pages/tasks/index` |
| Task detail and execution | `apps/web/app/construction/tasks/[id]/page.tsx` | Mobile layout owns start/complete/photo workflow | Keep route but rebuild as desktop task execution detail | Keep/improve `pages/task-detail/index` |
| Offline queue | `apps/web/app/construction/offline/page.tsx` | Web mobile page owns offline queue preview; desktop Web should not simulate phone offline storage | Replace with desktop diagnostic/help page or link to Mini usage; operational offline remains Mini | Keep/improve `pages/offline/index` |
| Leave request | `apps/web/app/construction/leaves/page.tsx` | Mobile self-service page exists; manager approval already exists separately | Rebuild as desktop worker leave request/history page | Keep/improve `pages/leave/index` |
| Worker schedule | `apps/web/app/construction/schedules/page.tsx` | Mobile layout mixes worker schedule and leave form | Rebuild as desktop worker schedule page; manager capacity remains `/construction/capacities` | Add `pages/schedule/index` |
| Photo capture hub | `apps/web/app/construction/camera/page.tsx` | Mostly static prototype assets; Web cannot be phone camera source of truth | Fold into desktop task detail as evidence upload/records, not a separate mobile route | Use task detail `wx.chooseMedia` as source |
| Materials and batch verification | `apps/web/app/construction/materials/page.tsx` | Static mobile mock; no real API workflow | Implement desktop worker material checklist/batch verification page or panel | Add `pages/materials/index` after API contract |
| Worker profile/settings | `apps/web/app/construction/profile/page.tsx` | Mobile connection/cache settings page | Rebuild as desktop worker profile/self-service page or redirect to `/profile` plus worker panels | Keep settings/offline in Mini |
| After-sales mobile tasks | `apps/web/app/after-sales/tasks/page.tsx` | Mobile-only after-sales task center | Rebuild as desktop after-sales task board for assigned staff | Add Mini after-sales pages if field after-sales is required |
| Web mobile shell | `apps/web/src/features/construction/mobile-shell.tsx` | Web-specific phone shell duplicates Mini navigation | Remove after desktop pages no longer depend on it | Not applicable |

### Not In Scope For Migration

Responsive backend card classes such as `customers-mobile-cards`, `inventory-overview-order-cards`, `members-mobile-cards`, and similar table-to-card patterns remain in Web. They are responsive desktop admin layouts, not standalone mobile app features.

---

## Target Information Architecture

### Web Desktop Routes

Keep or add these routes as desktop pages:

- `/construction/tasks`: “我的施工任务”, worker self-service desktop task list.
- `/construction/tasks/[id]`: desktop task execution detail with start, complete, photo evidence, status history.
- `/construction/leaves`: worker leave request and history page.
- `/construction/schedules`: worker schedule page.
- `/construction/materials`: worker material checklist and batch verification page after API contract.
- `/construction/profile`: worker profile, task preferences, account context, and mini entry help.
- `/after-sales/tasks`: desktop assigned after-sales task board.

Manager pages stay unchanged:

- `/construction/assignments`: dispatch queue.
- `/construction/capacities`: capacity and scheduling management.
- `/construction/leave-approvals`: leave approval.
- `/construction/orders/[id]`: manager construction order detail.
- `/after-sales`: after-sales management.

### Mini Routes

Mini should include:

- `pages/tasks/index`: mobile task list.
- `pages/task-detail/index`: mobile execution detail.
- `pages/offline/index`: offline queue.
- `pages/leave/index`: leave request.
- `pages/schedule/index`: schedule view.
- `pages/materials/index`: material checklist and scan verification.
- `pages/settings/index`: connection, login, store context.
- `pages/after-sales/index`: assigned after-sales tasks, if field after-sales is part of mobile scope.
- `pages/after-sales-detail/index`: after-sales processing detail, if above is included.

---

## Shared Domain Contracts

Create shared view helpers so Web and Mini do not drift:

- Construction task status labels.
- Photo stage labels and required-stage rules.
- Worker task segmentation: today, pending, active, completed.
- Leave status labels.
- Schedule status labels.
- Material verification labels once contract exists.
- After-sales status labels where mobile field after-sales is implemented.

Preferred locations:

- `packages/shared/src/construction-worker.ts`
- `packages/shared/src/after-sales-worker.ts`

Only move pure functions and types here. Do not move React, Ant Design, or WeChat runtime code.

---

## Task 1: Shared Worker Domain Helpers

**Files:**
- Create: `packages/shared/src/construction-worker.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/construction-worker.test.ts`
- Modify: `apps/web/src/features/construction/display.ts`
- Modify: `apps/mini/src/construction-task-view.ts`
- Modify: `apps/mini/src/construction-task-view.test.ts`

- [ ] **Step 1: Write failing shared helper tests**

Add `packages/shared/src/construction-worker.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkerTaskSegments,
  getConstructionPhotoStageLabel,
  getConstructionTaskStatusLabel,
  getLeaveRequestStatusLabel,
  getScheduleStatusLabel,
  type WorkerTaskSummary
} from "./construction-worker";

test("construction worker labels are shared across web and mini", () => {
  assert.equal(getConstructionTaskStatusLabel("DISPATCHED"), "待开工");
  assert.equal(getConstructionTaskStatusLabel("IN_CONSTRUCTION"), "施工中");
  assert.equal(getConstructionTaskStatusLabel("COMPLETED"), "已完工");
  assert.equal(getConstructionPhotoStageLabel("BEFORE"), "施工前");
  assert.equal(getLeaveRequestStatusLabel("PENDING"), "待审批");
  assert.equal(getScheduleStatusLabel("OUTSIDE"), "外出施工");
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
});
```

- [ ] **Step 2: Run shared tests and verify they fail**

Run:

```bash
corepack pnpm --filter @mallbay/shared test -- src/construction-worker.test.ts
```

Expected: fail because `construction-worker.ts` does not exist yet.

- [ ] **Step 3: Implement shared helpers**

Create `packages/shared/src/construction-worker.ts`:

```ts
export type WorkerTaskStatus = "DISPATCHED" | "PENDING_DISPATCH" | "IN_CONSTRUCTION" | "COMPLETED";
export type ConstructionPhotoStage = "BEFORE" | "DURING" | "AFTER";
export type LeaveRequestStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ScheduleStatus = "WORKING" | "OUTSIDE" | "REST";
export type WorkerTaskSegmentKey = "today" | "pending" | "active" | "completed";

export type WorkerTaskSummary = {
  id: string;
  orderId: string;
  status: WorkerTaskStatus | string;
  appointmentDate?: string | null;
};

export function getConstructionTaskStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING_DISPATCH: "待派工",
    DISPATCHED: "待开工",
    IN_CONSTRUCTION: "施工中",
    COMPLETED: "已完工"
  };
  return labels[status] ?? "状态待确认";
}

export function getConstructionPhotoStageLabel(stage: string) {
  const labels: Record<string, string> = {
    BEFORE: "施工前",
    DURING: "施工中",
    AFTER: "施工后"
  };
  return labels[stage] ?? "照片阶段待确认";
}

export function getLeaveRequestStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "待审批",
    APPROVED: "已批准",
    REJECTED: "已驳回"
  };
  return labels[status] ?? "审批状态待确认";
}

export function getScheduleStatusLabel(status: string) {
  const labels: Record<string, string> = {
    WORKING: "店内排班",
    OUTSIDE: "外出施工",
    REST: "休息"
  };
  return labels[status] ?? "排班状态待确认";
}

export function buildWorkerTaskSegments(rows: WorkerTaskSummary[], today = new Date().toISOString().slice(0, 10)) {
  return [
    { key: "today" as const, label: "今日任务", count: rows.filter((row) => row.appointmentDate?.slice(0, 10) === today).length },
    { key: "pending" as const, label: "待开工", count: rows.filter((row) => row.status === "DISPATCHED" || row.status === "PENDING_DISPATCH").length },
    { key: "active" as const, label: "施工中", count: rows.filter((row) => row.status === "IN_CONSTRUCTION").length },
    { key: "completed" as const, label: "已完成", count: rows.filter((row) => row.status === "COMPLETED").length }
  ];
}

export function filterWorkerTasks(rows: WorkerTaskSummary[], segment: WorkerTaskSegmentKey, today = new Date().toISOString().slice(0, 10)) {
  if (segment === "today") return rows.filter((row) => row.appointmentDate?.slice(0, 10) === today);
  if (segment === "pending") return rows.filter((row) => row.status === "DISPATCHED" || row.status === "PENDING_DISPATCH");
  if (segment === "active") return rows.filter((row) => row.status === "IN_CONSTRUCTION");
  return rows.filter((row) => row.status === "COMPLETED");
}
```

Export from `packages/shared/src/index.ts`:

```ts
export * from "./construction-worker";
```

- [ ] **Step 4: Use helpers in Web and Mini**

Replace duplicate label helpers in:

- `apps/web/src/features/construction/display.ts`
- `apps/mini/src/construction-task-view.ts`

Keep UI-specific colors in app-local files.

- [ ] **Step 5: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/shared test -- src/construction-worker.test.ts
corepack pnpm --filter @mallbay/mini test -- src/construction-task-view.test.ts
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
```

---

## Task 2: Rebuild Web `/construction/tasks` As Desktop Worker Task Center

**Files:**
- Modify: `apps/web/app/construction/tasks/page.tsx`
- Modify: `apps/web/src/features/construction/tasks-page.test.ts`
- Modify: `apps/web/app/globals.css`
- Reuse: `apps/web/src/features/workbench/management-shell.tsx`

- [ ] **Step 1: Write failing tests**

Update `tasks-page.test.ts`:

```ts
test("web construction tasks page is a desktop worker task center, not the mobile shell", () => {
  const source = readFileSync("app/construction/tasks/page.tsx", "utf8");
  assert.doesNotMatch(source, /ConstructionMobileShell/);
  assert.match(source, /StorePageHeader/);
  assert.match(source, /我的施工任务/);
  assert.match(source, /今日任务/);
  assert.match(source, /待开工/);
  assert.match(source, /施工中/);
  assert.match(source, /已完成/);
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
```

Expected: fail because the current page imports `ConstructionMobileShell`.

- [ ] **Step 3: Implement desktop page**

Replace the page with a management-shell compatible desktop layout:

- `StorePageHeader` title: `我的施工任务`
- subtitle: `查看派工任务、开工状态、照片凭证和完工记录`
- KPI cards: 今日任务、待开工、施工中、已完成
- filter segmented buttons using shared `buildWorkerTaskSegments`
- table columns: 订单号、预约、地点、状态、照片进度、操作
- mobile responsive cards are allowed as backend responsive layout, but no phone shell or bottom nav.

Actions:

- `查看执行详情` -> `/construction/tasks/${row.orderId}`
- `开工` -> `constructionApi.startOrder(row.orderId)`
- `完工` -> `constructionApi.completeOrder(row.orderId, new Date().toISOString())`

- [ ] **Step 4: Add CSS**

Add scoped classes:

- `.worker-task-center-page`
- `.worker-task-center-kpis`
- `.worker-task-center-filters`
- `.worker-task-center-table`
- `.worker-task-center-mobile-cards`

Do not use `.construction-mobile-*`.

- [ ] **Step 5: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
corepack pnpm --filter @mallbay/web typecheck
git diff --check
```

---

## Task 3: Rebuild Web `/construction/tasks/[id]` As Desktop Execution Detail

**Files:**
- Modify: `apps/web/app/construction/tasks/[id]/page.tsx`
- Modify: `apps/web/src/features/construction/tasks-page.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing tests**

Add:

```ts
test("web construction task detail is desktop execution detail", () => {
  const source = readFileSync("app/construction/tasks/[id]/page.tsx", "utf8");
  assert.doesNotMatch(source, /ConstructionMobileShell/);
  assert.match(source, /施工任务详情/);
  assert.match(source, /照片凭证/);
  assert.match(source, /开工/);
  assert.match(source, /提交完工/);
});
```

- [ ] **Step 2: Implement desktop detail**

Layout:

- return button: `返回我的施工任务`
- header: order number, status, appointment time, location
- left/main: task detail, photo requirements, upload evidence
- right: execution timeline, start/complete actions, related order link

Keep existing API operations:

- `constructionApi.assignments({ storeId })`
- `constructionApi.startOrder(params.id)`
- `constructionApi.completeOrder(params.id, new Date().toISOString())`
- `constructionApi.uploadPhoto(record.id, values)`

Use desktop upload controls:

- URL input for desktop evidence link.
- file upload if current API accepts file.
- no Web mobile camera shell.

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

---

## Task 4: Rebuild Web `/construction/leaves` As Desktop Worker Leave Page

**Files:**
- Modify: `apps/web/app/construction/leaves/page.tsx`
- Modify: `apps/web/src/features/construction/tasks-page.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing tests**

```ts
test("web construction leaves page is worker desktop self-service", () => {
  const source = readFileSync("app/construction/leaves/page.tsx", "utf8");
  assert.doesNotMatch(source, /ConstructionMobileShell/);
  assert.match(source, /请假申请/);
  assert.match(source, /申请记录/);
  assert.match(source, /constructionApi\.createLeave/);
  assert.match(source, /constructionApi\.leaves/);
});
```

- [ ] **Step 2: Implement desktop leave page**

Desktop layout:

- `StorePageHeader`: `请假申请`
- KPI cards: 待审批、已批准、已驳回、全部记录
- form panel: start date, end date, leave type, reason, submit
- history table and responsive cards
- related link: `/construction/leave-approvals` for managers only if role allows

Do not route desktop users away from this page; this is the worker Web implementation.

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

---

## Task 5: Rebuild Web `/construction/schedules` As Desktop Worker Schedule Page

**Files:**
- Modify: `apps/web/app/construction/schedules/page.tsx`
- Modify: `apps/web/src/features/construction/tasks-page.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing tests**

```ts
test("web construction schedules page is desktop worker schedule", () => {
  const source = readFileSync("app/construction/schedules/page.tsx", "utf8");
  assert.doesNotMatch(source, /ConstructionMobileShell/);
  assert.match(source, /我的排班/);
  assert.match(source, /周视图/);
  assert.match(source, /constructionApi\.schedules/);
});
```

- [ ] **Step 2: Implement desktop schedule**

Desktop layout:

- week selector
- schedule list/table for selected date range
- status chips: 店内排班、外出施工、休息
- actions:
  - `查看任务` -> `/construction/tasks`
  - `申请请假` -> `/construction/leaves`
  - `查看容量管理` -> `/construction/capacities` for manager roles only

Do not include worker self-edit of manager schedule unless API/permission explicitly allows it.

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

---

## Task 6: Replace Web Camera Page With Desktop Evidence Workspace

**Files:**
- Modify: `apps/web/app/construction/camera/page.tsx`
- Modify: `apps/web/src/features/construction/tasks-page.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing tests**

```ts
test("web construction camera route is a desktop evidence workspace without prototype static assets", () => {
  const source = readFileSync("app/construction/camera/page.tsx", "utf8");
  assert.doesNotMatch(source, /ConstructionMobileShell/);
  assert.doesNotMatch(source, /construction-camera-inspection\.png/);
  assert.match(source, /施工照片凭证/);
  assert.match(source, /选择施工任务/);
});
```

- [ ] **Step 2: Implement desktop evidence workspace**

Purpose:

- Desktop Web users can review or supplement construction evidence.
- Real phone capture remains Mini task detail.

Desktop content:

- task/order selector
- photo stage checklist
- upload link/file controls
- existing photo list
- quick link to `/construction/tasks`

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

---

## Task 7: Implement Web `/construction/materials` As Desktop Worker Material Page

**Files:**
- Modify: `apps/web/app/construction/materials/page.tsx`
- Modify: `apps/web/src/features/construction/tasks-page.test.ts`
- Modify: `apps/web/app/globals.css`
- Potential API files after contract: `apps/api/src/construction/*`, `apps/api/src/inventory/*`

- [ ] **Step 1: Write failing tests**

```ts
test("web construction materials page is desktop material verification", () => {
  const source = readFileSync("app/construction/materials/page.tsx", "utf8");
  assert.doesNotMatch(source, /ConstructionMobileShell/);
  assert.match(source, /物料核验/);
  assert.match(source, /批次追溯/);
  assert.match(source, /损耗记录/);
});
```

- [ ] **Step 2: Freeze API contract before replacing static mock**

Minimum endpoint contract:

```http
GET /construction/orders/:orderId/materials
POST /construction/orders/:orderId/materials/verify-batch
POST /construction/orders/:orderId/materials/pickup
POST /construction/orders/:orderId/materials/losses
```

If these endpoints do not exist, first implement backend service/tests. Do not keep static material arrays as production UI.

- [ ] **Step 3: Build desktop materials page**

Desktop layout:

- task/order selector
- required material checklist
- batch scan/manual input
- pickup confirmation
- loss/abnormal consumption form
- links to inventory movement detail where applicable

- [ ] **Step 4: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- src/construction/construction.service.test.ts
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web typecheck
```

---

## Task 8: Rebuild Web `/construction/profile` As Desktop Worker Profile

**Files:**
- Modify: `apps/web/app/construction/profile/page.tsx`
- Modify: `apps/web/src/features/construction/tasks-page.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Write failing tests**

```ts
test("web construction profile page is desktop worker profile", () => {
  const source = readFileSync("app/construction/profile/page.tsx", "utf8");
  assert.doesNotMatch(source, /ConstructionMobileShell/);
  assert.match(source, /施工人员档案/);
  assert.match(source, /小程序入口/);
});
```

- [ ] **Step 2: Implement desktop worker profile**

Desktop content:

- current worker identity and store.
- role/capability summary.
- recent task statistics.
- links to Web worker functions.
- Mini entry guidance: show “微信小程序入口” configuration/help, not localStorage cache controls.

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

---

## Task 9: Rebuild Web `/after-sales/tasks` As Desktop Assigned After-Sales Board

**Files:**
- Modify: `apps/web/app/after-sales/tasks/page.tsx`
- Modify: `apps/web/src/features/after-sales/page.test.ts`
- Modify: `apps/web/app/globals.css`
- Optional Mini files in Task 12 if mobile after-sales is required.

- [ ] **Step 1: Write failing tests**

```ts
test("after-sales tasks page is desktop assigned task board", () => {
  const source = readFileSync("app/after-sales/tasks/page.tsx", "utf8");
  assert.doesNotMatch(source, /after-sales-mobile-shell/);
  assert.match(source, /售后任务/);
  assert.match(source, /待处理/);
  assert.match(source, /处理中/);
  assert.match(source, /已完成/);
});
```

- [ ] **Step 2: Implement desktop board**

Desktop layout:

- status tabs.
- KPI summary.
- assigned task table/cards.
- detail drawer or link to `/after-sales/[id]`.
- actions appropriate to role and current status.

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/after-sales/page.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

---

## Task 10: Remove Web Mobile Shell After Desktop Parity

**Files:**
- Delete: `apps/web/src/features/construction/mobile-shell.tsx`
- Modify: `apps/web/src/features/construction/tasks-page.test.ts`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Confirm no imports remain**

Run:

```bash
rg -n "ConstructionMobileShell|ConstructionMobileBottomNav|mobile-worker-shell|mobile-worker-bottom-nav" apps/web
```

Expected before deletion: only tests or CSS remain.

- [ ] **Step 2: Delete shell and stale CSS**

Remove:

- `ConstructionMobileShell`
- `ConstructionMobileBottomNav`
- `.mobile-worker-shell`
- `.mobile-worker-bottom-nav`
- `.construction-mobile-shell`
- Web-only mobile bottom navigation styles.

Keep:

- responsive backend `*-mobile-cards`.
- desktop pages with responsive grid/table behavior.

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts src/features/after-sales/page.test.ts
corepack pnpm --filter @mallbay/web typecheck
git diff --check
```

---

## Task 11: Complete Mini Schedule And Materials

**Files:**
- Modify: `apps/mini/app.json`
- Create: `apps/mini/pages/schedule/index.js`
- Create: `apps/mini/pages/schedule/index.json`
- Create: `apps/mini/pages/schedule/index.wxml`
- Create: `apps/mini/pages/schedule/index.wxss`
- Create: `apps/mini/pages/materials/index.js`
- Create: `apps/mini/pages/materials/index.json`
- Create: `apps/mini/pages/materials/index.wxml`
- Create: `apps/mini/pages/materials/index.wxss`
- Modify: `apps/mini/src/mini-construction-api.ts`
- Modify: `apps/mini/src/mini-construction-api.test.ts`

- [ ] **Step 1: Add Mini schedule API test**

```ts
test("mini construction api pulls schedules", async () => {
  const calls: unknown[] = [];
  const api = new MiniConstructionApi({
    getStorageSync: () => undefined,
    setStorageSync: () => undefined,
    uploadFile: async () => undefined,
    request: async (options) => {
      calls.push(options);
      return [{ id: "schedule-1", date: "2026-06-21", status: "WORKING" }];
    }
  });

  const rows = await api.pullSchedules({
    apiBaseUrl: "http://localhost:3001",
    token: "token",
    storeId: "store-1",
    from: "2026-06-21",
    to: "2026-06-27"
  });

  assert.equal(Array.isArray(rows), true);
  assert.equal((calls[0] as { url: string }).url, "http://localhost:3001/construction/schedules?storeId=store-1&from=2026-06-21&to=2026-06-27");
});
```

- [ ] **Step 2: Add Mini pages**

Register in `apps/mini/app.json`:

```json
"pages/schedule/index",
"pages/materials/index"
```

Schedule page:

- week selector.
- schedule cards.
- links to task list and leave request.

Materials page:

- selected task.
- material checklist.
- `wx.scanCode` for batch verification.
- offline-safe loss record only if backend supports syncing it.

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/mini test
corepack pnpm --filter @mallbay/mini typecheck
```

---

## Task 12: Add Mini After-Sales Mobile Entry If In Scope

**Files:**
- Modify: `apps/mini/app.json`
- Create: `apps/mini/pages/after-sales/index.js`
- Create: `apps/mini/pages/after-sales/index.json`
- Create: `apps/mini/pages/after-sales/index.wxml`
- Create: `apps/mini/pages/after-sales/index.wxss`
- Create: `apps/mini/pages/after-sales-detail/index.js`
- Create: `apps/mini/pages/after-sales-detail/index.json`
- Create: `apps/mini/pages/after-sales-detail/index.wxml`
- Create: `apps/mini/pages/after-sales-detail/index.wxss`
- Create: `apps/mini/src/mini-after-sales-api.ts`
- Create: `apps/mini/src/mini-after-sales-api.test.ts`

- [ ] **Step 1: Confirm field after-sales scope**

Implement Mini after-sales only if after-sales staff or施工人员 need to process after-sales on phone. If after-sales is manager/customer-service only, Web desktop `/after-sales/tasks` is sufficient.

- [ ] **Step 2: Add mini API tests**

```ts
test("mini after-sales api lists assigned tasks", async () => {
  const calls: unknown[] = [];
  const api = new MiniAfterSalesApi({
    request: async (options) => {
      calls.push(options);
      return { items: [{ id: "as-1", status: "OPEN", description: "划痕复检" }] };
    }
  });

  const rows = await api.list({ apiBaseUrl: "http://localhost:3001", token: "token", storeId: "store-1" });
  assert.equal(rows.length, 1);
  assert.equal((calls[0] as { url: string }).url, "http://localhost:3001/after-sales?storeId=store-1");
});
```

- [ ] **Step 3: Build Mini after-sales pages**

List page:

- tabs: 待处理、处理中、已完成.
- assigned task cards.
- navigation to detail.

Detail page:

- issue summary.
- related order/warranty.
- processing status.
- evidence upload if required.

- [ ] **Step 4: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/mini test -- src/mini-after-sales-api.test.ts
corepack pnpm --filter @mallbay/mini typecheck
```

---

## Task 13: Navigation And Permission Cleanup

**Files:**
- Modify: `apps/web/src/features/workbench/management-menu.tsx`
- Modify: `apps/web/src/features/workbench/management-menu.test.ts`
- Modify: `apps/web/src/features/workbench/management-shell.tsx`
- Modify: `apps/web/src/features/workbench/management-shell.test.ts`
- Modify: Mini page navigation WXML files.

- [ ] **Step 1: Web navigation**

Rules:

- Construction workers in Web should see desktop worker routes:
  - 工作台
  - 我的施工任务
  - 我的排班
  - 请假申请
  - 施工人员档案
- Managers should see management routes:
  - 施工派单
  - 施工容量
  - 请假审批
  - 施工订单详情 from contextual links.

- [ ] **Step 2: Mini navigation**

Mini should expose phone tasks:

- 任务
- 排班
- 拍照 through task detail, not a detached mock page.
- 请假
- 物料
- 离线
- 我的/设置

- [ ] **Step 3: Verify**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/workbench/management-menu.test.ts src/features/workbench/management-shell.test.ts
corepack pnpm --filter @mallbay/mini test
```

---

## Task 14: Documentation Update

**Files:**
- Modify: `apps/mini/README.md`
- Modify: `docs/features/phase-6-mini-program-integration-plan.md`
- Modify: `docs/features/v1-7-requirements-gap-plan.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Document channel ownership**

Add:

```md
施工人员业务能力必须同时具备 Web 桌面入口和 Mini 小程序入口。Web 用于桌面后台/自助处理，Mini 用于微信内移动作业。Web 不再维护独立移动端壳，但不能因为 Mini 存在而缺失对应业务能力。
```

- [ ] **Step 2: Document verification matrix**

Add a table with:

- Web desktop route.
- Mini route.
- Shared API.
- Required tests.
- Manual browser or WeChat developer tool verification.

- [ ] **Step 3: Verify**

Run:

```bash
git diff --check
```

---

## Final Verification

Run before merge:

```bash
corepack pnpm --filter @mallbay/shared test
corepack pnpm --filter @mallbay/shared typecheck
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts src/features/after-sales/page.test.ts src/features/workbench/management-menu.test.ts src/features/workbench/management-shell.test.ts
corepack pnpm --filter @mallbay/web typecheck
corepack pnpm --filter @mallbay/mini test
corepack pnpm --filter @mallbay/mini typecheck
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm lint
git diff --check
```

Browser verification:

- Desktop Web:
  - `/construction/tasks`
  - `/construction/tasks/:orderId`
  - `/construction/leaves`
  - `/construction/schedules`
  - `/construction/materials`
  - `/construction/profile`
  - `/after-sales/tasks`
- Confirm no `ConstructionMobileShell` appears in Web.
- Confirm manager routes still work.

Mini verification in WeChat Developer Tool:

- Task sync.
- Task detail.
- Start/complete offline queue.
- Photo choose/upload enqueue.
- Leave request.
- Schedule page.
- Materials page.
- Offline sync.
- Settings/WeChat login.
- After-sales pages if in scope.

---

## Execution Recommendation

Implement in this order:

1. Shared domain helpers.
2. Web desktop施工任务 list/detail.
3. Web desktop请假/排班.
4. Web desktop照片凭证/物料/个人页.
5. Web desktop售后任务.
6. Mini排班/物料.
7. Mini售后 if confirmed.
8. Remove Web mobile shell.
9. Documentation and full verification.

This order prevents a regression where a capability disappears from Web before its desktop replacement exists.

