export function canAccessSystemSettings(input: { position?: string | null; isAuditor?: boolean | null }) {
  return input.position === "MANAGER" || Boolean(input.isAuditor);
}
