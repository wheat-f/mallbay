import type { CreateCustomerPayload, CreateCustomerUserPayload, CreateVehiclePayload } from "./api";

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
  carPlate?: string;
  vin?: string;
  carModel?: string;
  carColor?: string;
  photoUrl?: string;
  companyUsers?: Array<{
    name?: string;
    phone?: string;
    note?: string;
  }>;
  vehicles?: Array<{
    carPlate?: string;
    vin?: string;
    carModel?: string;
    carColor?: string;
    photoUrl?: string;
  }>;
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
    referrerId: trimOptional(values.referrerId),
    companyUsers: values.customerType === "COMPANY" ? toCompanyUsers(values.companyUsers) : undefined
  });
}

export function toCreateVehiclePayload(
  customerId: string,
  values: CreateCustomerFormValues
): CreateVehiclePayload | undefined {
  const carModel = trimOptional(values.carModel);
  if (!carModel) return undefined;

  return compactVehiclePayload({
    customerId,
    carModel,
    carPlate: trimOptional(values.carPlate),
    vin: trimOptional(values.vin),
    carColor: trimOptional(values.carColor),
    photoUrl: trimOptional(values.photoUrl)
  });
}

export function toCreateVehiclePayloads(
  customerId: string,
  values: CreateCustomerFormValues
): CreateVehiclePayload[] {
  const vehicleDrafts = values.vehicles?.length
    ? values.vehicles
    : [
        {
          carModel: values.carModel,
          carPlate: values.carPlate,
          vin: values.vin,
          carColor: values.carColor,
          photoUrl: values.photoUrl
        }
      ];

  return vehicleDrafts
    .map((vehicle) => toCreateVehiclePayload(customerId, { ...values, ...vehicle, vehicles: undefined }))
    .filter((vehicle): vehicle is CreateVehiclePayload => Boolean(vehicle));
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

function toCompanyUsers(users: CreateCustomerFormValues["companyUsers"]) {
  const normalized = (users ?? [])
    .map((user) =>
      compactCustomerUserPayload({
        name: trimOptional(user.name) ?? "",
        phone: trimOptional(user.phone),
        note: trimOptional(user.note)
      })
    )
    .filter((user): user is { name: string; phone?: string; note?: string } => Boolean(user.name));
  return normalized.length > 0 ? normalized : undefined;
}

function compactCustomerUserPayload(payload: CreateCustomerUserPayload): CreateCustomerUserPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as CreateCustomerUserPayload;
}

function compactPayload(payload: CreateCustomerPayload): CreateCustomerPayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as CreateCustomerPayload;
}

function compactVehiclePayload(payload: CreateVehiclePayload): CreateVehiclePayload {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as CreateVehiclePayload;
}
