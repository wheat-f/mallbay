import { request } from "../../lib/request";

export type PermissionResult = {
  userId: string;
  policyVersion: number;
  bindingVersion: number;
  roles: Array<{ roleCode: string; roleName: string; scopeType: "HQ" | "STORE"; scopeIds: string[] }>;
  permissions: Array<{ code: string; actions: string[]; scopes: string[]; bindingScopes?: Array<{ scopeType: "HQ" | "STORE"; scopeIds: string[] }> }>;
  generatedAt: string;
};

export type PermissionDefinition = {
  code: string;
  name: string;
  resource: string;
  actions: string[];
  supportedScopes: string[];
  status: string;
};

export type PermissionRole = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  type: "SYSTEM" | "CUSTOM";
  status: "ACTIVE" | "DISABLED";
};

export type PermissionPolicy = {
  id: string;
  version: number;
  status: string;
  payload: { grants?: Array<{ roleCode: string; permissionCode: string; action: string; scope: string }> };
};

export type PermissionBinding = { id: string; userId: string; roleId: string; scopeType: "HQ" | "STORE"; storeId: string | null; status: "ACTIVE" | "DISABLED"; effectiveAt: string; expiredAt: string | null; role?: { id: string; code: string; name: string } | null; user?: { id: string; username: string; nickname: string | null } | null; };

export const permissionsApi = {
  me: (storeId?: string) =>
    request<PermissionResult>("/auth/me/permissions" + (storeId ? "?storeId=" + encodeURIComponent(storeId) : "")),
  catalog: () => request<PermissionDefinition[]>("/permissions/catalog"),
  roles: () => request<PermissionRole[]>("/permissions/roles"),
  currentPolicy: () => request<PermissionPolicy | null>("/permissions/policy"),
  createDraft: (payload: PermissionPolicy["payload"], expectedVersion?: number) =>
    request<PermissionPolicy>("/permissions/policy/drafts", { method: "POST", body: JSON.stringify({ payload, expectedVersion }) }),
  validate: (id: string) => request<PermissionPolicy>("/permissions/policy/" + id + "/validate", { method: "POST" }),
  publish: (id: string, expectedVersion?: number) =>
    request<PermissionPolicy>("/permissions/policy/" + id + "/publish", { method: "POST", body: JSON.stringify({ expectedVersion }) }),
  impact: (id: string) => request("/permissions/policy/" + id + "/impact"),
  rollback: (id: string) => request<PermissionPolicy>("/permissions/policy/" + id + "/rollback", { method: "POST" }),
  listBindings: (userId?: string) =>
    request<PermissionBinding[]>("/permissions/role-bindings" + (userId ? "?userId=" + encodeURIComponent(userId) : "")),
  bindRole: (input: { userId: string; roleId: string; scopeType: "HQ" | "STORE"; storeId?: string }) =>
    request<PermissionBinding>("/permissions/role-bindings", { method: "POST", body: JSON.stringify(input) }),
  disableBinding: (id: string) =>
    request<PermissionBinding>("/permissions/role-bindings/" + id + "/disable", { method: "POST" })
};
