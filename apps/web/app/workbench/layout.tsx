"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spin } from "antd";
import { useAuthStore } from "../../src/stores/auth-store";

export default function WorkbenchLayout({ children }: { children: React.ReactNode }) {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const router = useRouter();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user) { router.replace("/auth"); return; }
    if (!user.storeMember) { router.replace("/"); }
  }, [hasHydrated, user, router]);

  if (!hasHydrated || !user) {
    return <div className="flex h-screen items-center justify-center"><Spin /></div>;
  }

  if (!user.storeMember) return null;

  return <>{children}</>;
}
