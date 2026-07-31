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
  permissionCode?: string;
};

export type ManagementMenuGroup = {
  key: string;
  label: string;
  icon: ReactNode;
  items: ManagementMenuItem[];
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
  { key: "construction-leaves", label: "请假申请", href: "/construction/leaves", icon: <FormOutlined />, positions: ["CONSTRUCTION", "APPRENTICE", "SCHEDULER"] },
  { key: "construction-materials", label: "施工物料", href: "/construction/materials", icon: <AppstoreOutlined />, positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "construction-profile", label: "施工档案", href: "/construction/profile", icon: <IdcardOutlined />, positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "after-sales-tasks", label: "售后任务", href: "/after-sales/tasks", icon: <ReconciliationOutlined />, positions: ["CONSTRUCTION", "APPRENTICE"] },
  { key: "customers", label: "客户管理", href: "/customers", icon: <TeamOutlined />, positions: ["MANAGER", "SALES", "CUSTOMER_SERVICE"] },
  { key: "orders", label: "销售订单", href: "/orders", icon: <ShoppingCartOutlined />, positions: ["MANAGER", "SALES", "CUSTOMER_SERVICE", "FINANCE"] },
  { key: "pricing", label: "建议价设置", href: "/orders/pricing", icon: <SettingOutlined />, positions: ["MANAGER"] },
  { key: "construction-charge-standards", label: "施工收费标准", href: "/orders/pricing/construction-costs", icon: <ToolOutlined />, positions: ["MANAGER"] },
  { key: "construction-role-costs", label: "岗位成本标准", href: "/orders/pricing/construction-costs/rates", icon: <WalletOutlined />, positions: ["FINANCE"] },
  { key: "sales-quotes", label: "报价审批", href: "/orders/quotes", icon: <AuditOutlined />, positions: ["MANAGER", "SALES"] },
  { key: "products", label: "产品管理", href: "/products", icon: <ShopOutlined />, positions: ["MANAGER", "PURCHASING", "FINANCE"] },
  { key: "cross-store-construction", label: "跨店施工协作", href: "/construction/cross-store", icon: <TeamOutlined />, positions: ["MANAGER", "SCHEDULER", "PURCHASING"] },
  { key: "construction", label: "施工管理", href: "/construction/assignments", icon: <ToolOutlined />, positions: ["MANAGER", "SCHEDULER"] },
  { key: "construction-schedules", label: "施工排班", href: "/construction/schedules", icon: <CalendarOutlined />, positions: ["MANAGER", "SCHEDULER"] },
  { key: "construction-leave-approvals", label: "请假审批", href: "/construction/leave-approvals", icon: <FormOutlined />, positions: ["MANAGER", "SCHEDULER"] },
  { key: "construction-cost-settlements", label: "施工成本确认", href: "/construction/cost-settlements", icon: <WalletOutlined />, positions: ["MANAGER"] },
  { key: "construction-cost-settlements", label: "施工成本结算", href: "/construction/cost-settlements", icon: <WalletOutlined />, positions: ["FINANCE"] },
  { key: "inventory", label: "库存管理", href: "/inventory", icon: <AppstoreOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "PURCHASING"] },
  { key: "purchases", label: "采购管理", href: "/purchases", icon: <FileDoneOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "PURCHASING", "FINANCE"] },
  { key: "warranties", label: "质保管理", href: "/warranties", icon: <FileProtectOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "SCHEDULER"] },
  { key: "after-sales", label: "售后管理", href: "/after-sales", icon: <ReconciliationOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "SCHEDULER"] },
  { key: "members", label: "人员管理", href: "/members", icon: <IdcardOutlined />, positions: ["MANAGER"] },
  { key: "finance-expenses", label: "费用申请", href: "/finance/expenses", icon: <WalletOutlined />, positions: storePositions },
  { key: "finance", label: "财务管理", href: "/finance", icon: <WalletOutlined />, positions: ["MANAGER", "FINANCE", "PURCHASING"] },
  { key: "reports", label: "报表分析", href: "/reports", icon: <DashboardOutlined />, positions: ["MANAGER", "SALES", "FINANCE"] },
  { key: "invoices", label: "发票管理", href: "/invoices", icon: <FileDoneOutlined />, positions: ["MANAGER", "FINANCE"] },
  { key: "rebates", label: "返利管理", href: "/rebates", icon: <GiftOutlined />, positions: ["MANAGER", "CUSTOMER_SERVICE", "FINANCE"] },
  { key: "admin", label: "门店审核", href: "/admin", icon: <AuditOutlined />, auditorOnly: true },
  { key: "settings", label: "系统设置", href: "/settings", icon: <SettingOutlined />, positions: ["MANAGER"], auditorOnly: true }
];

