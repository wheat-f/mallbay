"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../src/stores/auth-store";
import { permissionsApi } from "../../src/features/permissions/api";
import { hasEffectivePermission } from "../../src/features/permissions/use-effective-permissions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const permissionsQuery = useQuery({
    queryKey: ["auth-permissions", "headquarters"],
    queryFn: () => permissionsApi.me(),
    enabled: hasHydrated && Boolean(user)
  });
  const isHeadquartersAdmin = hasEffectivePermission(permissionsQuery.data?.permissions, "permissions.policy", "read");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) { router.replace("/auth"); return; }
    if (permissionsQuery.isError || (permissionsQuery.isFetched && !isHeadquartersAdmin)) { router.replace("/"); }
  }, [hasHydrated, user, router, permissionsQuery.isError, permissionsQuery.isFetched, isHeadquartersAdmin]);

  if (!hasHydrated || !user || permissionsQuery.isLoading || (!permissionsQuery.isFetched && !permissionsQuery.isError)) {
    return <div className="flex h-screen items-center justify-center"><Spin /></div>;
  }

  if (!isHeadquartersAdmin) return null;

  return <>{children}</>;
}
