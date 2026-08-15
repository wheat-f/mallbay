import { request } from "../../lib/request";

export type MigrationReview = { id: string; runId: string; sourceType: string; sourceId: string; reason: string; payload: Record<string, unknown>; status: "PENDING" | "RESOLVED" | "IGNORED"; resolvedById?: string | null; resolvedAt?: string | null; createdAt: string };
export type SettingsAuditRow = { id: string; action: string; actionLabel: string; actorId: string | null; actorName: string; storeId: string | null; storeName: string | null; targetType: string; targetTypeLabel: string; targetId: string | null; targetName: string; createdAt: string; metadata: Record<string, unknown> };
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
export type DictionaryCatalogEntry = Omit<DictionaryItem, "items" | "dictionaryItems"> & {
  activeItemCount: number;
  inactiveItemCount: number;
};
export type DictionaryCatalogPage = { items: DictionaryCatalogEntry[]; total: number; page: number; pageSize: number };
export type DictionaryGovernanceKind = "dictionary" | "template";
export type DictionaryGovernanceEntry = DictionaryCatalogEntry & { kind: DictionaryGovernanceKind; readOnly: boolean; inherited: boolean };
export type DictionaryGovernanceCatalogPage = { items: DictionaryGovernanceEntry[]; total: number; page: number; pageSize: number };
export type DictionaryItemsPage = { items: DictionaryItemEntry[]; total: number; page: number; pageSize: number; dictionaryVersion: number; parent?: { id: string; code: string; name: string; parentId?: string | null } | null };
export type DictionaryImportPreview = { dictionaryId: string; dictionaryVersion: number; canCommit: boolean; summary: { total: number; create: number; update: number; error: number }; changes: Array<{ code: string; name: string; action: "CREATE" | "UPDATE" }>; errors: Array<{ code: string; message: string }> };
export type DictionaryGovernanceImportPreview = DictionaryImportPreview & { templateId?: string };
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

