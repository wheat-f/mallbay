export function canAccessSystemSettings(input: {
  position?: string | null;
  isHeadquartersAdmin?: boolean | null;
  permissions?: Array<{ code: string; actions: string[] }>;
}) {
  const hasReadPermission = input.permissions?.some((permission) => permission.code === "settings" && permission.actions.includes("read"));
  if (hasReadPermission === false) return false;
  return Boolean(input.position === "MANAGER" || input.isHeadquartersAdmin);
}
