# Members Navigation And Leave Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign personnel management navigation so page tabs are real member views, add a manager-facing leave approval page, and move construction workflow links into clear related-workspace cards.

**Architecture:** Keep `/members` as the staff master-data console and drive its internal views with a `view` query parameter. Keep worker mobile leave submission at `/construction/leaves`; add manager leave approval at `/construction/leave-approvals` so it remains inside `ManagementShell` and does not collide with the existing mobile route exclusion for `/construction/leaves`. Reuse the existing `LeaveRequest` model and `/construction/leaves` API boundary, adding response shape enrichment only where the UI needs worker names.

**Tech Stack:** Next.js App Router, React client components, Ant Design, TanStack Query, NestJS construction service/controller, Prisma existing `LeaveRequest`, Node test runner source-level tests.

---

## File Structure

- Modify `apps/web/app/members/page.tsx`
  - Replace mixed Link tabs with internal member-view buttons.
  - Read `view` and legacy `position` query params.
  - Filter member rows by selected view before applying keyword and position filters.
  - Render construction workflow links as a separate related-workspace card row.
- Modify `apps/web/src/features/members/members-page.test.ts`
  - Assert member tabs are internal buttons, not cross-domain navigation.
  - Assert legacy `position=CONSTRUCTION` is mapped to the craftsman view.
  - Assert related workspace links point to accurate construction routes.
- Modify `apps/web/app/globals.css`
  - Add styles for `members-related-workspaces`.
  - Keep `members-module-tabs` as sticky or top-local internal tabs with active state.
- Modify `apps/web/src/features/construction/api.ts`
  - Add typed `LeaveRequestSummary`.
  - Keep `leaves(storeId)` and `updateLeave(id, status)` but return typed results.
- Create `apps/web/src/features/construction/leave-approvals.ts`
  - Own status/type labels, KPI helpers, date formatting, and row filters for the approval page.
- Create `apps/web/src/features/construction/leave-approvals.test.ts`
  - Unit-test approval queue filters and display helpers.
- Create `apps/web/app/construction/leave-approvals/page.tsx`
  - Manager-facing leave approval console.
  - Shows pending queue, all leave records, selected detail, approve/reject actions.
- Modify `apps/web/src/features/construction/tasks-page.test.ts`
  - Keep mobile `/construction/leaves` expectations.
  - Add assertion that manager approval is a separate route.
- Modify `apps/web/src/features/workbench/management-shell.tsx`
  - Add search placeholder for `/construction/leave-approvals`.
  - Keep mobile exclusion for `/construction/leaves` unchanged.
- Modify `apps/web/src/features/workbench/management-shell.test.ts`
  - Assert `/construction/leave-approvals` uses `ManagementShell`.
  - Assert `/construction/leaves` still does not use `ManagementShell`.
- Modify `apps/api/src/construction/construction.service.ts`
  - Enrich `listLeaves` with worker summary.
  - Keep permissions unchanged: store data viewers can list; dispatch-capable roles can approve/reject.
- Modify `apps/api/src/construction/construction.service.test.ts`
  - Assert `listLeaves` returns worker summary data.
  - Assert manager/scheduler can update leave status and construction worker cannot.

---

## Task 1: Lock Current Bug With Member Navigation Tests

**Files:**
- Modify: `apps/web/src/features/members/members-page.test.ts`

- [ ] **Step 1: Add failing tests for member view navigation**

Add these tests after `members management page exposes the prototype staff module tabs`:

