"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthUser } from "@mallbay/shared";
import { useAuthStore } from "../../stores/auth-store";

const SELECTED_STORE_KEY = "mallbay.selected-store-id";

export function getUserStoreMembers(user: AuthUser | null | undefined) {
  if (user?.storeMembers?.length) return user.storeMembers;
  if (user?.storeMember) return [user.storeMember];
  return [];
}
export function resolveStoreId(user: AuthUser | null | undefined, routeStoreId?: string, persistedStoreId?: string) {
  const members = getUserStoreMembers(user);
  const memberIds = new Set(members.map((member) => member.store.id));
  if (routeStoreId && memberIds.has(routeStoreId)) return routeStoreId;
  if (persistedStoreId && memberIds.has(persistedStoreId)) return persistedStoreId;
  return members[0]?.store.id;
}

export function useCurrentStoreContext(routeStoreId?: string) {
  const user = useAuthStore((state) => state.user);
  const [persistedStoreId, setPersistedStoreId] = useState<string>();

  useEffect(() => {
    setPersistedStoreId(window.localStorage.getItem(SELECTED_STORE_KEY) ?? undefined);
  }, []);

  const storeId = resolveStoreId(user, routeStoreId, persistedStoreId);
  const store = useMemo(
    () => getUserStoreMembers(user).find((member) => member.store.id === storeId)?.store,
    [storeId, user]
  );

  const selectStore = (nextStoreId: string) => {
    if (!getUserStoreMembers(user).some((member) => member.store.id === nextStoreId)) return false;
    window.localStorage.setItem(SELECTED_STORE_KEY, nextStoreId);
    setPersistedStoreId(nextStoreId);
    return true;
  };

  return { storeId, store, stores: getUserStoreMembers(user).map((member) => member.store), selectStore };
}
