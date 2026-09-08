"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../stores/auth-store";
import { permissionsApi, type PermissionResult } from "./api";

export type EffectivePermissions = PermissionResult["permissions"];

/**
 * Client-side affordances must use the same evaluated grants as the API. This
 * helper intentionally does not infer authority from a user's job title: the
 * server remains the final authorization point, while the UI fails closed
 * until the evaluated snapshot has arrived.
 */
export function hasEffectivePermission(
  permissions: EffectivePermissions | undefined,
  code: string,
  action: string,
  storeId?: string,
  options: { ownerId?: string; userId?: string; requireStoreScope?: boolean } = {}
) {
  return Boolean(permissions?.some((permission) => {
    if (permission.code !== code || !permission.actions.includes(action)) return false;
    const bindings = permission.bindingScopes ?? [];
    if (permission.scopes.includes("GLOBAL") && bindings.some((binding) => binding.scopeType === "HQ")) return true;
    const hasMatchingStoreBinding = bindings.some((binding) =>
      binding.scopeType === "STORE" && (storeId ? binding.scopeIds.includes(storeId) : binding.scopeIds.length > 0)
    );
    if (!hasMatchingStoreBinding) return false;
    if (permission.scopes.includes("STORE")) return true;
    if (options.requireStoreScope || !permission.scopes.includes("OWN")) return false;
    return !options.ownerId || !options.userId || options.ownerId === options.userId;
  }));
}

export function useEffectivePermissions(storeId?: string) {
  const userId = useAuthStore((state) => state.user?.id);
  return useQuery({
    queryKey: ["auth-permissions", storeId ?? "headquarters"],
    queryFn: () => permissionsApi.me(storeId),
    enabled: Boolean(userId),
    staleTime: 15_000
  });
}
