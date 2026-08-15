import type { CreateOrderFormValues } from "./create-order-form";
import { formatOrderDateValue, formatOrderTimeSlotValue } from "./create-order-form";
import type { PricingCalculationResponse } from "../pricing/api";

export const CREATE_ORDER_DRAFT_STORAGE_KEY = "mallbay-create-order-draft:v2";
const PREVIOUS_CREATE_ORDER_DRAFT_STORAGE_KEY = "mallbay-create-order-draft:v1";
const LEGACY_CREATE_ORDER_DRAFT_STORAGE_KEY = "mallbay-create-order-draft";
const CREATE_ORDER_LEASE_STORAGE_PREFIX = "mallbay-create-order-lease:v1:";

export type CreateOrderDraft = {
  version: 2;
  storeId: string;
  actorId?: string;
  draftId: string;
  commandId: string;
  draftRevision: number;
  submissionState: "EDITING" | "SUBMITTING" | "RESULT_UNKNOWN" | "REJECTED";
  savedAt: string;
  values: CreateOrderFormValues;
  pricingSnapshot?: PricingCalculationResponse;
  copySource?: {
    orderId: string;
    orderNo: string;
    copiedFields: string[];
    excludedFields: string[];
  };
  summary: {
    customerName: string;
    productCount: number;
    totalAmountYuan: number;
  };
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type CreateOrderDraftLease = { draftId: string; ownerId: string; expiresAt: number };

export function createCreateOrderDraftId() {
  return createId("draft");
}

export function createCreateOrderLeaseOwnerId() {
  return createId("tab");
}

export function createCreateOrderLeaseKey(storeId: string, draftId: string, actorId = "anonymous") {
  return `${CREATE_ORDER_LEASE_STORAGE_PREFIX}${actorId}:${storeId}:${draftId}`;
}

export function acquireCreateOrderDraftLease(storage: StorageLike, storeId: string, draftId: string, ownerId: string, now = Date.now(), ttlMs = 15_000, actorId = "anonymous") {
  const key = createCreateOrderLeaseKey(storeId, draftId, actorId);
  const current = parseLease(storage.getItem(key));
  if (current && current.expiresAt > now && current.ownerId !== ownerId) return false;
  storage.setItem(key, JSON.stringify({ draftId, ownerId, expiresAt: now + ttlMs } satisfies CreateOrderDraftLease));
  return true;
}

export function renewCreateOrderDraftLease(storage: StorageLike, storeId: string, draftId: string, ownerId: string, now = Date.now(), ttlMs = 15_000, actorId = "anonymous") {
  const key = createCreateOrderLeaseKey(storeId, draftId, actorId);
  const current = parseLease(storage.getItem(key));
  if (!current || current.ownerId !== ownerId || current.expiresAt <= now) return false;
  storage.setItem(key, JSON.stringify({ ...current, expiresAt: now + ttlMs }));
  return true;
}

export function releaseCreateOrderDraftLease(storage: StorageLike, storeId: string, draftId: string, ownerId: string, actorId = "anonymous") {
  const key = createCreateOrderLeaseKey(storeId, draftId, actorId);
  const current = parseLease(storage.getItem(key));
  if (current?.ownerId === ownerId) storage.removeItem(key);
}

export function saveCreateOrderDraft(
  storage: StorageLike,
  draft: Omit<CreateOrderDraft, "version" | "values" | "draftId" | "commandId" | "draftRevision" | "submissionState"> & {
    values: CreateOrderFormValues;
    draftId?: string;
    commandId?: string;
    draftRevision?: number;
    submissionState?: CreateOrderDraft["submissionState"];
  }
) {
  const normalizedDraft: CreateOrderDraft = {
    ...draft,
    version: 2,
    draftId: draft.draftId || createId("draft"),
    commandId: draft.commandId || createId("order"),
    draftRevision: Math.max(1, draft.draftRevision || 1),
    submissionState: draft.submissionState || "EDITING",
    values: normalizeDraftValues(draft.values)
  };
  storage.setItem(CREATE_ORDER_DRAFT_STORAGE_KEY, JSON.stringify(normalizedDraft));
  storage.removeItem(LEGACY_CREATE_ORDER_DRAFT_STORAGE_KEY);
  storage.removeItem(PREVIOUS_CREATE_ORDER_DRAFT_STORAGE_KEY);
  return normalizedDraft;
}

export function loadCreateOrderDraft(storage: StorageLike, storeId: string, actorId?: string): CreateOrderDraft | null {
  const current = parseDraft(storage.getItem(CREATE_ORDER_DRAFT_STORAGE_KEY), storeId, actorId);
  if (current) return current;

  const previous = parsePreviousDraft(storage.getItem(PREVIOUS_CREATE_ORDER_DRAFT_STORAGE_KEY), storeId, actorId);
  if (previous) {
    storage.setItem(CREATE_ORDER_DRAFT_STORAGE_KEY, JSON.stringify(previous));
    storage.removeItem(PREVIOUS_CREATE_ORDER_DRAFT_STORAGE_KEY);
    return previous;
  }

  const legacy = parseLegacyDraft(storage.getItem(LEGACY_CREATE_ORDER_DRAFT_STORAGE_KEY), storeId, actorId);
  if (!legacy) return null;

  storage.setItem(CREATE_ORDER_DRAFT_STORAGE_KEY, JSON.stringify(legacy));
  storage.removeItem(LEGACY_CREATE_ORDER_DRAFT_STORAGE_KEY);
  storage.removeItem(PREVIOUS_CREATE_ORDER_DRAFT_STORAGE_KEY);
  return legacy;
}

export function removeCreateOrderDraft(storage: StorageLike) {
  storage.removeItem(CREATE_ORDER_DRAFT_STORAGE_KEY);
  storage.removeItem(LEGACY_CREATE_ORDER_DRAFT_STORAGE_KEY);
}

function normalizeDraftValues(values: CreateOrderFormValues): CreateOrderFormValues {
  const appointmentDate = formatOrderDateValue(values.appointmentDate);
  const appointmentTimeSlot = formatOrderTimeSlotValue(values.appointmentTimeSlot);
  const paidAt = formatOrderDateValue(values.deposit?.paidAt);

  return {
    ...values,
    ...(appointmentDate ? { appointmentDate } : { appointmentDate: undefined }),
    ...(appointmentTimeSlot ? { appointmentTimeSlot } : { appointmentTimeSlot: undefined }),
    ...(values.deposit
      ? {
          deposit: {
            ...values.deposit,
            ...(paidAt ? { paidAt } : { paidAt: undefined })
          }
        }
      : {})
  };
}

function parseDraft(raw: string | null, storeId: string, actorId?: string): CreateOrderDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CreateOrderDraft>;
    if (
      value.version !== 2 ||
      value.storeId !== storeId ||
      (actorId !== undefined && value.actorId !== undefined && value.actorId !== actorId) ||
      typeof value.savedAt !== "string" ||
      !value.values ||
      !value.summary
    ) {
      return null;
    }
    return value as CreateOrderDraft;
  } catch {
    return null;
  }
}