```ts
test("members management module tabs are internal member views", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /MEMBER_VIEW_TABS/);
  assert.match(source, /activeMemberView/);
  assert.match(source, /setActiveMemberView/);
  assert.match(source, /aria-label="人员视图切换"/);
  assert.doesNotMatch(source, /href="\/members\?position=CONSTRUCTION"/);
  assert.doesNotMatch(source, /href="\/construction\/schedules"/);
  assert.doesNotMatch(source, /href="\/construction\/capacities"/);
  assert.doesNotMatch(source, /href="\/construction\/assignments"/);
});

test("members management maps legacy construction position query to craftsman view", () => {
  const source = readFileSync(pagePath, "utf8");

  assert.match(source, /useSearchParams/);
  assert.match(source, /searchParams\.get\("position"\) === "CONSTRUCTION"/);
  assert.match(source, /"craftsman"/);
});

test("members management exposes construction workspaces as related links", () => {
  const source = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(source, /members-related-workspaces/);
  assert.match(source, /施工派单/);
  assert.match(source, /施工容量/);
  assert.match(source, /请假审批/);
  assert.match(source, /href="\/construction\/assignments"/);
  assert.match(source, /href="\/construction\/capacities"/);
  assert.match(source, /href="\/construction\/leave-approvals"/);
  assert.match(cssSource, /\.members-related-workspaces/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/members/members-page.test.ts
```

Expected: FAIL because `MEMBER_VIEW_TABS`, `useSearchParams`, and `members-related-workspaces` do not exist yet, and old cross-route tab links are still present.

---

## Task 2: Redesign `/members` Internal Views

**Files:**
- Modify: `apps/web/app/members/page.tsx`
- Modify: `apps/web/app/globals.css`

- [ ] **Step 1: Replace module tab data model**

In `apps/web/app/members/page.tsx`, import `useRouter` and `useSearchParams`:

```ts
import { useRouter, useSearchParams } from "next/navigation";
```

Add these types and constants near `INVITE_POSITION_OPTIONS`:

```ts
type MemberViewKey = "all" | "craftsman" | "salesService" | "backOffice" | "permission";

const MEMBER_VIEW_TABS: Array<{ key: MemberViewKey; label: string; positions: string[] }> = [
  { key: "all", label: "全部人员", positions: [] },
  { key: "craftsman", label: "师傅档案", positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "salesService", label: "销售客服", positions: ["SALES", "CUSTOMER_SERVICE"] },
  { key: "backOffice", label: "后勤岗位", positions: ["PURCHASING", "FINANCE", "SCHEDULER"] },
  { key: "permission", label: "权限与邀请", positions: [] }
];

const MEMBER_RELATED_WORKSPACES = [
  { label: "施工派单", description: "待派单、已派工和施工进度", href: "/construction/assignments" },
  { label: "施工容量", description: "维护每日容量和预约上限", href: "/construction/capacities" },
  { label: "请假审批", description: "审批师傅请假并影响派单可用性", href: "/construction/leave-approvals" }
];
```

- [ ] **Step 2: Add query-driven active member view**

Inside `MembersPage`, after `storeId`:

```ts
const router = useRouter();
const searchParams = useSearchParams();
const requestedView = searchParams.get("view") as MemberViewKey | null;
const legacyConstructionPosition = searchParams.get("position") === "CONSTRUCTION";
const initialView: MemberViewKey = legacyConstructionPosition
  ? "craftsman"
  : MEMBER_VIEW_TABS.some((item) => item.key === requestedView)
    ? requestedView!
    : "all";
const [activeMemberView, setActiveMemberViewState] = useState<MemberViewKey>(initialView);
const setActiveMemberView = (view: MemberViewKey) => {
  setActiveMemberViewState(view);
  const params = new URLSearchParams(searchParams.toString());
  if (view === "all") {
    params.delete("view");
    params.delete("position");
  } else {
    params.set("view", view);
    params.delete("position");
  }
  const query = params.toString();
  router.replace(query ? `/members?${query}` : "/members");
  if (view === "craftsman") setInvitePosition("CONSTRUCTION");
  if (view === "salesService") setInvitePosition("SALES");
  if (view === "backOffice") setInvitePosition("PURCHASING");
};
```

- [ ] **Step 3: Apply view filtering before keyword filtering**

Replace `filteredMembers` with:

