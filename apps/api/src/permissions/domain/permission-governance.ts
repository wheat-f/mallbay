import type { PermissionScopeType, Prisma } from "@prisma/client";

export const PERMISSION_GOVERNANCE = Symbol("PERMISSION_GOVERNANCE");

export type PermissionGovernance = {
  currentPolicy(): Promise<unknown>;
  createDraft(input: { payload: Prisma.InputJsonValue; actorId: string; expectedVersion?: number }): Promise<unknown>;
  validatePolicy(id: string, actorId: string): Promise<unknown>;
  policyImpact(id: string): Promise<unknown>;
  publishPolicy(id: string, actorId: string, expectedVersion?: number): Promise<unknown>;
  rollbackPolicy(targetId: string, actorId: string): Promise<unknown>;
  listRoles(): Promise<unknown>;
  createRole(input: {
    code: string;
    name: string;
    description?: string;
    grants?: Array<{ permissionCode: string; action: string; scope: string }>;
    createdById: string;
  }): Promise<unknown>;
  listBindings(userId?: string): Promise<unknown>;
  assertRoleBindingWriteAllowed(actorId: string, targetUserId: string, scopeType: PermissionScopeType): Promise<void>;
  assertExistingRoleBindingWriteAllowed(actorId: string, bindingId: string): Promise<void>;
  bindRole(input: {
    userId: string;
    roleId: string;
    scopeType: PermissionScopeType;
    storeId?: string;
    createdById: string;
  }): Promise<unknown>;
  disableBinding(bindingId: string, actorId: string): Promise<unknown>;
  disableRole(roleId: string, actorId: string): Promise<unknown>;
  listCatalog(): Promise<unknown>;
};
