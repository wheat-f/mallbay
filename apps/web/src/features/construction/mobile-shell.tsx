"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button } from "antd";
import {
  ArrowLeftOutlined,
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
  active: "tasks" | "schedules" | "camera" | "materials" | "leaves" | "profile";
  variant?: "hero" | "calendar" | "settings";
  badgeCount?: number;
  desktopHref?: string;
  children: ReactNode;
};

type ConstructionMobileTab = {
  key: Exclude<ConstructionMobileShellProps["active"], "materials">;
  label: string;
  href: string;
  icon: ReactNode;
  activeKeys: ConstructionMobileShellProps["active"][];
};

const tabs: ConstructionMobileTab[] = [
  {
    key: "tasks",
    label: "任务",
    href: "/construction/tasks",
    icon: <CheckSquareOutlined />,
    activeKeys: ["tasks", "materials"]
  },
  {
    key: "schedules",
    label: "日程",
    href: "/construction/schedules",
    icon: <CalendarOutlined />,
    activeKeys: ["schedules"]
  },
  {
    key: "camera",
    label: "拍照",
    href: "/construction/camera",
    icon: <CameraOutlined />,
    activeKeys: ["camera"]
  },
  {
    key: "leaves",
    label: "请假",
    href: "/construction/leaves",
    icon: <FormOutlined />,
    activeKeys: ["leaves"]
  },
  {
    key: "profile",
    label: "我的",
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
  desktopHref,
  children
}: ConstructionMobileShellProps) {
  const router = useRouter();
  const isSettings = variant === "settings";

  useEffect(() => {
    if (!desktopHref) return;
    const desktopQuery = window.matchMedia("(min-width: 901px)");
    if (desktopQuery.matches) {
      router.replace(desktopHref);
    }
  }, [desktopHref, router]);

  return (
    <main className={`construction-mobile-shell mobile-worker-shell construction-mobile-shell-${variant}`}>
      <header className={isSettings ? "construction-mobile-header construction-mobile-settings-header" : "construction-mobile-header"}>
        {isSettings ? (
          <>
            <Button type="text" shape="circle" icon={<ArrowLeftOutlined />} aria-label="返回" onClick={() => router.back()} />
            <h1>{title}</h1>
            <span className="construction-mobile-settings-spacer" aria-hidden="true" />
          </>
        ) : (
          <>
            <div>
              <p className="construction-mobile-eyebrow">mallbay 施工端</p>
              <h1>{title}</h1>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>
            <Badge count={badgeCount} size="small">
              <Button shape="circle" icon={<CloudSyncOutlined />} href="/construction/offline" />
            </Badge>
          </>
        )}
      </header>
      <section className="construction-mobile-content">{children}</section>
      <ConstructionMobileBottomNav active={active} />
    </main>
  );
}

export function ConstructionMobileBottomNav({ active }: { active?: ConstructionMobileShellProps["active"] }) {
  return (
    <nav className="construction-mobile-tabs mobile-worker-bottom-nav" aria-label="施工端导航">
      {tabs.map((tab) => {
        const tabClasses = [
          "construction-mobile-tab",
          tab.key === "camera" ? "construction-mobile-tab--camera" : "",
          active && tab.activeKeys.includes(active) ? "is-active" : ""
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <Link key={tab.key} href={tab.href} className={tabClasses}>
            {tab.icon}
            <span className="construction-mobile-tab-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
