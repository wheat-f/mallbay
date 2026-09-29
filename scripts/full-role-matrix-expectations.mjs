// Versioned acceptance baseline. Do not learn expected decisions from the API being tested.
// Changes to published role policy must update this file through review.
export const ROLE_KEYS = [
  "manager", "permission-regression-sales", "permission-regression-customer-service",
  "permission-regression-purchasing", "permission-regression-finance",
  "permission-regression-scheduler", "permission-regression-construction",
  "permission-regression-apprentice"
];

const ALL = ROLE_KEYS;
const M = ["manager"];
const MS = ["manager", "permission-regression-sales"];
const MSC = [...MS, "permission-regression-customer-service"];
const MCP = ["manager", "permission-regression-customer-service", "permission-regression-purchasing"];
const MF = ["manager", "permission-regression-finance"];
const MCS = ["manager", "permission-regression-customer-service", "permission-regression-scheduler"];
const BUILD = ["manager", "permission-regression-scheduler", "permission-regression-construction", "permission-regression-apprentice"];

export const DOMAIN_READS = {
  "客户": { route: "/customers", api: "/customers", allowed: MSC },
  "产品": { route: "/products", api: "/products", allowed: ALL },
  "订单": { route: "/orders", api: "/orders", allowed: ALL },
  "报价": { route: "/orders/quotes", api: "/sales-quotes", allowed: ALL },
  "施工": { route: "/construction/tasks", api: "/construction/assignments", allowed: BUILD },
  "库存": { route: "/inventory", api: "/inventory/batches", allowed: MCP },
  "采购": { route: "/purchases", api: "/purchases/overview", allowed: MCP },
  "财务": { route: "/finance", api: "/finance/overview", allowed: MF },
  "发票": { route: "/invoices", api: "/invoices", allowed: ALL },
  "返利": { route: "/rebates", api: "/rebates", allowed: ALL },
  "提成": { route: "/commissions", api: "/commissions/sales-rules", allowed: MF },
  "售后": { route: "/after-sales", api: "/after-sales", allowed: MCS },
  "质保": { route: "/warranties", api: "/warranties", allowed: ALL },
  "退货": { route: "/returns", api: "/sales-returns", allowed: MCP },
  "人员": { route: "/members", api: "/invitations", allowed: ALL },
  "门店": { route: "/workbench/:storeId", api: "/stores", allowed: ALL },
  "权限": { route: "/settings/permissions", api: "/permissions/roles", allowed: [] },
  "审计": { route: "/settings/audit", api: "/settings/audit", allowed: MF },
  "设置": { route: "/settings", api: "/settings/capabilities", allowed: ALL }
};

// A role-binding diagnostics route is never a personnel-management entry for store roles.
export const EXPLICIT_ROUTE_EXPECTATIONS = { "/settings/role-bindings": [] };
export const MANUAL_BINDING_WRITES = [
  { method: "POST", route: "/permissions/role-bindings", body: { userId: "invalid-test-target", roleId: "invalid-test-role", scopeType: "STORE", storeId: "invalid-test-store" } },
  { method: "POST", route: "/users/invalid-test-target/role-bindings", body: { roleId: "invalid-test-role", scopeType: "STORE", storeId: "invalid-test-store" } },
  { method: "PATCH", route: "/users/invalid-test-target/role-bindings/invalid-test-binding", body: { status: "DISABLED" } },
  { method: "POST", route: "/permissions/role-bindings/invalid-test-binding/disable", body: {} }
];
