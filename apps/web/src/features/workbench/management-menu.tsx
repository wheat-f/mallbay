"use client";

import type { ReactNode } from "react";
import React from "react";
import {
  AppstoreOutlined, AuditOutlined, CalendarOutlined, DashboardOutlined,
  FileDoneOutlined, FileProtectOutlined, FormOutlined, GiftOutlined,
  IdcardOutlined, ReconciliationOutlined, SettingOutlined, ShopOutlined,
  ShoppingCartOutlined, TeamOutlined, ToolOutlined, WalletOutlined
} from "@ant-design/icons";

export type RuntimePermission = { code: string; actions: string[]; scopes?: string[] };
type PermissionRequirement = { code: string; action?: string; global?: boolean };

export type ManagementMenuItem = {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  anyOf?: PermissionRequirement[];
};

export type ManagementMenuGroup = {
  key: string;
  label: string;
  icon: ReactNode;
  items: ManagementMenuItem[];
};

const settingsReadRequirements: PermissionRequirement[] = [
  { code: "permissions.policy", action: "read", global: true }, { code: "settings.dictionary", action: "read", global: true },
  { code: "settings.security", action: "read", global: true }, { code: "customer.tags", action: "read", global: true },
  { code: "settings.audit.global", action: "read", global: true }, { code: "store.dictionary", action: "read" },
  { code: "store.members", action: "read" }, { code: "store.profile", action: "read" },
  { code: "store.operations", action: "read" }, { code: "store.notifications", action: "read" },
  { code: "store.capacity", action: "read" }, { code: "finance.labor_cost", action: "read" },
  { code: "finance.settlement", action: "read" }, { code: "finance.accounts", action: "read" },
  { code: "finance.audit", action: "read" }
];

export const managementMenuItems: ManagementMenuItem[] = [
  { key: "workbench", label: "工作台", href: "/workbench", icon: <AppstoreOutlined /> },
  { key: "construction-tasks", label: "我的施工任务", href: "/construction/tasks", icon: <ToolOutlined />, anyOf: [{ code: "construction", action: "read" }] },
  { key: "construction-schedules", label: "施工排班", href: "/construction/schedules", icon: <CalendarOutlined />, anyOf: [{ code: "construction", action: "read" }] },
  { key: "construction-leaves", label: "请假申请", href: "/construction/leaves", icon: <FormOutlined />, anyOf: [{ code: "construction", action: "read" }] },
  { key: "construction-materials", label: "施工物料", href: "/construction/materials", icon: <AppstoreOutlined />, anyOf: [{ code: "construction", action: "read" }] },
  { key: "construction-profile", label: "施工档案", href: "/construction/profile", icon: <IdcardOutlined />, anyOf: [{ code: "construction", action: "read" }] },
  { key: "after-sales-tasks", label: "售后任务", href: "/after-sales/tasks", icon: <ReconciliationOutlined />, anyOf: [{ code: "after-sales", action: "read" }] },
  { key: "customers", label: "客户管理", href: "/customers", icon: <TeamOutlined />, anyOf: [{ code: "customers", action: "read" }] },
  { key: "orders", label: "销售订单", href: "/orders", icon: <ShoppingCartOutlined />, anyOf: [{ code: "orders", action: "read" }] },
  { key: "pricing", label: "建议价设置", href: "/orders/pricing", icon: <SettingOutlined />, anyOf: [{ code: "products", action: "suggested-price-write" }] },
  { key: "construction-charge-standards", label: "施工收费标准", href: "/orders/pricing/construction-costs", icon: <ToolOutlined />, anyOf: [{ code: "construction", action: "write" }] },
  { key: "construction-role-costs", label: "岗位成本标准", href: "/orders/pricing/construction-costs/rates", icon: <WalletOutlined />, anyOf: [{ code: "finance.labor_cost", action: "read" }, { code: "finance", action: "read" }] },
  { key: "sales-quotes", label: "报价审批", href: "/orders/quotes", icon: <AuditOutlined />, anyOf: [{ code: "orders", action: "read" }] },
  { key: "products", label: "产品管理", href: "/products", icon: <ShopOutlined />, anyOf: [{ code: "products", action: "read" }] },
  { key: "cross-store-construction", label: "跨店施工协作", href: "/construction/cross-store", icon: <TeamOutlined />, anyOf: [{ code: "construction", action: "read" }] },
  { key: "construction", label: "施工管理", href: "/construction/assignments", icon: <ToolOutlined />, anyOf: [{ code: "construction", action: "write" }] },
  { key: "construction-leave-approvals", label: "请假审批", href: "/construction/leave-approvals", icon: <FormOutlined />, anyOf: [{ code: "construction", action: "write" }] },
  { key: "construction-cost-settlements", label: "施工成本结算", href: "/construction/cost-settlements", icon: <WalletOutlined />, anyOf: [{ code: "finance", action: "read" }] },
  { key: "inventory", label: "库存管理", href: "/inventory", icon: <AppstoreOutlined />, anyOf: [{ code: "inventory", action: "read" }] },
  { key: "purchases", label: "采购管理", href: "/purchases", icon: <FileDoneOutlined />, anyOf: [{ code: "purchase", action: "read" }] },
  { key: "warranties", label: "质保管理", href: "/warranties", icon: <FileProtectOutlined />, anyOf: [{ code: "warranties", action: "read" }] },
  { key: "after-sales", label: "售后管理", href: "/after-sales", icon: <ReconciliationOutlined />, anyOf: [{ code: "after-sales", action: "read" }] },
  { key: "members", label: "人员管理", href: "/members", icon: <IdcardOutlined />, anyOf: [{ code: "store.members", action: "read" }] },
  { key: "finance-expenses", label: "费用申请", href: "/finance/expenses", icon: <WalletOutlined />, anyOf: [{ code: "finance.application", action: "submit" }] },
  { key: "finance", label: "财务管理", href: "/finance", icon: <WalletOutlined />, anyOf: [{ code: "finance", action: "read" }] },
  { key: "reports", label: "报表分析", href: "/reports", icon: <DashboardOutlined />, anyOf: [{ code: "reports", action: "read" }] },
  { key: "invoices", label: "发票管理", href: "/invoices", icon: <FileDoneOutlined />, anyOf: [{ code: "finance", action: "read" }] },
  { key: "rebates", label: "返利管理", href: "/rebates", icon: <GiftOutlined />, anyOf: [{ code: "rebates", action: "read" }] },
  { key: "admin", label: "门店审核", href: "/admin", icon: <AuditOutlined />, anyOf: [{ code: "store", action: "read", global: true }] },
  { key: "settings", label: "系统设置", href: "/settings", icon: <SettingOutlined />, anyOf: settingsReadRequirements }
];

