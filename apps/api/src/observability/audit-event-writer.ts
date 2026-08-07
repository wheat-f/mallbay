import { Injectable } from "@nestjs/common";
import { AuditLogService, type AuditEvent } from "./audit-log.service";
import { persistAuditEvent } from "./persist-audit-event";

/** Shared audit writing seam. Persistence adapters remain internal to callers. */
@Injectable()
export class AuditEventWriter {
  constructor(private readonly implementation: AuditLogService) {}

  write(event: AuditEvent) {
    this.implementation.record(event);
    return { accepted: true, event };
  }

  /** Persist first, then emit the process log, so a failed transaction is not reported as committed. */
  async writeTransactional(prisma: Parameters<typeof persistAuditEvent>[0], event: AuditEvent) {
    await persistAuditEvent(prisma, event);
    this.implementation.record(event);
    return { accepted: true, event };
  }
}
