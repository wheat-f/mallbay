/**
 * The reviewed permission catalog. Database migrations materialize this list;
 * published policies may grant catalogued entries but may not invent entries.
 */
export type PermissionCatalogEntry = {
  code: string;
  name: string;
  resource: string;
  actions: readonly string[];
  supportedScopes: readonly string[];
};

const OWN_STORE_GLOBAL = ["OWN", "STORE", "GLOBAL"] as const;
const STORE_GLOBAL = ["STORE", "GLOBAL"] as const;
const GLOBAL = ["GLOBAL"] as const;
const STORE = ["STORE"] as const;
const OWN = ["OWN"] as const;

export const PERMISSION_CATALOG: readonly PermissionCatalogEntry[] = [
  { code: "customers", name: "客户", resource: "customers", actions: ["read", "write"], supportedScopes: OWN_STORE_GLOBAL },
  { code: "orders", name: "订单", resource: "orders", actions: ["read", "write"], supportedScopes: OWN_STORE_GLOBAL },
  { code: "orders.lifecycle", name: "订单生命周期", resource: "orders", actions: ["finalize", "cancel", "cross_store_source_manage", "verification_view", "verification_resolve"], supportedScopes: STORE_GLOBAL },
  { code: "warranties", name: "质保", resource: "warranties", actions: ["read", "write"], supportedScopes: STORE_GLOBAL },
  { code: "construction", name: "施工", resource: "construction", actions: ["read", "write"], supportedScopes: OWN_STORE_GLOBAL },
  { code: "products", name: "产品", resource: "products", actions: ["read", "write", "suggested-price-write"], supportedScopes: STORE_GLOBAL },
  { code: "pricing.template", name: "定价模板", resource: "pricing", actions: ["write"], supportedScopes: GLOBAL },
  { code: "inventory", name: "库存", resource: "inventory", actions: ["read", "write"], supportedScopes: STORE_GLOBAL },
  { code: "purchase", name: "采购", resource: "purchase", actions: ["read", "write"], supportedScopes: STORE_GLOBAL },
  { code: "after-sales", name: "售后", resource: "after-sales", actions: ["read", "write"], supportedScopes: OWN_STORE_GLOBAL },
  { code: "reports", name: "报表", resource: "reports", actions: ["read"], supportedScopes: OWN_STORE_GLOBAL },
  { code: "finance", name: "财务", resource: "finance", actions: ["read", "write"], supportedScopes: OWN_STORE_GLOBAL },
  { code: "finance.cost", name: "财务成本", resource: "finance", actions: ["read"], supportedScopes: STORE_GLOBAL },
  { code: "finance.application", name: "财务申请", resource: "finance", actions: ["submit"], supportedScopes: OWN_STORE_GLOBAL },
  { code: "finance.document", name: "财务单据", resource: "finance", actions: ["read", "attach"], supportedScopes: OWN_STORE_GLOBAL },
  { code: "finance.expense", name: "费用审批", resource: "finance", actions: ["review"], supportedScopes: STORE_GLOBAL },
  { code: "finance.reimbursement", name: "报销审批", resource: "finance", actions: ["review", "pay"], supportedScopes: STORE_GLOBAL },
  { code: "rebates", name: "返利", resource: "rebates", actions: ["read", "apply", "review", "pay"], supportedScopes: OWN_STORE_GLOBAL },
  { code: "commissions", name: "提成", resource: "commissions", actions: ["write"], supportedScopes: STORE_GLOBAL },
  { code: "returns", name: "退货", resource: "returns", actions: ["write", "create", "manage", "approve", "finance"], supportedScopes: STORE_GLOBAL },
  { code: "store", name: "门店", resource: "store", actions: ["read", "write"], supportedScopes: STORE_GLOBAL },
  { code: "users", name: "用户", resource: "users", actions: ["read", "write"], supportedScopes: GLOBAL },

  { code: "permissions.policy", name: "权限策略", resource: "permissions", actions: ["read", "write", "publish"], supportedScopes: GLOBAL },
  { code: "settings.dictionary", name: "总部字典模板", resource: "settings", actions: ["read", "write"], supportedScopes: GLOBAL },
  { code: "settings.security", name: "安全策略", resource: "settings", actions: ["read", "write"], supportedScopes: GLOBAL },
  { code: "customer.tags", name: "客户标签规则", resource: "customers", actions: ["read", "write"], supportedScopes: GLOBAL },
  { code: "settings.audit.global", name: "全局审计", resource: "settings", actions: ["read"], supportedScopes: GLOBAL },
  { code: "store.dictionary", name: "门店基础字典", resource: "store", actions: ["read", "write"], supportedScopes: STORE },
  { code: "store.members", name: "门店成员", resource: "store", actions: ["read", "write"], supportedScopes: STORE },
  { code: "store.profile", name: "门店资料", resource: "store", actions: ["read", "write"], supportedScopes: STORE },
  { code: "store.operations", name: "门店运营参数", resource: "store", actions: ["read", "write"], supportedScopes: STORE },
  { code: "store.notifications", name: "门店通知与 OSS", resource: "store", actions: ["read", "write"], supportedScopes: STORE },
  { code: "store.capacity", name: "门店预约与容量", resource: "store", actions: ["read", "write"], supportedScopes: STORE },
  { code: "finance.labor_cost", name: "岗位小时成本", resource: "finance", actions: ["read", "write"], supportedScopes: STORE },
  { code: "finance.settlement", name: "成本与结算规则", resource: "finance", actions: ["read", "write"], supportedScopes: STORE },
  { code: "finance.accounts", name: "收款账户", resource: "finance", actions: ["read", "write"], supportedScopes: STORE },
  { code: "finance.audit", name: "财务审计", resource: "finance", actions: ["read"], supportedScopes: STORE },
  { code: "account.profile", name: "个人资料与账号", resource: "account", actions: ["read", "write"], supportedScopes: OWN }
];