export const dictionaryGovernanceApi = {
  catalog: (params: { storeId?: string; keyword?: string; page?: number; pageSize?: number } = {}) => request<DictionaryGovernanceCatalogPage>(`/settings/dictionary-governance/catalog?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`),
  listItems: (kind: DictionaryGovernanceKind, id: string, params: { keyword?: string; status?: DictionaryStatus; parentId?: string; page?: number; pageSize?: number } = {}) => request<DictionaryItemsPage>(`/settings/dictionary-governance/${kind}/${id}/items?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`),
  createItem: (kind: DictionaryGovernanceKind, id: string, payload: { code: string; name: string; parentId?: string | null; sortOrder?: number }) => request<DictionaryItemEntry>(`/settings/dictionary-governance/${kind}/${id}/items`, { method: "POST", body: JSON.stringify(payload) }),
  updateItem: (kind: DictionaryGovernanceKind, itemId: string, payload: Record<string, unknown>) => request<DictionaryItemEntry>(`/settings/dictionary-governance/${kind}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  setItemStatus: (kind: DictionaryGovernanceKind, itemId: string, status: DictionaryStatus, reason?: string, version?: number) => request<DictionaryItemEntry>(`/settings/dictionary-governance/${kind}/items/${itemId}/status`, { method: "PATCH", body: JSON.stringify({ status, reason, version }) }),
  removeItem: (kind: DictionaryGovernanceKind, itemId: string, reason: string) => request<DictionaryItemEntry>(`/settings/dictionary-governance/${kind}/items/${itemId}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  previewImport: (kind: DictionaryGovernanceKind, id: string, items: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>) => request<DictionaryGovernanceImportPreview>(`/settings/dictionary-governance/${kind}/${id}/items/import/preview`, { method: "POST", body: JSON.stringify({ items }) }),
  commitImport: (kind: DictionaryGovernanceKind, id: string, items: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>, version: number) => request<{ created: DictionaryItemEntry[]; updated: DictionaryItemEntry[]; version: number }>(`/settings/dictionary-governance/${kind}/${id}/items/import/commit`, { method: "POST", body: JSON.stringify({ items, version }) })
};

export const dictionaryApi = {
  list: (storeId?: string) => request<DictionaryItem[]>(storeId ? `/settings/dictionaries?storeId=${encodeURIComponent(storeId)}` : "/settings/dictionaries"),
  catalog: (params: { storeId?: string; keyword?: string; page?: number; pageSize?: number } = {}) => request<DictionaryCatalogPage>(`/settings/dictionaries/catalog?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`),
  listItemsPage: (id: string, params: { keyword?: string; status?: DictionaryStatus; parentId?: string; page?: number; pageSize?: number } = {}) => request<DictionaryItemsPage>(`/settings/dictionaries/${id}/items?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`),
  create: (payload: DictionaryPayload) => request<DictionaryItem>("/settings/dictionaries", { method: "POST", body: JSON.stringify(payload) }),
  update: (id: string, payload: Partial<Omit<DictionaryPayload, "storeId" | "code">>) => request<DictionaryItem>(`/settings/dictionaries/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  disable: (id: string, reason: string) => request<DictionaryItem>(`/settings/dictionaries/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  listItems: (id: string) => request<DictionaryItemEntry[]>(`/settings/dictionaries/${id}/items`),
  createItem: (id: string, payload: { code: string; name: string; parentId?: string | null; sortOrder?: number }) => request<DictionaryItemEntry>(`/settings/dictionaries/${id}/items`, { method: "POST", body: JSON.stringify(payload) }),
  updateItem: (itemId: string, payload: Record<string, unknown>) => request<DictionaryItemEntry>(`/settings/dictionaries/items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  setItemStatus: (itemId: string, status: DictionaryStatus, reason?: string, version?: number) => request<DictionaryItemEntry>(`/settings/dictionaries/items/${itemId}/status`, { method: "PATCH", body: JSON.stringify({ status, reason, version }) }),
  removeItem: (itemId: string, reason: string) => request<DictionaryItemEntry>(`/settings/dictionaries/items/${itemId}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  importItems: (dictionaryId: string, items: Array<{ code: string; name: string; sortOrder?: number }>) => request<DictionaryItemEntry[]>(`/settings/dictionaries/${dictionaryId}/items/import`, { method: "POST", body: JSON.stringify({ items }) }),
  previewImport: (dictionaryId: string, items: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>) => request<DictionaryImportPreview>(`/settings/dictionaries/${dictionaryId}/items/import/preview`, { method: "POST", body: JSON.stringify({ items }) }),
  commitImport: (dictionaryId: string, items: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>, version: number) => request<{ created: DictionaryItemEntry[]; updated: DictionaryItemEntry[]; version: number }>(`/settings/dictionaries/${dictionaryId}/items/import/commit`, { method: "POST", body: JSON.stringify({ items, version }) })
};
export const dictionaryTemplateApi = {
  list: () => request<DictionaryItem[]>("/settings/dictionary-templates"),
  catalog: (params: { keyword?: string; page?: number; pageSize?: number } = {}) => request<DictionaryCatalogPage>(`/settings/dictionary-templates/catalog?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`),
  listItemsPage: (id: string, params: { keyword?: string; status?: DictionaryStatus; parentId?: string; page?: number; pageSize?: number } = {}) => request<DictionaryItemsPage>(`/settings/dictionary-templates/${id}/items?${new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}`),
  previewImport: (templateId: string, items: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>) => request<DictionaryImportPreview>(`/settings/dictionary-templates/${templateId}/items/import/preview`, { method: "POST", body: JSON.stringify({ items }) }),
  commitImport: (templateId: string, items: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>, version: number) => request<{ created: DictionaryItemEntry[]; updated: DictionaryItemEntry[]; version: number }>(`/settings/dictionary-templates/${templateId}/items/import/commit`, { method: "POST", body: JSON.stringify({ items, version }) }),
  updateItem: (itemId: string, payload: Record<string, unknown>) => request<DictionaryItemEntry>(`/settings/dictionary-templates/items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }),
  createItem: (templateId: string, payload: { code: string; name: string; parentId?: string | null; sortOrder?: number }) => request<DictionaryItemEntry>(`/settings/dictionary-templates/${templateId}/items`, { method: "POST", body: JSON.stringify(payload) }),
  setItemStatus: (itemId: string, status: DictionaryStatus, reason?: string, version?: number) => request<DictionaryItemEntry>(`/settings/dictionary-templates/items/${itemId}/status`, { method: "PATCH", body: JSON.stringify({ status, reason, version }) })
};
