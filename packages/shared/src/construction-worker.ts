export type WorkerTaskStatus = "PENDING_DISPATCH" | "DISPATCHED" | "IN_CONSTRUCTION" | "COMPLETED";

export type WorkerTaskSegmentKey = "today" | "pending" | "active" | "completed";

export type WorkerTaskSummary = {
  id: string;
  orderId: string;
  status: WorkerTaskStatus | string;
  appointmentDate?: string | null;
};

const WORKER_TASK_STATUS_LABELS: Record<string, string> = {
  PENDING_DISPATCH: "待派工",
  DISPATCHED: "待开工",
  IN_CONSTRUCTION: "施工中",
  COMPLETED: "已完工"
};

const WORKER_PHOTO_STAGE_LABELS: Record<string, string> = {
  BEFORE: "施工前",
  DURING: "施工中",
  AFTER: "施工后"
};

const WORKER_LEAVE_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审批",
  APPROVED: "已批准",
  REJECTED: "已驳回"
};

const WORKER_SCHEDULE_STATUS_LABELS: Record<string, string> = {
  WORKING: "店内排班",
  OUTSIDE: "外出施工",
  REST: "休息"
};

export function getWorkerTaskStatusLabel(status?: string | null) {
  if (!status) return "状态待确认";
  return WORKER_TASK_STATUS_LABELS[status] ?? "状态待确认";
}

export function getWorkerPhotoStageLabel(stage?: string | null) {
  if (!stage) return "照片阶段待确认";
  return WORKER_PHOTO_STAGE_LABELS[stage] ?? "照片阶段待确认";
}

export function getWorkerLeaveStatusLabel(status?: string | null) {
  if (!status) return "审批状态待确认";
  return WORKER_LEAVE_STATUS_LABELS[status] ?? "审批状态待确认";
}

export function getWorkerScheduleStatusLabel(status?: string | null) {
  if (!status) return "排班状态待确认";
  return WORKER_SCHEDULE_STATUS_LABELS[status] ?? "排班状态待确认";
}

export function buildWorkerTaskSegments(rows: WorkerTaskSummary[], today = new Date().toISOString().slice(0, 10)) {
  return [
    {
      key: "today" as const,
      label: "今日任务",
      count: rows.filter((row) => row.appointmentDate?.slice(0, 10) === today).length
    },
    {
      key: "pending" as const,
      label: "待开工",
      count: rows.filter((row) => row.status === "DISPATCHED" || row.status === "PENDING_DISPATCH").length
    },
    {
      key: "active" as const,
      label: "施工中",
      count: rows.filter((row) => row.status === "IN_CONSTRUCTION").length
    },
    {
      key: "completed" as const,
      label: "已完成",
      count: rows.filter((row) => row.status === "COMPLETED").length
    }
  ];
}

export function filterWorkerTasks(rows: WorkerTaskSummary[], segment: WorkerTaskSegmentKey, today = new Date().toISOString().slice(0, 10)) {
  if (segment === "today") return rows.filter((row) => row.appointmentDate?.slice(0, 10) === today);
  if (segment === "pending") return rows.filter((row) => row.status === "DISPATCHED" || row.status === "PENDING_DISPATCH");
  if (segment === "active") return rows.filter((row) => row.status === "IN_CONSTRUCTION");
  return rows.filter((row) => row.status === "COMPLETED");
}
