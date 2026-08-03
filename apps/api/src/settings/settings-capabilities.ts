export type SettingsDomain = "HQ" | "STORE" | "FINANCE" | "OWN";
export type SettingsAction = "view" | "create" | "edit" | "validate" | "publish" | "audit";

export type SettingsCapability = {
  code: string;
  name: string;
  domain: SettingsDomain;
  actions: readonly SettingsAction[];
  scope: "global" | "store" | "own" | "read_only";
  planned?: boolean;
};

export const SETTINGS_CAPABILITIES: readonly SettingsCapability[] = [
  { code: "settings.permissions", name: "角色与权限", domain: "HQ", actions: ["view", "create", "edit", "validate", "publish"], scope: "global" },
  { code: "settings.dictionary", name: "基础字典模板", domain: "HQ", actions: ["view", "create", "edit", "validate", "publish"], scope: "global" },
  { code: "settings.security", name: "安全策略", domain: "HQ", actions: ["view", "create", "edit", "validate", "publish"], scope: "global" },
  { code: "customer.tags", name: "客户标签规则", domain: "HQ", actions: ["view", "create", "edit", "validate", "publish"], scope: "global" },
  { code: "settings.audit.global", name: "全局审计", domain: "HQ", actions: ["view", "audit"], scope: "global" },
  { code: "store.dictionary", name: "门店基础字典", domain: "STORE", actions: ["view", "create", "edit"], scope: "store" },
  { code: "store.profile", name: "门店资料", domain: "STORE", actions: ["view", "create", "edit", "validate", "publish"], scope: "store" },
  { code: "store.operations", name: "业务开关与容量", domain: "STORE", actions: ["view", "create", "edit", "validate", "publish"], scope: "store" },
  { code: "store.notifications", name: "通知与 OSS", domain: "STORE", actions: ["view", "create", "edit", "validate", "publish"], scope: "store" },
  { code: "store.capacity", name: "预约与容量默认值", domain: "STORE", actions: ["view", "create", "edit", "validate", "publish"], scope: "store" },
  { code: "finance.labor_cost", name: "岗位小时成本", domain: "FINANCE", actions: ["view", "create", "edit", "validate", "publish"], scope: "store" },
  { code: "finance.settlement", name: "成本与结算规则", domain: "FINANCE", actions: ["view", "create", "edit", "validate", "publish"], scope: "store" },
  { code: "finance.accounts", name: "收款账户", domain: "FINANCE", actions: ["view", "create", "edit", "validate", "publish"], scope: "store" },
  { code: "finance.audit", name: "财务审计", domain: "FINANCE", actions: ["view", "audit"], scope: "store" },
  { code: "account.profile", name: "个人资料与账号", domain: "OWN", actions: ["view", "edit"], scope: "own" }
];
