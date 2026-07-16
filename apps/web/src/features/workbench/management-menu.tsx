"use client";

import type { ReactNode } from "react";
import React from "react";
import {
  AppstoreOutlined,
  AuditOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FileDoneOutlined,
  FileProtectOutlined,
  FormOutlined,
  GiftOutlined,
  IdcardOutlined,
  ReconciliationOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined
} from "@ant-design/icons";
import type { StorePosition } from "./navigation";

export type ManagementMenuItem = {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  positions?: StorePosition[];
  auditorOnly?: boolean;
};

const storePositions: StorePosition[] = [
  "MANAGER",
  "SALES",
  "CUSTOMER_SERVICE",
  "PURCHASING",
  "FINANCE",
  "SCHEDULER",
  "CONSTRUCTION",
  "APPRENTICE"
];

export const managementMenuItems: ManagementMenuItem[] = [
  { key: "workbench", label: "工作台", href: "/workbench", icon: <AppstoreOutlined />, positions: storePositions },
  { key: "construction-tasks", label: "我的施工任务", href: "/construction/tasks", icon: <ToolOutlined />, positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "construction-schedules", label: "我的排班", href: "/construction/schedules", icon: <CalendarOutlined />, positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "construction-leaves", label: "请假申请", href: "/construction/leaves", icon: <FormOutlined />, positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "construction-materials", label: "施工物料", href: "/construction/materials", icon: <AppstoreOutlined />, positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "construction-profile", label: "施工档案", href: "/construction/profile", icon: <IdcardOutlined />, positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "after-sales-tasks", label: "售后任务", href: "/after-sales/tasks", icon: <ReconciliationOutlined />, positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "customers", label: "客户管理", href: "/customers", icon: <TeamOutlined />, positions: ["MANAGER", "SALES", "CUSTOMER_SERVICE"] },
  { key: "orders", label: "销售订单", href: "/orders", icon: <ShoppingCartOutlined />, positions: ["MANAGER", "SALES", "CUSTOMER_SERVICE", "FINANCE"] },
  { key: "pricing", label: "建议价设置", href: "/orders/pricing", icon: <SettingOutlined />, positions: ["MANAGER"] },
  { key: "construction-charge-standards", label: "施工收费标准", href: "/orders/pricing/construction-costs", icon: <ToolOutlined />, positions: ["MANAGER"] },
  { key: "construction-role-costs", label: "岗位成本标准", href: "/orders/pricing/construction-costs/rates", icon: <WalletOutlined />, positions: ["FINANCE"] },
  { key: "sales-quotes", label: "报价审批", href: "/orders/quotes", icon: <AuditOutlined />, positions: ["MANAGER", "SALES"] },
  { key: "products", label: "产品管理", href: "/products", icon: <ShopOutlined />, positions: ["MANAGER", "PURCHASING"] },
  { key: "construction", label: "施工管理", href: "/construction/assignments", icon: <ToolOutlined />, positions: ["MANAGER", "SCHEDULER"] },
  { key: "construction-cost-settlements", label: "施工成本确认", href: "/construction/cost-settlements", icon: <WalletOutlined />, positions: ["MANAGER"] },
  { key: "construction-cost-settlements", label: "施工成本结算", href: "/construction/cost-settlements", icon: <WalletOutlined />, positions: ["FINANCE"] },
  { key: "inventory", label: "库存管理", href: "/inventory", icon: <AppstoreOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "PURCHASING"] },
  { key: "purchases", label: "采购管理", href: "/purchases", icon: <FileDoneOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "PURCHASING"] },
  { key: "warranties", label: "质保管理", href: "/warranties", icon: <FileProtectOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "SCHEDULER"] },
  { key: "after-sales", label: "售后管理", href: "/after-sales", icon: <ReconciliationOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "SCHEDULER"] },
  { key: "members", label: "人员管理", href: "/members", icon: <IdcardOutlined />, positions: ["MANAGER"] },
  { key: "finance", label: "财务管理", href: "/finance", icon: <WalletOutlined />, positions: ["MANAGER", "FINANCE", "PURCHASING"] },
  { key: "reports", label: "报表分析", href: "/reports", icon: <DashboardOutlined />, positions: ["MANAGER", "SALES", "FINANCE"] },
  { key: "invoices", label: "发票管理", href: "/invoices", icon: <FileDoneOutlined />, positions: ["MANAGER", "FINANCE"] },
  { key: "rebates", label: "返利管理", href: "/rebates", icon: <GiftOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "FINANCE"] },
  { key: "admin", label: "门店审核", href: "/admin", icon: <AuditOutlined />, auditorOnly: true },
  { key: "settings", label: "系统设置", href: "/settings", icon: <SettingOutlined />, positions: ["MANAGER"], auditorOnly: true }
];

export function getManagementMenuItems(input: {
  position?: StorePosition | null;
  isAuditor?: boolean | null;
  storeId?: string | null;
}) {
  const { position, isAuditor, storeId } = input;
  return managementMenuItems
    .filter((item) => {
      const allowedByStorePosition = position && item.positions?.includes(position);
      const allowedByAuditor = Boolean(isAuditor && item.auditorOnly);
      return allowedByStorePosition || allowedByAuditor;
    })
    .map((item) => ({
      ...item,
      href: item.key === "workbench" && storeId ? `/workbench/${storeId}` : item.href
    }));
}

export function getActiveManagementMenuKey(pathname: string) {
  if (pathname.startsWith("/orders/pricing/construction-costs/rates")) return "construction-role-costs";
  if (pathname.startsWith("/orders/pricing/construction-costs")) return "construction-charge-standards";
  if (pathname.startsWith("/workbench")) return "workbench";
  if (pathname.startsWith("/construction/tasks")) return "construction-tasks";
  if (pathname.startsWith("/construction/schedules")) return "construction-schedules";
  if (pathname.startsWith("/construction/leaves")) return "construction-leaves";
  if (pathname.startsWith("/construction/materials")) return "construction-materials";
  if (pathname.startsWith("/construction/cost-settlements")) return "construction-cost-settlements";
  if (pathname.startsWith("/construction/profile")) return "construction-profile";
  if (pathname.startsWith("/after-sales/tasks")) return "after-sales-tasks";
  if (pathname.startsWith("/customers")) return "customers";
  if (pathname.startsWith("/orders/pricing")) return "pricing";
  if (pathname.startsWith("/orders/quotes")) return "sales-quotes";
  if (pathname.startsWith("/orders")) return "orders";
  if (pathname.startsWith("/products")) return "products";
  if (pathname.startsWith("/construction")) return "construction";
  if (pathname.startsWith("/inventory")) return "inventory";
  if (pathname.startsWith("/purchases")) return "purchases";
  if (pathname.startsWith("/warranties")) return "warranties";
  if (pathname.startsWith("/after-sales")) return "after-sales";
  if (pathname.startsWith("/finance")) return "finance";
  if (pathname.startsWith("/invoices")) return "invoices";
  if (pathname.startsWith("/rebates")) return "rebates";
  if (pathname.startsWith("/commissions")) return "finance";
  if (pathname.startsWith("/reports")) return "reports";
  if (pathname.startsWith("/members")) return "members";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/profile")) return "profile";
  return "workbench";
}