```ts
const activeViewConfig = MEMBER_VIEW_TABS.find((item) => item.key === activeMemberView) ?? MEMBER_VIEW_TABS[0];
const viewMembers = useMemo(() => {
  if (activeViewConfig.positions.length === 0) return members;
  return members.filter((member) => activeViewConfig.positions.includes(member.position));
}, [activeViewConfig.positions, members]);

const filteredMembers = useMemo(() => {
  const normalized = keyword.trim().toLowerCase();
  return viewMembers.filter((member) => {
    const matchesKeyword = !normalized || [
      member.user.username,
      member.user.nickname ?? "",
      POSITION_LABEL[member.position as StorePosition] ?? member.position
    ].some((value) => value.toLowerCase().includes(normalized));
    const matchesPosition = positionFilter === "ALL" || member.position === positionFilter;
    return matchesKeyword && matchesPosition;
  });
}, [keyword, positionFilter, viewMembers]);
```

- [ ] **Step 4: Replace mixed Link tabs with internal view buttons**

Replace the existing `<nav className="members-module-tabs">...</nav>` with:

```tsx
<nav className="members-module-tabs" aria-label="人员视图切换">
  {MEMBER_VIEW_TABS.map((item) => (
    <button
      key={item.key}
      type="button"
      className={`members-module-tab${activeMemberView === item.key ? " is-active" : ""}`}
      aria-pressed={activeMemberView === item.key}
      onClick={() => setActiveMemberView(item.key)}
    >
      <TeamOutlined />
      {item.label}
    </button>
  ))}
</nav>
```

- [ ] **Step 5: Add related workspace cards below KPI**

Add this after the KPI section:

```tsx
<section className="members-related-workspaces" aria-label="相关工作区">
  {MEMBER_RELATED_WORKSPACES.map((item) => (
    <Link key={item.href} href={item.href} className="members-related-workspace">
      <CalendarOutlined />
      <span>{item.label}</span>
      <small>{item.description}</small>
    </Link>
  ))}
</section>
```

- [ ] **Step 6: Update CSS for button tabs and related cards**

In `apps/web/app/globals.css`, update `.members-module-tab` to support `button` elements:

```css
.members-module-tab {
  appearance: none;
  border: 0;
  background: transparent;
  cursor: pointer;
}
```

Add:

```css
.members-related-workspaces {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.members-related-workspace {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px 10px;
  border: 1px solid var(--mb-border);
  border-radius: var(--mb-radius-md);
  background: var(--mb-surface);
  padding: 14px 16px;
  color: var(--mb-text-primary);
  text-decoration: none;
  box-shadow: var(--mb-shadow-sm);
}

.members-related-workspace .anticon {
  grid-row: span 2;
  color: var(--mb-primary);
  font-size: 18px;
}

.members-related-workspace span {
  font-size: 14px;
  font-weight: 850;
  line-height: 20px;
}

.members-related-workspace small {
  color: var(--mb-text-muted);
  font-size: 12px;
  line-height: 18px;
}

@media (max-width: 900px) {
  .members-related-workspaces {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 7: Run member tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/members/members-page.test.ts
```

Expected: PASS for member page tests.

---

## Task 3: Enrich Leave API Response For Manager Approval

**Files:**
- Modify: `apps/api/src/construction/construction.service.ts`
- Modify: `apps/api/src/construction/construction.service.test.ts`
- Modify: `apps/web/src/features/construction/api.ts`

- [ ] **Step 1: Add failing API test for worker summary**

In `apps/api/src/construction/construction.service.test.ts`, add:

```ts
test("ConstructionService lists leave requests with worker summary for dispatchers", async () => {
  const prisma = createPrismaMock();
  prisma.storeMember.findFirst = async () => ({ storeId: "store-1", position: StorePosition.MANAGER });
  prisma.leaveRequest.findMany = async (args: unknown) => {
    assert.deepEqual(args, {
      where: { storeId: "store-1" },
      orderBy: { createdAt: "desc" },
      include: { worker: { select: { id: true, username: true, nickname: true, avatarUrl: true } } }
    });
    return [
      {
        id: "leave-1",
        storeId: "store-1",
        workerId: "worker-1",
        startDate: new Date("2026-06-21"),
        endDate: new Date("2026-06-22"),
        reason: "家中有事",
        status: "PENDING",
        worker: { id: "worker-1", username: "shigong", nickname: "施工师傅", avatarUrl: null }
      }
    ];
  };

  const service = createConstructionService(prisma);
  const result = await service.listLeaves(managerUser(), "store-1");

  assert.equal(result[0].worker.username, "shigong");
});
```

