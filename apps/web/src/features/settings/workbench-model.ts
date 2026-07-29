export type SettingsDomain = "HQ" | "STORE" | "FINANCE" | "OWN";
export type CapabilityView = {
  code: string;
  name: string;
  domain: SettingsDomain;
  actions: string[];
  scope: "global" | "store" | "own" | "read_only";
  planned?: boolean;
  allowed: boolean;
  scopeId: string | null;
};
export const DOMAIN_META: Record<SettingsDomain, { title: string; description: string }> = {
  HQ: { title: "总部治理", description: "权限、字典模板、安全策略与全局审计" },
  STORE: { title: "门店运营", description: "当前门店资料、业务开关与运营默认值" },
  FINANCE: { title: "财务结算", description: "岗位成本、结算规则、收款账户与财务审计" },
  OWN: { title: "个人与账号", description: "个人资料、密码与设备安全" }
};
export function groupCapabilities(capabilities: CapabilityView[]) {
  return (Object.keys(DOMAIN_META) as SettingsDomain[])
    .map((domain) => ({ domain, ...DOMAIN_META[domain], capabilities: capabilities.filter((item) => item.domain === domain) }))
    .filter((group) => group.capabilities.length > 0);
}
export function capabilityStatus(capability: CapabilityView) {
  if (capability.planned) return { label: "规划中", tone: "neutral" as const };
  if (!capability.actions.includes("edit") && !capability.actions.includes("publish")) return { label: "只读", tone: "blue" as const };
  return { label: "正常", tone: "green" as const };
}