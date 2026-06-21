import type { OfflineOperationStatus, OfflineOperationType } from "./offline-queue";
import {
  buildWorkerTaskSegments,
  filterWorkerTasks,
  getWorkerPhotoStageLabel,
  getWorkerTaskStatusLabel,
  type WorkerTaskSegmentKey
} from "@mallbay/shared";

export type CachedConstructionTaskStatus = "DISPATCHED" | "IN_CONSTRUCTION" | "COMPLETED";
export type OfflineTaskStatus = "IN_CONSTRUCTION" | "COMPLETED";
export type ConstructionPhotoStage = "BEFORE" | "DURING" | "AFTER";

export type CachedConstructionTask = {
  id: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  vehicleLabel: string;
  constructionType: string;
  constructionLocation: string;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  outsideAddress?: string;
  status: CachedConstructionTaskStatus;
  photoStages: ConstructionPhotoStage[];
};

export type MiniOfflineOperation = {
  id: string;
  type: OfflineOperationType;
  attempts: number;
  status: OfflineOperationStatus;
};

const PHOTO_STAGES: { stage: ConstructionPhotoStage; label: string }[] = [
  { stage: "BEFORE", label: getWorkerPhotoStageLabel("BEFORE") },
  { stage: "DURING", label: getWorkerPhotoStageLabel("DURING") },
  { stage: "AFTER", label: getWorkerPhotoStageLabel("AFTER") }
];

const STATUS_ACTIONS: Record<CachedConstructionTaskStatus, { status: OfflineTaskStatus; label: string; disabled: boolean }[]> = {
  DISPATCHED: [{ status: "IN_CONSTRUCTION", label: "开工", disabled: false }],
  IN_CONSTRUCTION: [{ status: "COMPLETED", label: "完工", disabled: false }],
  COMPLETED: []
};

export function buildTaskListItems(tasks: CachedConstructionTask[]) {
  return tasks.map((task) => {
    const schedule = [
      formatSchedule(task),
      task.constructionLocation,
      task.outsideAddress
    ].filter(Boolean).join(" · ");
    return {
      id: task.id,
      title: `${task.orderNo} · ${task.customerName}`,
      meta: task.vehicleLabel,
      schedule,
      statusLabel: getWorkerTaskStatusLabel(task.status),
      photoProgress: `照片 ${countKnownPhotoStages(task.photoStages)}/3`
    };
  });
}

export function buildTaskDetailView(task: CachedConstructionTask) {
  return {
    id: task.id,
    orderId: task.orderId,
    title: task.orderNo,
    statusLabel: getWorkerTaskStatusLabel(task.status),
    customerVehicle: `${task.customerName} · ${task.vehicleLabel}`,
    construction: `${task.constructionType} · ${task.constructionLocation}`,
    schedule: formatSchedule(task),
    address: task.outsideAddress ?? "到店施工",
    statusActions: STATUS_ACTIONS[task.status],
    photoStages: PHOTO_STAGES.map((item) => ({
      ...item,
      uploaded: task.photoStages.includes(item.stage)
    }))
  };
}

export function buildTaskSegments(tasks: CachedConstructionTask[], today?: string) {
  return buildWorkerTaskSegments(tasks, today);
}

export function filterTasksBySegment(tasks: CachedConstructionTask[], segment: WorkerTaskSegmentKey, today?: string) {
  return filterWorkerTasks(tasks, segment, today) as CachedConstructionTask[];
}

export function buildOfflineQueueSummary(items: MiniOfflineOperation[]) {
  const failed = items.filter((item) => item.status === "FAILED").length;
  const pending = items.filter((item) => item.status === "PENDING").length;
  const retrying = items.filter((item) => item.status === "PENDING" && item.attempts > 0).length;
  return {
    total: items.length,
    pending,
    retrying,
    failed,
    description: `待同步 ${pending} 条，重试中 ${retrying} 条，失败 ${failed} 条`
  };
}

export function buildPhotoUploadOperationInput(
  recordId: string,
  stage: ConstructionPhotoStage,
  localPath: string,
  takenAt?: string
) {
  const payload: { recordId: string; stage: ConstructionPhotoStage; localPath: string; takenAt?: string } = {
    recordId,
    stage,
    localPath
  };
  if (takenAt) {
    payload.takenAt = takenAt;
  }
  return {
    type: "PHOTO_UPLOAD" as const,
    payload
  };
}

export function buildLeaveRequestOperationInput(
  storeId: string,
  startDate: string,
  endDate: string,
  reason?: string
) {
  return {
    type: "LEAVE_REQUEST" as const,
    payload: {
      storeId,
      startDate,
      endDate,
      reason
    }
  };
}

export function buildTaskStatusOperationInput(orderId: string, status: OfflineTaskStatus, occurredAt?: string) {
  const payload: { orderId: string; status: OfflineTaskStatus; startedAt?: string; completedAt?: string } = {
    orderId,
    status
  };
  if (status === "IN_CONSTRUCTION" && occurredAt) {
    payload.startedAt = occurredAt;
  }
  if (status === "COMPLETED" && occurredAt) {
    payload.completedAt = occurredAt;
  }
  return {
    type: "TASK_STATUS" as const,
    payload
  };
}

function countKnownPhotoStages(stages: ConstructionPhotoStage[]) {
  return PHOTO_STAGES.filter((item) => stages.includes(item.stage)).length;
}

function formatSchedule(task: CachedConstructionTask) {
  return [task.appointmentDate, task.appointmentTimeSlot].filter(Boolean).join(" ");
}
