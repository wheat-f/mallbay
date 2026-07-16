import { Prisma } from "@prisma/client";
import type { AuditEvent } from "./audit-log.service";

type AuditEventWriter = {
  auditEvent?: {
    create(args: { data: Prisma.AuditEventUncheckedCreateInput }): Promise<unknown>;
  };
};

/** Persist a business audit event when the backing Prisma client is available.
 *
 * A number of unit tests intentionally use narrow Prisma fakes, so the writer
 * is optional. Production Prisma clients always expose the AuditEvent model.
 */
export async function persistAuditEvent(prisma: AuditEventWriter, event: AuditEvent) {
  if (!prisma.auditEvent) return;
  const storeId = typeof event.metadata?.storeId === "string" ? event.metadata.storeId : undefined;
  await prisma.auditEvent.create({
    data: {
      action: event.action,
      actorId: event.actorId,
      storeId,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: removeUndefined(event.metadata ?? {}) as Prisma.InputJsonObject
    }
  });
}

function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => removeUndefined(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, removeUndefined(item)]));
  }
  return value;
}
