import type { PermissionResult } from "../permissions/api";
import { hasEffectivePermission } from "../permissions/use-effective-permissions";

const guardedRoutes: Record<string, { code: string; action: string }> = {
  "/customers": { code: "customers", action: "read" },
  "/construction/tasks": { code: "construction", action: "read" },
  "/inventory": { code: "inventory", action: "read" },
  "/purchases": { code: "purchase", action: "read" },
  "/returns": { code: "returns", action: "write" },
  "/finance": { code: "finance", action: "read" },
  "/commissions": { code: "commissions", action: "write" },
  "/after-sales": { code: "after-sales", action: "read" }
};

export function isGuardedBusinessRoute(pathname: string) {
  return Object.hasOwn(guardedRoutes, pathname);
}

export function canOpenGuardedBusinessRoute(
  pathname: string,
  permissions: PermissionResult["permissions"] | undefined,
  storeId?: string
) {
  const requirement = guardedRoutes[pathname];
  return !requirement || hasEffectivePermission(permissions, requirement.code, requirement.action, storeId);
}