function parsePreviousDraft(raw: string | null, storeId: string, actorId?: string): CreateOrderDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { version?: number; storeId?: string; savedAt?: string; values?: CreateOrderFormValues; pricingSnapshot?: PricingCalculationResponse; copySource?: CreateOrderDraft["copySource"]; summary?: CreateOrderDraft["summary"] };
    if (value.version !== 1 || value.storeId !== storeId || !value.savedAt || !value.values || !value.summary) return null;
    return {
      version: 2,
      storeId,
      actorId,
      draftId: createId("draft"),
      commandId: createId("order"),
      draftRevision: 1,
      submissionState: "EDITING",
      savedAt: value.savedAt,
      values: normalizeDraftValues(value.values),
      pricingSnapshot: value.pricingSnapshot,
      copySource: value.copySource,
      summary: value.summary
    };
  } catch {
    return null;
  }
}

function parseLegacyDraft(raw: string | null, storeId: string, actorId?: string): CreateOrderDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { savedAt?: unknown; values?: CreateOrderFormValues };
    if (typeof value.savedAt !== "string" || !value.values) return null;
    return {
      version: 2,
      storeId,
      actorId,
      draftId: createId("draft"),
      commandId: createId("order"),
      draftRevision: 1,
      submissionState: "EDITING",
      savedAt: value.savedAt,
      values: normalizeDraftValues(value.values),
      summary: {
        customerName: "客户待选择",
        productCount: value.values.items?.filter((item) => item?.productId).length ?? 0,
        totalAmountYuan: 0
      }
    };
  } catch {
    return null;
  }
}

function createId(prefix: string) {
  const id = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${id}`;
}

function parseLease(raw: string | null): CreateOrderDraftLease | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CreateOrderDraftLease>;
    if (typeof value.draftId !== "string" || typeof value.ownerId !== "string" || typeof value.expiresAt !== "number") return null;
    return value as CreateOrderDraftLease;
  } catch {
    return null;
  }
}
