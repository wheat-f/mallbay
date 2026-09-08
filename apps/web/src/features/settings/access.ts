export function canAccessSystemSettings(input: {
  permissions?: Array<{ code: string; actions: string[]; scopes?: string[] }>;
}) {
  const globalCodes = new Set(["permissions.policy", "settings.dictionary", "settings.security", "customer.tags", "settings.audit.global"]);
  const storeCodes = new Set(["store.dictionary", "store.members", "store.profile", "store.operations", "store.notifications", "store.capacity", "finance.labor_cost", "finance.settlement", "finance.accounts", "finance.audit"]);
  return Boolean(input.permissions?.some((permission) => permission.actions.includes("read")
    && (storeCodes.has(permission.code) || (globalCodes.has(permission.code) && permission.scopes?.includes("GLOBAL")))));
}
