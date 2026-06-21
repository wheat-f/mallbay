import { getWorkerPhotoStageLabel } from "@mallbay/shared";

type ConstructionWorkerLike = {
  userId?: string | null;
  skillTags?: string[] | null;
  user?: {
    username?: string | null;
    nickname?: string | null;
  } | null;
};

export const CONSTRUCTION_PHOTO_STAGE_LABELS: Record<string, string> = {
  BEFORE: "施工前",
  DURING: "施工中",
  AFTER: "施工后"
};

export const CONSTRUCTION_STATUS_LABELS: Record<string, string> = {
  DISPATCHED: "已派工",
  IN_CONSTRUCTION: "施工中",
  COMPLETED: "已完工"
};

export const CONSTRUCTION_QUALITY_RESULT_LABELS: Record<string, string> = {
  PASS: "通过",
  REWORK_REQUIRED: "需要返工"
};

export function getConstructionStatusLabel(status?: string | null) {
  if (!status) return "-";
  return CONSTRUCTION_STATUS_LABELS[status] ?? "施工状态待确认";
}

export function getConstructionQualityResultLabel(result?: string | null) {
  if (!result) return "-";
  return CONSTRUCTION_QUALITY_RESULT_LABELS[result] ?? "质检结果待确认";
}

export function getConstructionPhotoStageLabel(stage?: string | null) {
  if (!stage) return "-";
  return getWorkerPhotoStageLabel(stage);
}

export function getConstructionWorkerLabel(worker?: ConstructionWorkerLike | string | null) {
  if (!worker) return "-";
  if (typeof worker === "string") return formatWorkerIdFallback(worker);

  const displayName = worker.user?.nickname ?? worker.user?.username;
  const skills = worker.skillTags?.length ? ` · ${worker.skillTags.join("/")}` : "";
  return displayName ? `${displayName}${skills}` : `${formatWorkerIdFallback(worker.userId)}${skills}`;
}

function formatWorkerIdFallback(userId?: string | null) {
  if (!userId) return "-";
  return "待确认施工人员";
}
