import type { LeaveRequestSummary } from "./api";

export type LeaveApprovalQueue = "all" | "pending" | "approved" | "rejected";

export type LeaveApprovalCounts = Record<LeaveApprovalQueue, number>;

export function getLeaveRequestStatusLabel(status: LeaveRequestSummary["status"]) {
  if (status === "APPROVED") return "已批准";
  if (status === "REJECTED") return "已驳回";
  return "待审批";
}

export function getLeaveRequestStatusColor(status: LeaveRequestSummary["status"]) {
  if (status === "APPROVED") return "green";
  if (status === "REJECTED") return "red";
  return "gold";
}

export function getLeaveWorkerLabel(row: LeaveRequestSummary) {
  if (!row.worker) return "施工人员待确认";
  const displayName = row.worker.nickname ?? row.worker.username;
  return `${displayName} @${row.worker.username}`;
}

export function formatLeaveDateRange(startDate: string, endDate: string) {
  const start = formatDatePart(startDate);
  const end = formatDatePart(endDate);
  if (start === end) return start;
  return `${start} 至 ${end}`;
}

export function buildLeaveApprovalCounts(rows: LeaveRequestSummary[]): LeaveApprovalCounts {
  return {
    all: rows.length,
    pending: rows.filter((row) => row.status === "PENDING").length,
    approved: rows.filter((row) => row.status === "APPROVED").length,
    rejected: rows.filter((row) => row.status === "REJECTED").length
  };
}

export function getLeaveApprovalRows(
  rows: LeaveRequestSummary[],
  queue: LeaveApprovalQueue,
  keyword = ""
) {
  const normalized = keyword.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesQueue =
      queue === "all" ||
      (queue === "pending" && row.status === "PENDING") ||
      (queue === "approved" && row.status === "APPROVED") ||
      (queue === "rejected" && row.status === "REJECTED");
    const matchesKeyword = !normalized || [
      getLeaveWorkerLabel(row),
      row.reason ?? "",
      row.status,
      getLeaveRequestStatusLabel(row.status),
      formatLeaveDateRange(row.startDate, row.endDate)
    ].some((value) => value.toLowerCase().includes(normalized));
    return matchesQueue && matchesKeyword;
  });
}

function formatDatePart(value: string) {
  if (!value) return "日期待确认";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10) || "日期待确认";
  return parsed.toISOString().slice(0, 10);
}
