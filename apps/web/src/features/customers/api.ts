import type { CustomerNoteType, CustomerSourceType, CustomerType, Gender } from "@mallbay/shared";
import { request, requestMultipart } from "../../lib/request";

export type CreateCustomerPayload = {
  storeId: string;
  customerType: CustomerType;
  name?: string;
  gender?: Gender;
  birthday?: string;
  companyName?: string;
  contactPerson?: string;
  phone: string;
  wechat?: string;
  sourceType?: CustomerSourceType;
  sourceDetail?: string;
  referrerId?: string;
  companyUsers?: CreateCustomerUserPayload[];
};

export type CreatedCustomer = CreateCustomerPayload & {
  id: string;
};

export type CreateVehiclePayload = {
  customerId: string;
  carPlate?: string;
  vin?: string;
  carModel: string;
  vehicleTypeCode: "SMALL_CAR" | "STANDARD_CAR" | "LUXURY_LARGE_CAR";
  carColor?: string;
  photoUrl?: string;
};

export type CreatedVehicle = CreateVehiclePayload & {
  id: string;
};

export type UpdateVehiclePayload = Partial<Omit<CreateVehiclePayload, "customerId">>;

export type CreateCustomerUserPayload = {
  customerId?: string;
  name: string;
  phone?: string;
  note?: string;
};

export type CreateCustomerNotePayload = {
  customerId: string;
  noteType?: CustomerNoteType;
  content: string;
};

export type CreateCustomerTagPayload = {
  customerId: string;
  label: string;
};

export type CustomerListQuery = {
  storeId: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export const customerApi = {
  create: (payload: CreateCustomerPayload) =>
    request<CreatedCustomer>("/customers", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  list: (query: CustomerListQuery) =>
    request<{ items: unknown[]; total: number; page: number; pageSize: number }>(
      `/customers${toQueryString(query)}`
    ),

  detail: (id: string) => request<unknown>(`/customers/${id}`),

  update: (id: string, payload: Partial<CreateCustomerPayload>) =>
    request<unknown>(`/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  createVehicle: (payload: CreateVehiclePayload) =>
    request<CreatedVehicle>("/customers/vehicles", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateVehicle: (id: string, payload: UpdateVehiclePayload) =>
    request<CreatedVehicle>(`/customers/vehicles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  uploadVehiclePhoto: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return requestMultipart<{ url: string }>("/customers/vehicles/photos/upload", formData);
  },

  createCustomerUser: (payload: CreateCustomerUserPayload & { customerId: string }) =>
    request<unknown>("/customers/users", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createNote: (payload: CreateCustomerNotePayload) =>
    request<unknown>("/customers/notes", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createTag: (payload: CreateCustomerTagPayload) =>
    request<unknown>("/customers/tags", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  deleteTag: (id: string) =>
    request<{ id: string }>(`/customers/tags/${id}`, {
      method: "DELETE"
    }),

  search: (storeId: string, q: string) =>
    request<unknown[]>(`/customers/search${toQueryString({ storeId, q })}`)
};

function toQueryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
