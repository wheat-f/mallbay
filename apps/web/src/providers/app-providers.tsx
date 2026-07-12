"use client";

import { ConfigProvider, App as AntdApp } from "antd";
import zhCN from "antd/locale/zh_CN";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ManagementShell, shouldUseManagementShell } from "../features/workbench/management-shell";

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <ConfigProvider
      locale={zhCN}
      getPopupContainer={() => document.body}
      theme={{
        token: {
          colorPrimary: "#0F3A5F",
          colorError: "#D71920",
          colorInfo: "#2563EB",
          colorSuccess: "#16A34A",
          colorWarning: "#F59E0B",
          colorBgLayout: "#F6F8FB",
          colorBorder: "#D9E2EC",
          borderRadius: 10,
          fontFamily: "Noto Sans SC, Inter, system-ui, sans-serif"
        },
        components: {
          Card: { borderRadiusLG: 16, paddingLG: 20 },
          Button: { borderRadius: 10, controlHeight: 40 },
          Input: { borderRadius: 10, controlHeight: 40 },
          Select: { borderRadius: 10, controlHeight: 40 },
          Table: { headerBg: "#EEF3F8", headerColor: "#111827", rowHoverBg: "#F6F8FB" }
        }
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          {shouldUseManagementShell(pathname) ? <ManagementShell>{children}</ManagementShell> : children}
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
