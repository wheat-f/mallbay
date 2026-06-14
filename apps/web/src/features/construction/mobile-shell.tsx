"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Badge, Button } from "antd";
import {
  CalendarOutlined,
  CameraOutlined,
  CheckSquareOutlined,
  CloudSyncOutlined,
  FormOutlined,
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

const tabs = [
  { key: "tasks", label: "任务", href: "/construction/tasks", icon: <CheckSquareOutlined /> },
  { key: "schedules", label: "日程", href: "/construction/schedules", icon: <CalendarOutlined /> },
  { key: "camera", label: "拍照", href: "/construction/camera", icon: <CameraOutlined /> },
  { key: "leaves", label: "请假", href: "/construction/leaves", icon: <FormOutlined /> },
  { key: "profile", label: "我的", href: "/construction/profile", icon: <UserOutlined /> }
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
            className={active === tab.key ? "construction-mobile-tab is-active" : "construction-mobile-tab"}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        ))}
      </nav>
    </main>
  );
}
