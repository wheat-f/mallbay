"use client";

import type { ReactNode } from "react";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../stores/auth-store";
import { getStoreWorkbenchHref } from "./navigation";

type StorePageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
};

export function StorePageHeader({ title, description, children }: StorePageHeaderProps) {
  const router = useRouter();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <Typography.Title level={3} className="!mb-1">
          {title}
        </Typography.Title>
        {description ? <Typography.Text type="secondary">{description}</Typography.Text> : null}
      </div>
      <Space wrap>
        <Button
          icon={<ArrowLeftOutlined />}
          disabled={!storeId}
          onClick={() => storeId && router.push(getStoreWorkbenchHref(storeId))}
        >
          返回工作台
        </Button>
        {children}
      </Space>
    </div>
  );
}