- [ ] **Step 2: Run API test and verify failure**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- src/construction/construction.service.test.ts
```

Expected: FAIL because `listLeaves` does not include `worker`.

- [ ] **Step 3: Implement enriched listLeaves**

Change `listLeaves` in `apps/api/src/construction/construction.service.ts` to:

```ts
return this.prisma.leaveRequest.findMany({
  where: { storeId },
  orderBy: { createdAt: "desc" },
  include: {
    worker: {
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarUrl: true
      }
    }
  }
});
```

- [ ] **Step 4: Add typed web API summary**

In `apps/web/src/features/construction/api.ts`, add:

```ts
export type LeaveRequestSummary = {
  id: string;
  storeId: string;
  workerId: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt?: string;
  updatedAt?: string;
  worker?: {
    id: string;
    username: string;
    nickname?: string | null;
    avatarUrl?: string | null;
  } | null;
};
```

Then change:

```ts
leaves: (storeId: string) => request<LeaveRequestSummary[]>(`/construction/leaves${toQueryString({ storeId })}`),
updateLeave: (id: string, status: LeaveRequestSummary["status"]) =>
  request<LeaveRequestSummary>(`/construction/leaves/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  }),
```

- [ ] **Step 5: Run API and web typecheck**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- src/construction/construction.service.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

Expected: PASS.

---

## Task 4: Add Leave Approval Helpers

**Files:**
- Create: `apps/web/src/features/construction/leave-approvals.ts`
- Create: `apps/web/src/features/construction/leave-approvals.test.ts`

- [ ] **Step 1: Write helper tests**

Create `apps/web/src/features/construction/leave-approvals.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLeaveApprovalCounts,
  getLeaveApprovalRows,
  getLeaveRequestStatusLabel,
  getLeaveWorkerLabel
} from "./leave-approvals";

const rows = [
  { id: "pending", status: "PENDING", workerId: "w1", startDate: "2026-06-21", endDate: "2026-06-22", worker: { username: "shigong", nickname: "施工师傅" } },
  { id: "approved", status: "APPROVED", workerId: "w2", startDate: "2026-06-20", endDate: "2026-06-20", worker: { username: "apprentice", nickname: null } },
  { id: "rejected", status: "REJECTED", workerId: "w3", startDate: "2026-06-19", endDate: "2026-06-19" }
] as const;

test("getLeaveApprovalRows filters by status queue", () => {
  assert.deepEqual(getLeaveApprovalRows(rows, "pending").map((row) => row.id), ["pending"]);
  assert.deepEqual(getLeaveApprovalRows(rows, "approved").map((row) => row.id), ["approved"]);
  assert.deepEqual(getLeaveApprovalRows(rows, "rejected").map((row) => row.id), ["rejected"]);
  assert.equal(getLeaveApprovalRows(rows, "all").length, 3);
});

test("buildLeaveApprovalCounts counts approval queues", () => {
  assert.deepEqual(buildLeaveApprovalCounts(rows), {
    all: 3,
    pending: 1,
    approved: 1,
    rejected: 1
  });
});

test("leave approval display helpers use business labels", () => {
  assert.equal(getLeaveRequestStatusLabel("PENDING"), "待审批");
  assert.equal(getLeaveRequestStatusLabel("APPROVED"), "已通过");
  assert.equal(getLeaveRequestStatusLabel("REJECTED"), "已驳回");
  assert.equal(getLeaveWorkerLabel(rows[0]), "施工师傅 @shigong");
  assert.equal(getLeaveWorkerLabel(rows[2]), "施工人员待确认");
});
```

- [ ] **Step 2: Run helper tests and verify failure**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/leave-approvals.test.ts
```

Expected: FAIL because helper file does not exist.

- [ ] **Step 3: Implement helpers**

Create `apps/web/src/features/construction/leave-approvals.ts`:

```ts
import type { LeaveRequestSummary } from "./api";

export type LeaveApprovalQueue = "all" | "pending" | "approved" | "rejected";

export function getLeaveRequestStatusLabel(status?: string | null) {
  if (status === "PENDING") return "待审批";
  if (status === "APPROVED") return "已通过";
  if (status === "REJECTED") return "已驳回";
  return "状态待确认";
}

export function getLeaveWorkerLabel(row: Pick<LeaveRequestSummary, "worker" | "workerId">) {
  if (!row.worker) return "施工人员待确认";
  const name = row.worker.nickname ?? row.worker.username;
  return `${name} @${row.worker.username}`;
}

export function getLeaveApprovalRows<T extends { status: string }>(rows: readonly T[], queue: LeaveApprovalQueue) {
  if (queue === "pending") return rows.filter((row) => row.status === "PENDING");
  if (queue === "approved") return rows.filter((row) => row.status === "APPROVED");
  if (queue === "rejected") return rows.filter((row) => row.status === "REJECTED");
  return [...rows];
}

export function buildLeaveApprovalCounts(rows: readonly { status: string }[]) {
  return {
    all: rows.length,
    pending: rows.filter((row) => row.status === "PENDING").length,
    approved: rows.filter((row) => row.status === "APPROVED").length,
    rejected: rows.filter((row) => row.status === "REJECTED").length
  };
}

export function formatLeaveDateRange(row: Pick<LeaveRequestSummary, "startDate" | "endDate">) {
  const start = String(row.startDate).slice(0, 10);
  const end = String(row.endDate).slice(0, 10);
  return start === end ? start : `${start} 至 ${end}`;
}
```

- [ ] **Step 4: Run helper tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/leave-approvals.test.ts
```

Expected: PASS.

---

## Task 5: Build Manager Leave Approval Page

**Files:**
- Create: `apps/web/app/construction/leave-approvals/page.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/src/features/construction/tasks-page.test.ts`

- [ ] **Step 1: Add failing page test**

In `apps/web/src/features/construction/tasks-page.test.ts`, add:

```ts
test("construction leave approvals page is a manager desktop approval console", () => {
  const pageSource = readFileSync("app/construction/leave-approvals/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /请假审批/);
  assert.match(pageSource, /construction-leave-approval-page/);
  assert.match(pageSource, /constructionApi\.leaves/);
  assert.match(pageSource, /constructionApi\.updateLeave/);
  assert.match(pageSource, /待审批/);
  assert.match(pageSource, /已通过/);
  assert.match(pageSource, /已驳回/);
  assert.match(pageSource, /批准请假/);
  assert.match(pageSource, /驳回申请/);
  assert.match(cssSource, /\.construction-leave-approval-page/);
  assert.match(cssSource, /\.construction-leave-approval-grid/);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts
```

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement page skeleton and data flow**

Create `apps/web/app/construction/leave-approvals/page.tsx` with these responsibilities:

```tsx
"use client";

import { App, Button, Card, Empty, Table, Tag } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { constructionApi } from "../../../src/features/construction/api";
import type { LeaveApprovalQueue } from "../../../src/features/construction/leave-approvals";
import {
  buildLeaveApprovalCounts,
  formatLeaveDateRange,
  getLeaveApprovalRows,
  getLeaveRequestStatusLabel,
  getLeaveWorkerLabel
} from "../../../src/features/construction/leave-approvals";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

export default function LeaveApprovalsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const [queue, setQueue] = useState<LeaveApprovalQueue>("pending");

  const leavesQuery = useQuery({
    queryKey: ["construction-leave-approvals", storeId],
    queryFn: () => constructionApi.leaves(storeId!),
    enabled: Boolean(storeId)
  });

  const rows = useMemo(() => leavesQuery.data ?? [], [leavesQuery.data]);
  const counts = buildLeaveApprovalCounts(rows);
  const visibleRows = getLeaveApprovalRows(rows, queue);

  const updateLeave = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) => constructionApi.updateLeave(id, status),
    onSuccess: async () => {
      message.success("请假审批已更新");
      await queryClient.invalidateQueries({ queryKey: ["construction-leave-approvals", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page construction-leave-approval-page">
      <StorePageHeader title="请假审批" description="审批施工人员请假申请，审批通过后将影响派单可用性。" />
      <section className="construction-leave-approval-tabs" aria-label="请假审批队列">
        {[
          ["pending", "待审批", counts.pending],
          ["approved", "已通过", counts.approved],
          ["rejected", "已驳回", counts.rejected],
          ["all", "全部记录", counts.all]
        ].map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={queue === key ? "is-active" : undefined}
            onClick={() => setQueue(key as LeaveApprovalQueue)}
          >
            {label}<strong>{count}</strong>
          </button>
        ))}
      </section>
      <section className="construction-leave-approval-grid">
        <Card title="请假申请列表" className="construction-leave-approval-list">
          <Table
            rowKey="id"
            loading={leavesQuery.isLoading}
            dataSource={visibleRows}
            locale={{ emptyText: <Empty description="暂无请假申请" /> }}
            pagination={{ pageSize: 8 }}
            columns={[
              { title: "施工人员", render: (_, row) => getLeaveWorkerLabel(row) },
              { title: "请假日期", render: (_, row) => formatLeaveDateRange(row) },
              { title: "事由", dataIndex: "reason", render: (value) => value ?? "-" },
              { title: "状态", render: (_, row) => <Tag>{getLeaveRequestStatusLabel(row.status)}</Tag> },
              {
                title: "操作",
                render: (_, row) => (
                  <div className="construction-leave-approval-actions">
                    <Button
                      icon={<CheckCircleOutlined />}
                      disabled={row.status !== "PENDING"}
                      loading={updateLeave.isPending}
                      onClick={() => updateLeave.mutate({ id: row.id, status: "APPROVED" })}
                    >
                      批准请假
                    </Button>
                    <Button
                      danger
                      icon={<CloseCircleOutlined />}
                      disabled={row.status !== "PENDING"}
                      loading={updateLeave.isPending}
                      onClick={() => updateLeave.mutate({ id: row.id, status: "REJECTED" })}
                    >
                      驳回申请
                    </Button>
                  </div>
                )
              }
            ]}
          />
        </Card>
        <Card title="审批说明" className="construction-leave-approval-note">
          <p>审批通过后，该施工人员在请假日期内不可被派单。</p>
          <p>驳回后，施工人员仍可正常参与派单和排班。</p>
        </Card>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add page CSS**

Add to `apps/web/app/globals.css`:

```css
.construction-leave-approval-page {
  display: grid;
  gap: 18px;
}

.construction-leave-approval-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  border-bottom: 1px solid var(--mb-border);
  padding-bottom: 8px;
}

