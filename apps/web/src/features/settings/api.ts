import { request } from "../../lib/request";

export type MigrationReview = { id: string; runId: string; sourceType: string; sourceId: string; reason: string; payload: Record<string, unknown>; status: "PENDING" | "RESOLVED" | "IGNORED"; resolvedById?: string | null; resolvedAt?: string | null; createdAt: string };
export type SettingsAuditRow = { id: string; action: string; actorId: string | null; storeId: string | null; targetType: string; targetId: string | null; createdAt: string; metadata: Record<string, unknown> };
export type ConfigVersionPage = { rows: ConfigVersion[]; total: number; page: number; pageSize: number };
export type ConfigVersion = { id: string; domain: "HQ" | "STORE" | "FINANCE" | "OWN"; capabilityCode: string; scopeId: string; version: number; status: string; effectiveAt?: string | null; expiresAt?: string | null; payload: Record<string, unknown>; updatedAt?: string | null; updatedById?: string | null };
export type CreateConfigVersionPayload = { domain: "HQ" | "STORE" | "FINANCE" | "OWN"; capabilityCode: string; scopeId: string; payload: Record<string, unknown>; effectiveAt?: string; expiresAt?: string; requestId?: string };
export const settingsApi = {
  capabilities: () => request<import("./workbench-model").CapabilityView[]>("/settings/capabilities"),
  summary: () => request<{ cards: Array<import("./workbench-model").CapabilityView & { status: string; pendingCount: number; validationFailedCount: number; version: number | null; updatedAt: string | null; updatedById: string | null }>; pendingCount: number; validationFailedCount: number }>("/settings/summary"),
  audit: (params = "") => request<{ rows: SettingsAuditRow[]; total: number }>(`/settings/audit${params ? `?${params}` : ""}`),
  exportAudit: (params = "") => request<{ rows: SettingsAuditRow[] }>(`/settings/audit/export${params ? `?${params}` : ""}`),
  configVersions: (capabilityCode: string, scopeId?: string, page = 1, pageSize = 20) => request<ConfigVersionPage>(`/settings/config-versions?capabilityCode=${encodeURIComponent(capabilityCode)}${scopeId ? `&scopeId=${encodeURIComponent(scopeId)}` : ""}&page=${page}&pageSize=${pageSize}`),
  createConfigVersion: (payload: CreateConfigVersionPayload) => request<ConfigVersion>("/settings/config-versions", { method: "POST", body: JSON.stringify({ ...payload, requestId: payload.requestId ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) }) }),
  updateConfigVersion: (id: string, payload: { payload: Record<string, unknown>; expectedVersion?: number; effectiveAt?: string }) => request<ConfigVersion>(`/settings/config-versions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  validateConfigVersion: (id: string) => request<ConfigVersion & { errors: Record<string, string> }>(`/settings/config-versions/${id}/validate`, { method: "POST" }),
  publishConfigVersion: (id: string) => request<ConfigVersion>(`/settings/config-versions/${id}/publish`, { method: "POST" }),
  testOssConnection: (scopeId: string, payload: { endpoint: string; accessKey?: string; secretKey?: string }) => request<{ success: boolean; status: number; message: string }>("/settings/oss/test-connection", { method: "POST", body: JSON.stringify({ ...payload, scopeId }) }),
  withdrawConfigVersion: (id: string, reason: string) => request<ConfigVersion>(`/settings/config-versions/${id}/withdraw`, { method: "POST", body: JSON.stringify({ reason }) }),
  migrationReviews: (status = "PENDING") => request<MigrationReview[]>(`/settings/migration-reviews?status=${encodeURIComponent(status)}`),
  resolveMigrationReview: (id: string, status: "RESOLVED" | "IGNORED", reason: string) => request<MigrationReview>(`/settings/migration-reviews/${id}`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
};

export type DictionaryStatus = "ACTIVE" | "INACTIVE";
export type DictionarySource = "SYSTEM" | "HQ_TEMPLATE" | "STORE";
export type DictionaryItemEntry = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  status: DictionaryStatus;
  parentId?: string | null;
  source?: DictionarySource;
  disabledReason?: string | null;
  usageCount?: number;
  referencedCount?: number;
  deletePolicy?: "DISABLE_ONLY" | "DELETE_OR_DISABLE";
  label?: string;
  isEnabled?: boolean;
};
export type DictionaryItem = {
  id: string;
  storeId: string | null;
  name: string;
  code: string;
  items: string[];
  source?: DictionarySource;
  version?: number;
  allowCustomItems?: boolean;
  allowDisableItems?: boolean;
  allowHierarchy?: boolean;
  dictionaryItems?: DictionaryItemEntry[];
  status: DictionaryStatus;
  createdAt: string;
  updatedAt: string;
  inherited?: boolean;
  readOnly?: boolean;
};
export type DictionaryPayload = {
  storeId: string;
  name: string;
  code: string;
  items: string[];
  status?: DictionaryStatus;
  source?: DictionarySource;
  allowCustomItems?: boolean;
  allowDisableItems?: boolean;
  allowHierarchy?: boolean;
};

export const dictionaryApi = {
  list: (storeId?: string) => request<DictionaryItem[]>(storeId ? `/settings/dictionaries?storeId=${encodeURIComponent(storeId)}` : "/settings/dictionaries"),
  create: (payload: DictionaryPayload) => request<DictionaryItem>("/settings/dictionaries", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<Omit<DictionaryPayload, "storeId" | "code">>) => request<DictionaryItem>(`/settings/dictionaries/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  disable: (id: string, reason: string) => request<DictionaryItem>(`/settings/dictionaries/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  listItems: (id: string) => request<DictionaryItemEntry[]>(`/settings/dictionaries/${id}/items`),
  createItem: (id: string, payload: { code: string; name: string; parentId?: string | null; sortOrder?: number }) => request<DictionaryItemEntry>(`/settings/dictionaries/${id}/items`, { method: "POST", body: JSON.stringify(payload) }),
  updateItem: (itemId: string, payload: Record<string, unknown>) => request<DictionaryItemEntry>(`/settings/dictionaries/items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  setItemStatus: (itemId: string, status: DictionaryStatus, reason?: string, version?: number) => request<DictionaryItemEntry>(`/settings/dictionaries/items/${itemId}/status`, { method: "PATCH", body: JSON.stringify({ status, reason, version }) }),
  removeItem: (itemId: string, reason: string) => request<DictionaryItemEntry>(`/settings/dictionaries/items/${itemId}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  importItems: (dictionaryId: string, items: Array<{ code: string; name: string; sortOrder?: number }>) => request<DictionaryItemEntry[]>(`/settings/dictionaries/${dictionaryId}/items/import`, { method: "POST", body: JSON.stringify({ items }) })
};
export const dictionaryTemplateApi = {
  list: () => request<DictionaryItem[]>("/settings/dictionary-templates"),
  updateItem: (itemId: string, payload: Record<string, unknown>) => request<DictionaryItemEntry>(`/settings/dictionary-templates/items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  createItem: (templateId: string, payload: { code: string; name: string; parentId?: string | null; sortOrder?: number }) => request<DictionaryItemEntry>(`/settings/dictionary-templates/${templateId}/items`, { method: "POST", body: JSON.stringify(payload) }),
  setItemStatus: (itemId: string, status: DictionaryStatus, reason?: string, version?: number) => request<DictionaryItemEntry>(`/settings/dictionary-templates/items/${itemId}/status`, { method: "PATCH", body: JSON.stringify({ status, reason, version }) })
};