export const PERMISSION_CATALOG_BY_CODE = new Map(PERMISSION_CATALOG.map((entry) => [entry.code, entry]));

export const STORE_POSITION_ROLE_CODES = [
  "MANAGER",
  "SALES",
  "CUSTOMER_SERVICE",
  "PURCHASING",
  "FINANCE",
  "SCHEDULER",
  "CONSTRUCTION",
  "APPRENTICE"
] as const;

export const SETTINGS_CAPABILITY_PERMISSION: Record<string, { permissionCode: string; actionBySettingsAction: Record<string, string> }> = {
  "settings.permissions": { permissionCode: "permissions.policy", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "publish" } },
  "settings.dictionary": { permissionCode: "settings.dictionary", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "settings.security": { permissionCode: "settings.security", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "customer.tags": { permissionCode: "customer.tags", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "settings.audit.global": { permissionCode: "settings.audit.global", actionBySettingsAction: { view: "read", audit: "read" } },
  "store.dictionary": { permissionCode: "store.dictionary", actionBySettingsAction: { view: "read", create: "write", edit: "write" } },
  "store.profile": { permissionCode: "store.profile", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "store.operations": { permissionCode: "store.operations", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "store.notifications": { permissionCode: "store.notifications", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "store.capacity": { permissionCode: "store.capacity", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "finance.labor_cost": { permissionCode: "finance.labor_cost", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "finance.settlement": { permissionCode: "finance.settlement", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "finance.accounts": { permissionCode: "finance.accounts", actionBySettingsAction: { view: "read", create: "write", edit: "write", validate: "write", publish: "write" } },
  "finance.audit": { permissionCode: "finance.audit", actionBySettingsAction: { view: "read", audit: "read" } },
  "account.profile": { permissionCode: "account.profile", actionBySettingsAction: { view: "read", edit: "write" } }
};

export function isCatalogGrant(permissionCode: string, action: string, scope: string) {
  const entry = PERMISSION_CATALOG_BY_CODE.get(permissionCode);
  return Boolean(entry?.actions.includes(action) && entry.supportedScopes.includes(scope));
}
