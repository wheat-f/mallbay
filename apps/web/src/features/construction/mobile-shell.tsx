"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Badge, Button } from "antd";
import {
  CalendarOutlined,
  CheckSquareOutlined,
  CloudSyncOutlined,
  InboxOutlined,
  UserOutlined
} from "@ant-design/icons";

type ConstructionMobileShellProps = {
  title: string;
  subtitle?: string;
  active: "tasks" | "schedules" | "camera" | "leaves" | "profile";
  variant?: "hero" | "calendar";
  badgeCount?: number;
  children: ReactNode;
};

type ConstructionMobileTab = {
  key: Exclude<ConstructionMobileShellProps["active"], "leaves">;
  label: string;
  href: string;
  icon: ReactNode;
  activeKeys: ConstructionMobileShellProps["active"][];
};

const tabs: ConstructionMobileTab[] = [
  {
    key: "schedules",
    label: "任务排班",
    href: "/construction/schedules",
    icon: <CalendarOutlined />,
    activeKeys: ["schedules", "leaves"]
  },
  {
    key: "tasks",
    label: "我的施工",
    href: "/construction/tasks",
    icon: <CheckSquareOutlined />,
    activeKeys: ["tasks"]
  },
  {
    key: "camera",
    label: "物料管理",
    href: "/construction/camera",
    icon: <InboxOutlined />,
    activeKeys: ["camera"]
  },
  {
    key: "profile",
    label: "个人中心",
    href: "/construction/profile",
    icon: <UserOutlined />,
    activeKeys: ["profile"]
  }
] as const;

export function ConstructionMobileShell({
  title,
  subtitle,
  active,
  variant = "hero",
  badgeCount = 0,
  children
}: ConstructionMobileShellProps) {
  return (
    <main className={`construction-mobile-shell mobile-worker-shell construction-mobile-shell-${variant}`}>
      <header className="construction-mobile-header">
        <div>
          <p className="construction-mobile-eyebrow">MallBay 施工端</p>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <Badge count={badgeCount} size="small">
          <Button shape="circle" icon={<CloudSyncOutlined />} href="/construction/offline" />
        </Badge>
      </header>
      <section className="construction-mobile-content">{children}</section>
      <nav className="construction-mobile-tabs mobile-worker-bottom-nav" aria-label="施工端导航">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={tab.activeKeys.includes(active) ? "construction-mobile-tab is-active" : "construction-mobile-tab"}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