const managementMenuGroupDefinitions: Array<{ key: string; label: string; icon: ReactNode; itemKeys: string[] }> = [
  { key: "customer-sales", label: "客户与销售", icon: <TeamOutlined />, itemKeys: ["customers", "orders", "sales-quotes"] },
  { key: "product-pricing", label: "产品与定价", icon: <ShopOutlined />, itemKeys: ["products", "pricing", "construction-charge-standards", "construction-role-costs"] },
  { key: "construction", label: "施工履约", icon: <ToolOutlined />, itemKeys: ["construction-tasks", "construction", "cross-store-construction", "construction-schedules", "construction-leaves", "construction-leave-approvals", "construction-materials", "construction-profile", "after-sales-tasks", "construction-cost-settlements"] },
  { key: "inventory-purchase", label: "库存与采购", icon: <AppstoreOutlined />, itemKeys: ["inventory", "purchases"] },
  { key: "warranty-after-sales", label: "质保与售后", icon: <FileProtectOutlined />, itemKeys: ["warranties", "after-sales"] },
  { key: "finance-business", label: "财务与经营", icon: <WalletOutlined />, itemKeys: ["finance-expenses", "finance", "invoices", "rebates", "reports"] },
  { key: "people-system", label: "人员与系统", icon: <SettingOutlined />, itemKeys: ["members", "admin", "settings"] }
];

function satisfiesRequirement(permissions: RuntimePermission[], requirement: PermissionRequirement) {
  return permissions.some((permission) => permission.code === requirement.code
    && (!requirement.action || permission.actions.includes(requirement.action))
    && (!requirement.global || permission.scopes?.includes("GLOBAL")));
}

export function hasAnySettingsReadPermission(permissions?: RuntimePermission[]) {
  return Boolean(permissions && settingsReadRequirements.some((requirement) => satisfiesRequirement(permissions, requirement)));
}

export function getManagementMenuItems(input: { storeId?: string | null; permissions?: RuntimePermission[] }) {
  const { storeId, permissions } = input;
  if (!permissions) return [];
  return managementMenuItems
    .filter((item) => item.key === "workbench" ? permissions.length > 0 : Boolean(item.anyOf?.some((requirement) => satisfiesRequirement(permissions, requirement))))
    .map((item) => ({ ...item, href: item.key === "workbench" && storeId ? `/workbench/${storeId}` : item.href }));
}

export function getManagementMenuGroups(input: { storeId?: string | null; permissions?: RuntimePermission[] }) {
  const items = getManagementMenuItems(input);
  return managementMenuGroupDefinitions
    .map((group) => ({ ...group, items: group.itemKeys.map((key) => items.find((item) => item.key === key)).filter((item): item is ManagementMenuItem => Boolean(item)) }))
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
