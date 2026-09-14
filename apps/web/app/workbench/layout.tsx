"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuthStore } from "../../src/stores/auth-store";
import { getUserStoreMembers } from "../../src/features/workbench/store-context";

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const router = useRouter();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) { router.replace("/auth"); return; }
    if (getUserStoreMembers(user).length === 0) { router.replace("/"); }
  }, [hasHydrated, user, router]);

  if (!hasHydrated || !user) {
    return <div className="flex h-screen items-center justify-center"><Spin /></div>;
  }

  if (getUserStoreMembers(user).length === 0) return null;

  return <>{children}</>;
}
