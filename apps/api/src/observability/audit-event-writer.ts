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

  /**
   * Persist the business audit fact through the caller's transaction.  The
   * process log is deliberately best-effort: a broken log sink must never
   * abort the business transaction (or turn a committed command into an
   * apparent failure).  The persisted AuditEvent remains the committed fact;
   * callers can use processLogAccepted for observability metrics.
   */
  async writeTransactional(prisma: Parameters<typeof persistAuditEvent>[0], event: AuditEvent) {
    await persistAuditEvent(prisma, event);
    try {
      this.implementation.record(event);
      return { accepted: true, event, processLogAccepted: true };
    } catch {
      return { accepted: true, event, processLogAccepted: false };
    }
  }
}
