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
          colorBorder: "#E2E8F0",
          colorBorderSecondary: "#EDF2F7",
          borderRadius: 10,
          fontFamily: "Noto Sans SC, Inter, system-ui, sans-serif"
        },
        components: {
          Card: { borderRadiusLG: 14, paddingLG: 18 },
          Button: { borderRadius: 8, controlHeight: 36, controlHeightLG: 40, controlHeightSM: 30 },
          Input: { borderRadius: 8, controlHeight: 36 },
          Select: { borderRadius: 8, controlHeight: 36 },
          DatePicker: { borderRadius: 8, controlHeight: 36 },
          Table: {
            headerBg: "#F8FAFC",
            headerColor: "#475569",
            rowHoverBg: "#F8FAFC",
            borderColor: "#EDF2F7",
            cellPaddingBlock: 13,
            cellPaddingInline: 14
          },
          Tabs: { itemSelectedColor: "#0F3A5F", inkBarColor: "#0F3A5F" },
          Tag: { borderRadiusSM: 6 }
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