const menuPermissionCodes: Record<string, string> = {
  customers: "customers", orders: "orders", construction: "construction", "construction-tasks": "construction", "construction-schedules": "construction", "construction-leaves": "construction", "construction-materials": "construction", "construction-profile": "construction", "after-sales-tasks": "after-sales", pricing: "settings", "construction-charge-standards": "construction", "construction-role-costs": "finance", "sales-quotes": "orders", products: "products", "cross-store-construction": "construction", inventory: "inventory", purchases: "purchase", warranties: "warranties", "after-sales": "after-sales", members: "settings", "finance-expenses": "finance", finance: "finance", reports: "reports", invoices: "finance", rebates: "finance", settings: "settings"
};

const managementMenuGroupDefinitions: Array<{ key: string; label: string; icon: ReactNode; itemKeys: string[] }> = [
  { key: "customer-sales", label: "客户与销售", icon: <TeamOutlined />, itemKeys: ["customers", "orders", "sales-quotes"] },
  { key: "product-pricing", label: "产品与定价", icon: <ShopOutlined />, itemKeys: ["products", "pricing", "construction-charge-standards", "construction-role-costs"] },
  {
    key: "construction",
    label: "施工履约",
    icon: <ToolOutlined />,
    itemKeys: ["construction-tasks", "construction", "cross-store-construction", "construction-schedules", "construction-leaves", "construction-leave-approvals", "construction-materials", "construction-profile", "after-sales-tasks", "construction-cost-settlements"]
  },
  { key: "inventory-purchase", label: "库存与采购", icon: <AppstoreOutlined />, itemKeys: ["inventory", "purchases"] },
  { key: "warranty-after-sales", label: "质保与售后", icon: <FileProtectOutlined />, itemKeys: ["warranties", "after-sales"] },
  { key: "finance-business", label: "财务与经营", icon: <WalletOutlined />, itemKeys: ["finance-expenses", "finance", "invoices", "rebates", "reports"] },
  { key: "people-system", label: "人员与系统", icon: <SettingOutlined />, itemKeys: ["members", "admin", "settings"] }
];

export function getManagementMenuItems(input: {
  position?: StorePosition | null;
  isAuditor?: boolean | null;
  storeId?: string | null;
  permissions?: Array<{ code: string; actions: string[] }>;
}) {
  const { position, isAuditor, storeId, permissions } = input;
  return managementMenuItems
    .filter((item) => {
      const allowedByStorePosition = position && item.positions?.includes(position);
      const allowedByAuditor = Boolean(isAuditor && item.auditorOnly);
      const permissionCode = item.permissionCode ?? menuPermissionCodes[item.key];
      const allowedByPermission = !permissions || !permissionCode || permissions.some((permission) => permission.code === permissionCode && permission.actions.includes("read"));
      return (allowedByStorePosition || allowedByAuditor) && allowedByPermission;
    })
    .map((item) => ({
      ...item,
      href: item.key === "workbench" && storeId ? `/workbench/${storeId}` : item.href
    }));
}

export function getManagementMenuGroups(input: {
  position?: StorePosition | null;
  isAuditor?: boolean | null;
  storeId?: string | null;
  permissions?: Array<{ code: string; actions: string[] }>;
}) {
  const items = getManagementMenuItems(input);
  return managementMenuGroupDefinitions
    .map((group) => ({
      ...group,
      items: group.itemKeys
        .map((key) => items.find((item) => item.key === key))
        .filter((item): item is ManagementMenuItem => Boolean(item))
    }))
    .filter((group) => group.items.length > 0);
}

export function getActiveManagementMenuKey(pathname: string) {
  if (pathname.startsWith("/orders/pricing/construction-costs/rates")) return "construction-role-costs";
  if (pathname.startsWith("/orders/pricing/construction-costs")) return "construction-charge-standards";
  if (pathname.startsWith("/workbench")) return "workbench";
  if (pathname.startsWith("/construction/tasks")) return "construction-tasks";
  if (pathname.startsWith("/construction/leave-approvals")) return "construction-leave-approvals";
  if (pathname.startsWith("/construction/schedules")) return "construction-schedules";
  if (pathname.startsWith("/construction/leaves")) return "construction-leaves";
  if (pathname.startsWith("/construction/materials")) return "construction-materials";
  if (pathname.startsWith("/construction/cost-settlements")) return "construction-cost-settlements";
  if (pathname.startsWith("/construction/cross-store")) return "cross-store-construction";
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
  if (pathname.startsWith("/finance/expenses")) return "finance-expenses";
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
