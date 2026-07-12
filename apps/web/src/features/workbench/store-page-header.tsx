"use client";

import type { ReactNode } from "react";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "../../stores/auth-store";
import { getStoreWorkbenchHref } from "./navigation";
import { shouldUseManagementShell } from "./management-shell";

type StorePageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
};

export function StorePageHeader({ title, description, children }: StorePageHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const showWorkbenchBack = !shouldUseManagementShell(pathname);

  return (
    <div className="management-page-header">
      <div>
        <Typography.Title level={2} className="management-page-title">
          {title}
        </Typography.Title>
        {description ? <Typography.Text className="management-page-description">{description}</Typography.Text> : null}
      </div>
      <Space wrap>
        {showWorkbenchBack ? (
          <Button
            icon={<ArrowLeftOutlined />}
            disabled={!storeId}
            onClick={() => storeId && router.push(getStoreWorkbenchHref(storeId))}
          >
            返回工作台
          </Button>
        ) : null}
        {children}
      </Space>
    </div>
  );
}