.construction-leave-approval-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--mb-text-secondary);
  cursor: pointer;
  font-size: 14px;
  font-weight: 850;
  padding: 10px 16px;
  white-space: nowrap;
}

.construction-leave-approval-tabs button.is-active {
  border-bottom-color: var(--mb-primary);
  color: var(--mb-primary);
}

.construction-leave-approval-tabs strong {
  margin-left: 8px;
  color: inherit;
}

.construction-leave-approval-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.34fr);
  gap: 18px;
  align-items: start;
}

.construction-leave-approval-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.construction-leave-approval-note p {
  margin: 0 0 10px;
  color: var(--mb-text-secondary);
  font-size: 13px;
  line-height: 20px;
}

@media (max-width: 900px) {
  .construction-leave-approval-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 5: Run page tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/construction/tasks-page.test.ts src/features/construction/leave-approvals.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

Expected: PASS.

---

## Task 6: Keep Management Shell Boundaries Correct

**Files:**
- Modify: `apps/web/src/features/workbench/management-shell.tsx`
- Modify: `apps/web/src/features/workbench/management-shell.test.ts`

- [ ] **Step 1: Add failing shell test**

In `management-shell.test.ts`, add:

```ts
test("management shell wraps manager leave approvals but excludes mobile leave application", () => {
  assert.equal(shouldUseManagementShell("/construction/leave-approvals"), true);
  assert.equal(shouldUseManagementShell("/construction/leaves"), false);
});
```

- [ ] **Step 2: Run test and verify current behavior**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/workbench/management-shell.test.ts
```

Expected: PASS if `/construction/leave-approvals` is not under the excluded `/construction/leaves` prefix. If it fails, check `mobilePrefixes` ordering and route names.

- [ ] **Step 3: Add search placeholder**

In `getManagementSearchPlaceholder`, before the generic construction checks:

```ts
if (pathname.startsWith("/construction/leave-approvals")) return "搜索师傅、请假日期或状态...";
```

- [ ] **Step 4: Run shell tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/workbench/management-shell.test.ts
```

Expected: PASS.

---

## Task 7: Update Member Navigation To Approval Route

**Files:**
- Modify: `apps/web/app/members/page.tsx`
- Modify: `apps/web/src/features/members/members-page.test.ts`

- [ ] **Step 1: Verify link target**

Ensure `MEMBER_RELATED_WORKSPACES` contains:

```ts
{ label: "请假审批", description: "审批师傅请假并影响派单可用性", href: "/construction/leave-approvals" }
```

- [ ] **Step 2: Ensure misleading labels are removed**

The old tab labels must no longer sit in `members-module-tabs`:

```tsx
<nav className="members-module-tabs" aria-label="人员视图切换">
```

The cross-module labels must live under:

```tsx
<section className="members-related-workspaces" aria-label="相关工作区">
```

- [ ] **Step 3: Run member tests**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- src/features/members/members-page.test.ts
```

Expected: PASS.

---

## Task 8: End-To-End Verification

**Files:** No code files.

- [ ] **Step 1: Run targeted API tests**

```bash
corepack pnpm --filter @mallbay/api test -- src/construction/construction.service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run targeted Web tests**

```bash
corepack pnpm --filter @mallbay/web test -- src/features/members/members-page.test.ts src/features/construction/tasks-page.test.ts src/features/construction/leave-approvals.test.ts src/features/workbench/management-shell.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck and diff checks**

```bash
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Browser verification**

With local dev services running:

```bash
corepack pnpm dev:api
corepack pnpm dev:web
```

Verify manually in browser:

1. Open `http://localhost:3000/members`.
2. Click `师傅档案`; list shows only `施工员/学徒`, active tab changes.
3. Open `http://localhost:3000/members?position=CONSTRUCTION`; page opens in `师傅档案` view.
4. Click related card `请假审批`; route is `/construction/leave-approvals`, side menu active remains `施工管理`.
5. In `/construction/leave-approvals`, pending requests can be approved/rejected.
6. Open `/construction/leaves`; it remains the mobile施工员请假申请页面 and does not show management shell.

- [ ] **Step 5: Final lint for touched files**

```bash
corepack pnpm exec eslint \
  apps/web/app/members/page.tsx \
  apps/web/app/construction/leave-approvals/page.tsx \
  apps/web/src/features/members/members-page.test.ts \
  apps/web/src/features/construction/leave-approvals.ts \
  apps/web/src/features/construction/leave-approvals.test.ts \
  apps/web/src/features/workbench/management-shell.tsx \
  apps/web/src/features/workbench/management-shell.test.ts \
  apps/api/src/construction/construction.service.ts \
  apps/api/src/construction/construction.service.test.ts
```

Expected: exit 0.

---

## Rollout Notes

- No database migration is required.
- `/construction/leaves` remains worker mobile leave application.
- `/construction/leave-approvals` is the manager/scheduler desktop approval console.
- `/members?position=CONSTRUCTION` remains compatible and maps to the new `师傅档案` member view.
- The personnel page no longer treats construction workspaces as tabs; they become related workspace cards.
