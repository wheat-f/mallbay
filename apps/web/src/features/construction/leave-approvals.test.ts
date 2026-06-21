import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildLeaveApprovalCounts,
  formatLeaveDateRange,
  getLeaveApprovalRows,
  getLeaveRequestStatusLabel,
  getLeaveWorkerLabel,
  type LeaveApprovalQueue
} from "./leave-approvals";
import type { LeaveRequestSummary } from "./api";

const rows: LeaveRequestSummary[] = [
  {
    id: "leave-1",
    storeId: "store-1",
    workerId: "worker-1",
    startDate: "2026-06-21T00:00:00.000Z",
    endDate: "2026-06-22T00:00:00.000Z",
    reason: "病假: 感冒",
    status: "PENDING",
    worker: { id: "worker-1", username: "shigong", nickname: "施工师傅", avatarUrl: null }
  },
  {
    id: "leave-2",
    storeId: "store-1",
    workerId: "worker-2",
    startDate: "2026-06-23T00:00:00.000Z",
    endDate: "2026-06-23T00:00:00.000Z",
    reason: "事假",
    status: "APPROVED",
    worker: { id: "worker-2", username: "xue徒", nickname: null, avatarUrl: null }
  }
];

test("leave approval helpers format worker status and date labels", () => {
  assert.equal(getLeaveRequestStatusLabel("PENDING"), "待审批");
  assert.equal(getLeaveRequestStatusLabel("APPROVED"), "已批准");
  assert.equal(getLeaveRequestStatusLabel("REJECTED"), "已驳回");
  assert.equal(getLeaveWorkerLabel(rows[0]), "施工师傅 @shigong");
  assert.equal(getLeaveWorkerLabel({ ...rows[0], worker: null }), "施工人员待确认");
  assert.equal(formatLeaveDateRange(rows[0].startDate, rows[0].endDate), "2026-06-21 至 2026-06-22");
  assert.equal(formatLeaveDateRange(rows[1].startDate, rows[1].endDate), "2026-06-23");
});

test("leave approval helpers build queue counts and filtered rows", () => {
  const counts = buildLeaveApprovalCounts(rows);

  assert.deepEqual(counts, { all: 2, pending: 1, approved: 1, rejected: 0 });
  assert.equal(getLeaveApprovalRows(rows, "pending").length, 1);
  assert.equal(getLeaveApprovalRows(rows, "approved").length, 1);
  assert.equal(getLeaveApprovalRows(rows, "rejected").length, 0);
  assert.equal(getLeaveApprovalRows(rows, "all", "施工师傅")[0].id, "leave-1");
  assert.equal(getLeaveApprovalRows(rows, "all", "感冒")[0].id, "leave-1");
});

test("leave approval queue type covers manager review states", () => {
  const queues: LeaveApprovalQueue[] = ["pending", "approved", "rejected", "all"];

  assert.deepEqual(queues, ["pending", "approved", "rejected", "all"]);
});

test("construction leave approvals page is a management shell page", () => {
  const pagePath = "app/construction/leave-approvals/page.tsx";

  assert.equal(existsSync(pagePath), true);

  const source = readFileSync(pagePath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(source, /StorePageHeader/);
  assert.match(source, /请假审批/);
  assert.match(source, /construction-leave-approval-page/);
  assert.match(source, /constructionApi\.leaves/);
  assert.match(source, /constructionApi\.updateLeave/);
  assert.match(source, /construction-leave-approvals", storeId/);
  assert.match(source, /待审批/);
  assert.match(source, /已批准/);
  assert.match(source, /已驳回/);
  assert.match(source, /批准/);
  assert.match(source, /驳回/);
  assert.doesNotMatch(source, /ConstructionMobileShell/);
  assert.match(cssSource, /\.construction-leave-approval-page/);
  assert.match(cssSource, /\.construction-leave-approval-tabs/);
  assert.match(cssSource, /\.construction-leave-approval-grid/);
  assert.match(cssSource, /\.construction-leave-approval-actions/);
});
