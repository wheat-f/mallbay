type AuditActorInput = {
  actorId?: string | null;
  actor?: {
    username?: string | null;
    nickname?: string | null;
  } | null;
};

export function getAuditActorLabel(event?: AuditActorInput | null) {
  if (!event) return "-";
  const name = event.actor?.nickname ?? event.actor?.username;
  if (name) return name;
  if (event.actorId) return "未知用户";
  return "-";
}
