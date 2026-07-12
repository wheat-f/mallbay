import type { CapacityPayload } from "./api";
import dayjs from "dayjs";

export type CapacityDatePickerValue = {
  format: (pattern: string) => string;
};

export type CapacityFormValues = {
  date?: string | CapacityDatePickerValue | null;
  inStoreCapacity?: number;
  outsideCapacity?: number;
  heatFilmCapacity?: number;
  inspectionCapacity?: number;
};

export function formatCapacityDateValue(value?: string | CapacityDatePickerValue | null) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.format("YYYY-MM-DD");
}

export function toCapacityDatePickerValue(value?: string | CapacityDatePickerValue | null) {
  if (!value) return undefined;
  if (typeof value === "string") return dayjs(value);
  return value;
}

export function buildCapacityPayload(storeId: string, values: CapacityFormValues): CapacityPayload {
  return {
    storeId,
    date: formatCapacityDateValue(values.date) ?? "",
    inStoreCapacity: values.inStoreCapacity ?? 0,
    outsideCapacity: values.outsideCapacity ?? 0,
    heatFilmCapacity: values.heatFilmCapacity ?? 0,
    inspectionCapacity: values.inspectionCapacity ?? 0
  };
}
