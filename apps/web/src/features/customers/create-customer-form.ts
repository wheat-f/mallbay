import type { CreateCustomerPayload } from "./api";

type DatePickerValue = {
  format: (pattern: string) => string;
};

export type CreateCustomerFormValues = {
  customerType: "PERSONAL" | "COMPANY";
  name?: string;
  gender?: CreateCustomerPayload["gender"];
  birthday?: string | DatePickerValue;
  companyName?: string;
  contactPerson?: string;
  phone: string;
  wechat?: string;
  sourceType?: CreateCustomerPayload["sourceType"];
  sourceDetail?: string;
  referrerId?: string;
};

export function toCreateCustomerPayload(
  storeId: string,
  values: CreateCustomerFormValues
): CreateCustomerPayload {
  return compactPayload({
    storeId,
    customerType: values.customerType,
    name: trimOptional(values.name),
    gender: values.gender,
    birthday: formatOptionalDate(values.birthday),
    companyName: trimOptional(values.companyName),
    contactPerson: trimOptional(values.contactPerson),
    phone: values.phone.trim(),
    wechat: trimOptional(values.wechat),
    sourceType: values.sourceType,
    sourceDetail: trimOptional(values.sourceDetail),
    referrerId: trimOptional(values.referrerId)
  });
}

function trimOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function formatOptionalDate(value: string | DatePickerValue | undefined) {
  if (!value) return undefined;
  if (typeof value === "string") return trimOptional(value);
  return value.format("YYYY-MM-DD");
}

function compactPayload(payload: CreateCustomerPayload): CreateCustomerPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as CreateCustomerPayload;
}
