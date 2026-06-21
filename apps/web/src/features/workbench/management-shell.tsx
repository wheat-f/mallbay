"use client";

import type { ReactNode } from "react";
import { Avatar, Dropdown, Input, Space, Tag, Typography } from "antd";
import { HomeOutlined, LogoutOutlined, SearchOutlined, SwapOutlined, UserOutlined, UserSwitchOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { authApi } from "../../lib/api";
import { NotificationBell } from "../../components/NotificationBell";
import { canAccessSystemSettings } from "../settings/access";
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
    "/purchases",
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

export function getManagementSearchPlaceholder(pathname: string) {
  if (pathname.startsWith("/reports")) return "搜索报表、数据或人员...";
  if (pathname.startsWith("/members")) return "搜索员工、手机号...";
  if (pathname.startsWith("/finance/payment-records")) return "搜索单据、备注或经手人...";
  if (pathname.startsWith("/finance")) return "搜索单号、客户或账户...";
  if (pathname.startsWith("/invoices")) return "搜索订单、发票或客户...";
  if (pathname.startsWith("/rebates")) return "搜索单号/客户...";
  if (pathname.startsWith("/commissions/settlements")) return "搜索订单或员工...";
  if (pathname.startsWith("/commissions")) return "搜索规则或人员...";
  if (pathname.startsWith("/settings")) return "搜索设置项...";
  if (pathname.startsWith("/admin")) return "搜索门店或经理...";
  if (pathname.startsWith("/customers")) return "搜索客户、手机号、车牌或 VIN...";
  if (pathname.startsWith("/warranties")) return "搜索质保单、车牌或车架号...";
  if (pathname.startsWith("/after-sales")) return "搜索订单或售后单...";
  if (pathname.startsWith("/construction/assignments")) return "搜索订单号/客户名/车牌号...";
  if (pathname.startsWith("/construction/capacities")) return "搜索订单或日期...";
  if (pathname.startsWith("/construction/orders")) return "搜索订单号或客户姓名...";
  if (pathname.startsWith("/orders/create")) return "搜索订单、客户...";
  if (pathname.startsWith("/orders")) return "搜索订单、客户、车牌...";
  if (pathname.startsWith("/inventory/purchase-orders/")) return "搜索采购单号...";
  if (pathname.startsWith("/inventory/purchase-orders")) return "搜索采购需求或供应商...";
  if (pathname.startsWith("/inventory/suppliers")) return "搜索供应商、联系人或分类...";
  if (pathname.startsWith("/inventory/movements")) return "搜索入库单、批次号...";
  if (pathname.startsWith("/inventory")) return "搜索功能、物料、单据...";
  if (pathname.startsWith("/purchases/orders/")) return "搜索采购单号...";
  if (pathname.startsWith("/purchases/suppliers")) return "搜索供应商、联系人或评级...";
  if (pathname.startsWith("/purchases")) return "搜索采购需求、采购单或供应商...";
  if (pathname.startsWith("/products")) return "全局搜索档案、订单或规格...";
  return "搜索客户 / 车牌 / VIN / 订单号";
}

export function ManagementShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const storeMember = user?.storeMember;
  const displayName = user?.nickname ?? user?.username ?? "用户";
  const activeKey = getActiveManagementMenuKey(pathname);
  const canAccessSettings = canAccessSystemSettings({
    position: storeMember?.position,
    isAuditor: user?.isAuditor
  });
  const menuItems = getManagementMenuItems({
    position: storeMember?.position,
    isAuditor: user?.isAuditor,
    storeId: storeMember?.store.id
  }).filter((item) => item.key !== "settings" || canAccessSettings);
  const mobileMenuItems = (() => {
    const primaryItems = menuItems.slice(0, 4);
    const activeItem = menuItems.find((item) => item.key === activeKey);
    const visibleItems = activeItem && !primaryItems.some((item) => item.key === activeItem.key)
      ? [...primaryItems.slice(0, 3), activeItem]
      : primaryItems;

    return visibleItems;
  })();
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clearSession();
      router.push("/auth");
    }
  });
  const roleMenuItems = [
    ...(storeMember
      ? [
          {
            key: "workbench",
            icon: <UserOutlined />,
            label: `${storeMember.store.name} · ${POSITION_LABEL[storeMember.position] ?? storeMember.position}`,
            onClick: () => router.push(`/workbench/${storeMember.store.id}`)
          }
        ]
      : []),
    ...(user?.isAuditor
      ? [
          { key: "admin", icon: <SwapOutlined />, label: "门店审核", onClick: () => router.push("/admin") }
        ]
      : [])
  ];
  const accountMenuItems = [
    { key: "home", icon: <HomeOutlined />, label: "网站首页", onClick: () => router.push("/") },
    { type: "divider" as const },
    { key: "profile", icon: <UserOutlined />, label: "个人中心", onClick: () => router.push("/profile") },
    { type: "divider" as const },
    { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true, onClick: () => logoutMutation.mutate() }
  ];
  const roleSwitcherLabel = storeMember
    ? POSITION_LABEL[storeMember.position] ?? storeMember.position
    : user?.isAuditor ? "运营管理" : "角色切换";

  return (
    <div className="management-shell">
      <aside className="management-sidebar">
        <button className="management-brand" type="button" aria-label="返回网站首页" onClick={() => router.push("/")}>
          <span className="management-brand-title">mallbay</span>
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
              {storeMember?.store.name ?? (user?.isAuditor ? "运营管理" : "mallbay")}
            </Typography.Text>
            {storeMember ? <Tag className="management-role-tag">{POSITION_LABEL[storeMember.position] ?? storeMember.position}</Tag> : null}
          </div>

          <Input
            className="management-global-search"
            prefix={<SearchOutlined />}
            placeholder={getManagementSearchPlaceholder(pathname)}
            allowClear
          />

          <Space size="middle" className="management-topbar-actions">
            <NotificationBell />
            {roleMenuItems.length > 0 ? (
              <Dropdown
                trigger={["click"]}
                placement="bottomRight"
                menu={{ items: roleMenuItems }}
              >
                <button className="management-role-switcher" type="button">
                  <span>{roleSwitcherLabel}</span>
                  <UserSwitchOutlined />
                </button>
              </Dropdown>
            ) : null}
            <Dropdown
              trigger={["click"]}
              placement="bottomRight"
              menu={{ items: accountMenuItems }}
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
