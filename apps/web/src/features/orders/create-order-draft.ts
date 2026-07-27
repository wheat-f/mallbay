import type { CreateOrderFormValues } from "./create-order-form";
import { formatOrderDateValue, formatOrderTimeSlotValue } from "./create-order-form";
import type { PricingCalculationResponse } from "../pricing/api";

export const CREATE_ORDER_DRAFT_STORAGE_KEY = "mallbay-create-order-draft:v1";
const LEGACY_CREATE_ORDER_DRAFT_STORAGE_KEY = "mallbay-create-order-draft";

export type CreateOrderDraft = {
  version: 1;
  storeId: string;
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

export function saveCreateOrderDraft(
  storage: StorageLike,
  draft: Omit<CreateOrderDraft, "version" | "values"> & { values: CreateOrderFormValues }
) {
  const normalizedDraft: CreateOrderDraft = {
    ...draft,
    version: 1,
    values: normalizeDraftValues(draft.values)
  };
  storage.setItem(CREATE_ORDER_DRAFT_STORAGE_KEY, JSON.stringify(normalizedDraft));
  storage.removeItem(LEGACY_CREATE_ORDER_DRAFT_STORAGE_KEY);
  return normalizedDraft;
}

export function loadCreateOrderDraft(storage: StorageLike, storeId: string): CreateOrderDraft | null {
  const current = parseDraft(storage.getItem(CREATE_ORDER_DRAFT_STORAGE_KEY), storeId);
  if (current) return current;

  const legacy = parseLegacyDraft(storage.getItem(LEGACY_CREATE_ORDER_DRAFT_STORAGE_KEY), storeId);
  if (!legacy) return null;

  storage.setItem(CREATE_ORDER_DRAFT_STORAGE_KEY, JSON.stringify(legacy));
  storage.removeItem(LEGACY_CREATE_ORDER_DRAFT_STORAGE_KEY);
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

function parseDraft(raw: string | null, storeId: string): CreateOrderDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CreateOrderDraft>;
    if (
      value.version !== 1 ||
      value.storeId !== storeId ||
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

function parseLegacyDraft(raw: string | null, storeId: string): CreateOrderDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { savedAt?: unknown; values?: CreateOrderFormValues };
    if (typeof value.savedAt !== "string" || !value.values) return null;
    return {
      version: 1,
      storeId,
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
