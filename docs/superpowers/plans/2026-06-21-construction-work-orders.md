# Construction Work Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/construction/assignments` from a pending-dispatch-only screen into a construction work order console where managers and schedulers can see pending, dispatched, in-construction, completed, and quality follow-up work.

**Architecture:** Keep the current API boundary for this pass. The web page will fetch pending orders from `orderApi.list({ status: "PENDING_DISPATCH" })` and construction records from `constructionApi.assignments({ storeId })`, then normalize them into one `ConstructionWorkItem` list for filtering, selection, and rendering. Existing `/construction/orders/[id]` remains the detail and quality workspace.

**Tech Stack:** Next.js App Router, React client components, Ant Design, TanStack Query, NestJS construction APIs, Node test runner with source-level regression tests.

---

## File Structure

- Create `apps/web/src/features/construction/work-orders.ts`
  - Owns normalized construction work item types, status buckets, KPI calculation, and merge/sort helpers.
- Create `apps/web/src/features/construction/work-orders.test.ts`
  - Verifies pending orders and construction records are merged and bucketed correctly.
- Modify `apps/web/app/construction/assignments/page.tsx`
  - Replaces pending-only assumptions with the normalized work item model.
  - Keeps dispatch controls only for pending orders.
  - Adds status tabs/KPIs and strong entry points for assigned work orders.
- Modify `apps/web/src/features/construction/assignments-page.test.ts`
  - Adds regression coverage for the all-lifecycle console, status tabs, and detail links.
- Optionally modify `apps/api/src/construction/construction.service.ts`
  - Only if browser/API verification shows `constructionApi.assignments` lacks order fields required for the assigned-work-order cards.
- Optionally modify `apps/api/src/construction/construction.service.test.ts`
  - Only if the API include shape changes.

---

### Task 1: Add Normalized Construction Work Item Helpers

**Files:**
- Create: `apps/web/src/features/construction/work-orders.ts`
- Create: `apps/web/src/features/construction/work-orders.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Add `apps/web/src/features/construction/work-orders.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildConstructionWorkItems,
  getConstructionWorkOrderCounts,
  getVisibleConstructionWorkItems
} from "./work-orders";

test("buildConstructionWorkItems merges pending orders and construction records without losing assigned work", () => {
  const items = buildConstructionWorkItems({
    pendingOrders: [
      { id: "order-pending", orderNo: "ORD-PENDING", appointmentDate: "2026-06-21" }
    ],
    records: [
      {
        id: "record-1",
        orderId: "order-dispatched",
        status: "DISPATCHED",
        order: { orderNo: "ORD-DISPATCHED", appointmentDate: "2026-06-20" },
        assignments: [{ workerUserId: "worker-1" }]
      },
      {
        id: "record-2",
        orderId: "order-active",
        status: "IN_CONSTRUCTION",
        order: { orderNo: "ORD-ACTIVE", appointmentDate: "2026-06-19" },
        assignments: [{ workerUserId: "worker-2" }]
      }
    ]
  });

  assert.deepEqual(items.map((item) => [item.kind, item.status, item.orderId]), [
    ["pending", "PENDING_DISPATCH", "order-pending"],
    ["record", "DISPATCHED", "order-dispatched"],
    ["record", "IN_CONSTRUCTION", "order-active"]
  ]);
});

test("getVisibleConstructionWorkItems filters by construction lifecycle tab", () => {
  const items = buildConstructionWorkItems({
    pendingOrders: [{ id: "order-pending", orderNo: "ORD-PENDING" }],
    records: [
      { id: "record-1", orderId: "order-dispatched", status: "DISPATCHED", order: { orderNo: "ORD-DISPATCHED" } },
      { id: "record-2", orderId: "order-active", status: "IN_CONSTRUCTION", order: { orderNo: "ORD-ACTIVE" } },
      { id: "record-3", orderId: "order-completed", status: "COMPLETED", order: { orderNo: "ORD-COMPLETED" } }
    ]
  });

  assert.deepEqual(getVisibleConstructionWorkItems(items, "pending").map((item) => item.orderNo), ["ORD-PENDING"]);
  assert.deepEqual(getVisibleConstructionWorkItems(items, "dispatched").map((item) => item.orderNo), ["ORD-DISPATCHED"]);
  assert.deepEqual(getVisibleConstructionWorkItems(items, "active").map((item) => item.orderNo), ["ORD-ACTIVE"]);
  assert.deepEqual(getVisibleConstructionWorkItems(items, "completed").map((item) => item.orderNo), ["ORD-COMPLETED"]);
  assert.equal(getVisibleConstructionWorkItems(items, "all").length, 4);
});

