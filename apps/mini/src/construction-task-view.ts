import type { OfflineOperationStatus, OfflineOperationType } from "./offline-queue";
import {
  buildWorkerTaskSegments,
  filterWorkerTasks,
  getWorkerPhotoStageLabel,
  getWorkerScheduleStatusLabel,
  getWorkerTaskStatusLabel,
  type ScheduleStatus,
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

export type CachedWorkerSchedule = {
  id: string;
  date: string;
  status: ScheduleStatus;
  note?: string | null;
  worker?: {
    username?: string | null;
    nickname?: string | null;
  } | null;
};

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

export function buildScheduleListItems(items: CachedWorkerSchedule[]) {
  return items.map((item) => ({
    id: item.id,
    date: item.date.slice(0, 10),
    statusLabel: getWorkerScheduleStatusLabel(item.status),
    note: item.note?.trim() || getScheduleFallbackNote(item.status),
    workerName: item.worker?.nickname || item.worker?.username || "我的排班"
  }));
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

function getScheduleFallbackNote(status: ScheduleStatus) {
  if (status === "WORKING") return "店内可施工";
  if (status === "OUTSIDE") return "外出施工";
  if (status === "REST") return "休息";
  return "排班待确认";
}

function getCustomerLabel(customer?: NonNullable<MiniAssignmentRecord["order"]>["customer"]) {
  if (!customer) return "客户待同步";
  return customer.name?.trim()
    || customer.companyName?.trim()
    || customer.contactName?.trim()
    || customer.phone?.trim()
    || "客户待同步";
}

function getVehicleLabel(vehicle?: NonNullable<MiniAssignmentRecord["order"]>["vehicle"]) {
  if (!vehicle) return "车辆待同步";
  return [vehicle.plateNo, vehicle.brand, vehicle.model ?? vehicle.carModel, vehicle.color]
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
