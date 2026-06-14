"use client";

import type { ReactNode } from "react";
import { Avatar, Dropdown, Input, Space, Tag, Typography } from "antd";
import { LogoutOutlined, SearchOutlined, SettingOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { authApi } from "../../lib/api";
import { NotificationBell } from "../../components/NotificationBell";
import { useAuthStore } from "../../stores/auth-store";
import { getActiveManagementMenuKey, getManagementMenuItems } from "./management-menu";

const POSITION_LABEL: Record<string, string> = {
  MANAGER: "店长",
  SALES: "销售",
  CUSTOMER_SERVICE: "客服",
  PURCHASING: "采购",
  FINANCE: "财务",
  SCHEDULER: "施工主管",
  CONSTRUCTION: "施工员",
  APPRENTICE: "学徒"
};

const publicPrefixes = ["/auth", "/stores/"];
const mobilePrefixes = [
  "/construction/tasks",
  "/construction/schedules",
  "/construction/camera",
  "/construction/materials",
  "/construction/leaves",
  "/construction/offline",
  "/construction/profile",
  "/after-sales/tasks"
];

export function shouldUseManagementShell(pathname: string) {
  if (pathname === "/") return false;
  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) return false;
  if (mobilePrefixes.some((prefix) => pathname.startsWith(prefix))) return false;
  return [
    "/admin",
    "/dashboard",
    "/workbench",
    "/customers",
    "/orders",
    "/products",
    "/construction",
    "/inventory",
    "/warranties",
    "/after-sales",
    "/finance",
    "/invoices",
    "/rebates",
    "/commissions",
    "/reports",
    "/members",
    "/settings",
    "/profile"
  ].some((prefix) => pathname.startsWith(prefix));
}

export function ManagementShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const storeMember = user?.storeMember;
  const displayName = user?.nickname ?? user?.username ?? "用户";
  const activeKey = getActiveManagementMenuKey(pathname);
  const menuItems = getManagementMenuItems({
    position: storeMember?.position,
    isAuditor: user?.isAuditor,
    storeId: storeMember?.store.id
  });
  const mobileMenuItems = (() => {
    const primaryItems = menuItems.slice(0, 4);
    const activeItem = menuItems.find((item) => item.key === activeKey);
    const visibleItems = activeItem && !primaryItems.some((item) => item.key === activeItem.key)
      ? [...primaryItems.slice(0, 3), activeItem]
      : primaryItems;

    return [
      ...visibleItems,
      { key: "profile", label: "我的", href: "/profile", icon: <UserOutlined /> }
    ];
  })();

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clearSession();
      router.push("/auth");
    }
  });

  return (
    <div className="management-shell">
      <aside className="management-sidebar">
        <button className="management-brand" type="button" onClick={() => router.push(storeMember ? `/workbench/${storeMember.store.id}` : "/")}>
          <span className="management-brand-title">MallBay</span>
          <span className="management-brand-subtitle">门店运营系统</span>
        </button>

        <nav className="management-nav" aria-label="主导航">
          {menuItems.map((item) => {
            const active = activeKey === item.key;
            return (
              <button
                key={item.key}
                type="button"
                className={`management-nav-item${active ? " management-nav-item-active" : ""}`}
                onClick={() => router.push(item.href)}
              >
                <span className="management-nav-icon">{item.icon}</span>
                <span className="management-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="management-user-card">
          <Avatar size={40} src={user?.avatarUrl} className="management-user-avatar">
            {displayName.charAt(0).toUpperCase()}
          </Avatar>
          <div className="min-w-0">
            <div className="management-user-name">{displayName}</div>
            <div className="management-user-role">
              {storeMember ? POSITION_LABEL[storeMember.position] ?? storeMember.position : user?.isAuditor ? "管理员" : "访客"}
            </div>
          </div>
        </div>
      </aside>

      <div className="management-main">
        <header className="management-topbar">
          <div className="management-topbar-left">
            <Typography.Text className="management-store-name">
              {storeMember?.store.name ?? (user?.isAuditor ? "运营管理" : "MallBay")}
            </Typography.Text>
            {storeMember ? <Tag className="management-role-tag">{POSITION_LABEL[storeMember.position] ?? storeMember.position}</Tag> : null}
          </div>

          <Input
            className="management-global-search"
            prefix={<SearchOutlined />}
            placeholder="全局搜索档案、订单或规格..."
            allowClear
          />

          <Space size="middle" className="management-topbar-actions">
            <NotificationBell />
            <button className="management-icon-button" type="button" aria-label="系统设置" onClick={() => router.push("/settings")}>
              <SettingOutlined />
            </button>
            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              menu={{
                items: [
                  { key: "profile", icon: <UserOutlined />, label: "个人中心", onClick: () => router.push("/profile") },
                  { type: "divider" },
                  { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true, onClick: () => logoutMutation.mutate() }
                ]
              }}
            >
              <button className="management-avatar-button" type="button" aria-label="账户菜单">
                <Avatar size={34} src={user?.avatarUrl}>
                  {displayName.charAt(0).toUpperCase()}
                </Avatar>
              </button>
            </Dropdown>
          </Space>
        </header>

        <main className="management-content">{children}</main>
      </div>

      <nav className="management-mobile-nav" aria-label="移动导航">
        {mobileMenuItems.map((item) => {
          const active = activeKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`management-mobile-nav-item${active ? " management-mobile-nav-item-active" : ""}`}
              onClick={() => router.push(item.href)}
            >
              <span className="management-mobile-nav-icon">{item.icon}</span>
              <span className="management-mobile-nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