test("getConstructionWorkOrderCounts exposes manager console KPIs", () => {
  const items = buildConstructionWorkItems({
    pendingOrders: [{ id: "order-pending", orderNo: "ORD-PENDING" }],
    records: [
      { id: "record-1", orderId: "order-dispatched", status: "DISPATCHED", order: { orderNo: "ORD-DISPATCHED" } },
      { id: "record-2", orderId: "order-active", status: "IN_CONSTRUCTION", order: { orderNo: "ORD-ACTIVE" } },
      { id: "record-3", orderId: "order-completed", status: "COMPLETED", order: { orderNo: "ORD-COMPLETED" } }
    ]
  });

  assert.deepEqual(getConstructionWorkOrderCounts(items), {
    all: 4,
    pending: 1,
    dispatched: 1,
    active: 1,
    completed: 1
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/work-orders.test.ts
```

Expected: FAIL because `./work-orders` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/features/construction/work-orders.ts`:

```ts
export type ConstructionWorkOrderTab = "all" | "pending" | "dispatched" | "active" | "completed";

export type ConstructionPendingOrderInput = {
  id: string;
  orderNo?: string | null;
  status?: string | null;
  appointmentDate?: string | null;
  appointmentTimeSlot?: string | null;
  constructionLocation?: string | null;
  constructionType?: string | null;
  note?: string | null;
  outsideAddress?: string | null;
  laborCostCents?: number | null;
  totalAmountCents?: number | null;
  customer?: { name?: string | null; companyName?: string | null } | null;
  items?: unknown[];
  vehicle?: { plateNo?: string | null; brand?: string | null; model?: string | null; color?: string | null } | null;
};

export type ConstructionRecordInput = {
  id: string;
  orderId: string;
  status: string;
  order?: (ConstructionPendingOrderInput & { orderNo?: string | null }) | null;
  assignments?: { workerUserId: string }[];
  photos?: { id: string; stage: string; url: string; uploadedById: string }[];
  qualityResult?: string | null;
  qualityNote?: string | null;
};

export type ConstructionWorkItem =
  | {
      kind: "pending";
      status: "PENDING_DISPATCH";
      orderId: string;
      orderNo: string;
      order: ConstructionPendingOrderInput;
    }
  | {
      kind: "record";
      status: "DISPATCHED" | "IN_CONSTRUCTION" | "COMPLETED" | string;
      orderId: string;
      orderNo: string;
      record: ConstructionRecordInput;
      order?: ConstructionPendingOrderInput | null;
    };

export function buildConstructionWorkItems(input: {
  pendingOrders: ConstructionPendingOrderInput[];
  records: ConstructionRecordInput[];
}) {
  const pendingItems: ConstructionWorkItem[] = input.pendingOrders.map((order) => ({
    kind: "pending",
    status: "PENDING_DISPATCH",
    orderId: order.id,
    orderNo: order.orderNo ?? "未编号订单",
    order
  }));

  const recordItems: ConstructionWorkItem[] = input.records.map((record) => ({
    kind: "record",
    status: record.status,
    orderId: record.orderId,
    orderNo: record.order?.orderNo ?? "订单信息待确认",
    record,
    order: record.order
  }));

  return [...pendingItems, ...recordItems].sort(compareConstructionWorkItems);
}

export function getVisibleConstructionWorkItems(items: ConstructionWorkItem[], tab: ConstructionWorkOrderTab) {
  if (tab === "pending") return items.filter((item) => item.status === "PENDING_DISPATCH");
  if (tab === "dispatched") return items.filter((item) => item.status === "DISPATCHED");
  if (tab === "active") return items.filter((item) => item.status === "IN_CONSTRUCTION");
  if (tab === "completed") return items.filter((item) => item.status === "COMPLETED");
  return items;
}

export function getConstructionWorkOrderCounts(items: ConstructionWorkItem[]) {
  return {
    all: items.length,
    pending: items.filter((item) => item.status === "PENDING_DISPATCH").length,
    dispatched: items.filter((item) => item.status === "DISPATCHED").length,
    active: items.filter((item) => item.status === "IN_CONSTRUCTION").length,
    completed: items.filter((item) => item.status === "COMPLETED").length
  };
}

function compareConstructionWorkItems(a: ConstructionWorkItem, b: ConstructionWorkItem) {
  const aDate = getWorkItemDate(a);
  const bDate = getWorkItemDate(b);
  return bDate.localeCompare(aDate);
}

function getWorkItemDate(item: ConstructionWorkItem) {
  if (item.kind === "pending") return item.order.appointmentDate ?? "";
  return item.order?.appointmentDate ?? "";
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/work-orders.test.ts
```

Expected: PASS for the new helper tests.

---

### Task 2: Convert Assignments Page to Work Order Console State

**Files:**
- Modify: `apps/web/app/construction/assignments/page.tsx`
- Modify: `apps/web/src/features/construction/assignments-page.test.ts`

- [ ] **Step 1: Add source-level regression tests**

Append to `apps/web/src/features/construction/assignments-page.test.ts`:

```ts
test("construction assignments page combines pending orders and assigned construction records", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /buildConstructionWorkItems/);
  assert.match(pageSource, /getVisibleConstructionWorkItems/);
  assert.match(pageSource, /activeWorkOrderTab/);
  assert.match(pageSource, /施工工单/);
  assert.match(pageSource, /待派单/);
  assert.match(pageSource, /已派工/);
  assert.match(pageSource, /施工中/);
  assert.match(pageSource, /已完工/);
});

test("construction assignments page keeps dispatch controls scoped to pending orders", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /selectedWorkItem\?\.kind === "pending"/);
  assert.match(pageSource, /selectedPendingOrder/);
  assert.match(pageSource, /selectedConstructionRecord/);
  assert.match(pageSource, /查看施工工单/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/assignments-page.test.ts
```

Expected: FAIL because the page still uses pending-only `selectedOrder`.

- [ ] **Step 3: Wire normalized state into the page**

In `apps/web/app/construction/assignments/page.tsx`:

1. Import helpers:

```ts
import {
  buildConstructionWorkItems,
  getConstructionWorkOrderCounts,
  getVisibleConstructionWorkItems,
  type ConstructionWorkItem,
  type ConstructionWorkOrderTab
} from "../../../src/features/construction/work-orders";
```

2. Replace `selectedOrderId` with:

```ts
const [activeWorkOrderTab, setActiveWorkOrderTab] = useState<ConstructionWorkOrderTab>("pending");
const [selectedWorkItemKey, setSelectedWorkItemKey] = useState<string>();
```

3. Build unified items after `pendingRows`, `records`, and `workers`:

```ts
const workItems = useMemo(
  () => buildConstructionWorkItems({ pendingOrders: pendingRows, records }),
  [pendingRows, records]
);
const workOrderCounts = useMemo(() => getConstructionWorkOrderCounts(workItems), [workItems]);
const visibleWorkItems = useMemo(
  () => getVisibleConstructionWorkItems(workItems, activeWorkOrderTab),
  [activeWorkOrderTab, workItems]
);
const selectedWorkItem =
  visibleWorkItems.find((item) => getWorkItemKey(item) === selectedWorkItemKey) ?? visibleWorkItems[0] ?? workItems[0];
const selectedPendingOrder = selectedWorkItem?.kind === "pending" ? selectedWorkItem.order : undefined;
const selectedConstructionRecord = selectedWorkItem?.kind === "record" ? selectedWorkItem.record : undefined;
const selectedOrder = selectedPendingOrder ?? selectedConstructionRecord?.order;
```

4. Add local key helper near the existing helper functions:

```ts
function getWorkItemKey(item: ConstructionWorkItem) {
  return `${item.kind}:${item.orderId}`;
}
```

- [ ] **Step 4: Replace the left rail with lifecycle tabs**

In the left card title and list:

```tsx
<Card className="dispatch-order-list dispatch-board-rail" title={`施工工单 (${workOrderCounts.all})`}>
  <div className="dispatch-work-order-tabs" role="tablist" aria-label="施工工单状态">
    {[
      { key: "pending" as const, label: "待派单", count: workOrderCounts.pending },
      { key: "dispatched" as const, label: "已派工", count: workOrderCounts.dispatched },
      { key: "active" as const, label: "施工中", count: workOrderCounts.active },
      { key: "completed" as const, label: "已完工", count: workOrderCounts.completed },
      { key: "all" as const, label: "全部", count: workOrderCounts.all }
    ].map((tab) => (
      <button
        key={tab.key}
        type="button"
        className={activeWorkOrderTab === tab.key ? "is-active" : undefined}
        onClick={() => {
          setActiveWorkOrderTab(tab.key);
          setSelectedWorkItemKey(undefined);
          setSelectedWorkerUserIds([]);
        }}
      >
        {tab.label}
        <em>{tab.count}</em>
      </button>
    ))}
  </div>
  ...
</Card>
```

Replace `pendingRows.map` with `visibleWorkItems.map`; each card should call `setSelectedWorkItemKey(getWorkItemKey(item))`. The visible text must show `item.orderNo`, status label, appointment date, and assigned worker names for record items.

- [ ] **Step 5: Keep dispatch mutations pending-only**

Change `assignMutation` to guard `selectedPendingOrder`:

```ts
mutationFn: () => {
  if (!selectedPendingOrder) {
    throw new Error("请先选择待派单订单");
  }
  return constructionApi.assignOrder(selectedPendingOrder.id, { workerUserIds: selectedWorkerUserIds });
}
```

After success, clear `selectedWorkItemKey`, selected workers, and invalidate both pending orders and records:

```ts
await queryClient.invalidateQueries({ queryKey: ["orders", storeId, "PENDING_DISPATCH"] });
await queryClient.invalidateQueries({ queryKey: ["construction-assignments", storeId] });
```

- [ ] **Step 6: Run page tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/assignments-page.test.ts src/features/construction/work-orders.test.ts
```

Expected: PASS.

---

### Task 3: Add Assigned Work Order Detail Mode

**Files:**
- Modify: `apps/web/app/construction/assignments/page.tsx`
- Modify: `apps/web/src/features/construction/assignments-page.test.ts`

- [ ] **Step 1: Add regression tests for assigned work order visibility**

Append:

```ts
test("construction assignments page exposes assigned work order detail entry", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /selectedConstructionRecord/);
  assert.match(pageSource, /router\.push\(`\\/construction\\/orders\\/\\$\\{selectedConstructionRecord\.orderId\\}`\)/);
  assert.match(pageSource, /施工团队/);
  assert.match(pageSource, /施工照片/);
  assert.match(pageSource, /质检状态/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/assignments-page.test.ts
```

Expected: FAIL until assigned detail mode is rendered.

- [ ] **Step 3: Render pending and assigned modes separately**

In the main column:

```tsx
{selectedConstructionRecord ? (
  <AssignedConstructionRecordPanel
    record={selectedConstructionRecord}
    workerMap={workerMap}
    onOpenDetail={() => router.push(`/construction/orders/${selectedConstructionRecord.orderId}`)}
  />
) : (
  <PendingDispatchPanel
    selectedOrder={selectedPendingOrder}
    onOpenOrder={() => router.push(selectedPendingOrder ? `/orders/${selectedPendingOrder.id}` : "/orders")}
  />
)}
```

Keep these as local functions in the same file for this pass. `PendingDispatchPanel` can initially wrap the existing order construction info, outside info, notes, and fee sections. `AssignedConstructionRecordPanel` should show:

```tsx
<Card className="dispatch-order-detail">
  <div className="dispatch-detail-head">
    <div className="dispatch-detail-title">
      <span className="dispatch-detail-icon"><CarOutlined /></span>
      <div>
        <h2>{record.order?.orderNo ?? "施工工单"}</h2>
        <p>当前状态：{getConstructionStatusLabel(record.status)}</p>
      </div>
    </div>
    <Button type="primary" onClick={onOpenDetail}>查看施工工单</Button>
  </div>
  <div className="dispatch-info-grid">
    <div className="dispatch-info-panel">
      <h3>施工团队</h3>
      <strong>{formatAssignedWorkers(record, workerMap)}</strong>
    </div>
    <div className="dispatch-info-panel">
      <h3>施工照片</h3>
      <strong>{record.photos?.length ?? 0} 张</strong>
    </div>
    <div className="dispatch-info-panel">
      <h3>质检状态</h3>
      <strong>{getConstructionQualityResultLabel(record.qualityResult)}</strong>
    </div>
  </div>
</Card>
```

- [ ] **Step 4: Hide dispatch action controls for assigned records**

Wrap the current dispatch action bar:

```tsx
{selectedWorkItem?.kind === "pending" ? (
  <Card className="dispatch-action-bar">...</Card>
) : (
  <Card className="dispatch-action-bar dispatch-action-bar-readonly">
    <div>
      <span>施工工单</span>
      <strong>{selectedConstructionRecord ? getConstructionStatusLabel(selectedConstructionRecord.status) : "-"}</strong>
      <p>已派工工单进入施工跟踪、照片和质检流程，不再重复显示派工提交按钮。</p>
    </div>
    <Button onClick={() => selectedConstructionRecord && router.push(`/construction/orders/${selectedConstructionRecord.orderId}`)}>
      查看施工工单
    </Button>
  </Card>
)}
```

- [ ] **Step 5: Run tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/assignments-page.test.ts src/features/construction/work-orders.test.ts
```

Expected: PASS.

---

### Task 4: Improve Right-Side Progress Panel

**Files:**
- Modify: `apps/web/app/construction/assignments/page.tsx`
- Modify: `apps/web/src/features/construction/assignments-page.test.ts`

- [ ] **Step 1: Add regression test**

Append:

```ts
test("construction assignments page treats construction progress as navigable work orders", () => {
  const pageSource = readFileSync("app/construction/assignments/page.tsx", "utf8");

  assert.match(pageSource, /施工履约进度/);
  assert.match(pageSource, /查看全部工单/);
  assert.match(pageSource, /setActiveWorkOrderTab\("all"\)/);
  assert.match(pageSource, /router\.push\(`\\/construction\\/orders\\/\\$\\{record\.orderId\\}`\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/assignments-page.test.ts
```

Expected: FAIL until the right panel has the all-work-order navigation.

- [ ] **Step 3: Update progress panel copy and actions**

In the progress card title area, add a compact button:

```tsx
<Card
  className="dispatch-progress-card"
  title="施工履约进度"
  extra={<Button size="small" onClick={() => setActiveWorkOrderTab("all")}>查看全部工单</Button>}
>
```

Keep each record row clickable to `/construction/orders/${record.orderId}` and ensure the row shows order number, status, and assigned workers.

- [ ] **Step 4: Run tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/assignments-page.test.ts
```

Expected: PASS.

---

### Task 5: Add Styling for Lifecycle Tabs and Assigned Mode

**Files:**
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Add source-level CSS test**

Append to `apps/web/src/features/construction/assignments-page.test.ts`:

```ts
test("construction assignments page has lifecycle tab and readonly action styles", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cssSource, /\.dispatch-work-order-tabs/);
  assert.match(cssSource, /\.dispatch-work-order-tabs button\.is-active/);
  assert.match(cssSource, /\.dispatch-action-bar-readonly/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/assignments-page.test.ts
```

Expected: FAIL until CSS is added.

- [ ] **Step 3: Add CSS**

Add to `apps/web/app/globals.css` near existing dispatch styles:

```css
.dispatch-work-order-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}

.dispatch-work-order-tabs button {
  border: 1px solid var(--mb-border);
  border-radius: 8px;
  background: #fff;
  color: var(--mb-text);
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dispatch-work-order-tabs button.is-active {
  border-color: var(--mb-primary);
  background: rgba(15, 58, 95, 0.08);
  color: var(--mb-primary);
}

.dispatch-work-order-tabs em {
  font-style: normal;
  color: var(--mb-muted);
}

.dispatch-action-bar-readonly {
  border-color: rgba(15, 58, 95, 0.16);
}
```

- [ ] **Step 4: Run CSS/source tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/assignments-page.test.ts
```

Expected: PASS.

---

### Task 6: Verify End-to-End Behavior in Browser

**Files:**
- No source edits unless verification exposes a defect.

- [ ] **Step 1: Run focused automated checks**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/assignments-page.test.ts src/features/construction/work-orders.test.ts
corepack pnpm --filter @mallbay/web typecheck
git diff --check -- apps/web/app/construction/assignments/page.tsx apps/web/src/features/construction/assignments-page.test.ts apps/web/src/features/construction/work-orders.ts apps/web/src/features/construction/work-orders.test.ts apps/web/app/globals.css
```

Expected: all commands exit 0.

- [ ] **Step 2: Browser verification as manager**

Open:

```text
http://localhost:3000/construction/assignments
```

Verify:
- Left panel title is `施工工单`.
- Lifecycle tabs show `待派单`, `已派工`, `施工中`, `已完工`, `全部`.
- `已派工` tab shows previously dispatched records such as `ORD20260621204097`.
- Selecting an assigned work order does not show the dispatch submit button as the primary action.
- Assigned work order mode shows `施工团队`, `施工照片`, `质检状态`, and `查看施工工单`.
- Clicking `查看施工工单` navigates to `/construction/orders/<orderId>`.

- [ ] **Step 3: Browser verification of dispatch path**

On the `待派单` tab:
- Select a pending order.
- Select `shigong` from the recommended worker card.
- Confirm that `确认派单` becomes enabled.
- Do not submit unless the test scenario explicitly allows mutating local data.

- [ ] **Step 4: Responsive verification**

At desktop width and mobile width:
- No horizontal overflow.
- Lifecycle tabs wrap without overlapping.
- Assigned work order summary stays readable.
- Dispatch controls remain visible only for pending orders.

---

## Self-Review

- Spec coverage: The plan covers pending, dispatched, active, completed visibility; assigned work order detail entry; dispatch-only controls for pending orders; right-side progress navigation; tests; and browser verification.
- Placeholder scan: No placeholder markers remain.
- Type consistency: `ConstructionWorkItem`, `ConstructionWorkOrderTab`, `selectedPendingOrder`, and `selectedConstructionRecord` are defined before being used by later tasks.
