import { Injectable } from "@nestjs/common";
import { StructuredLoggerService } from "./structured-logger.service";

export type AuditEvent = {
  action: string;
  actorId?: string;
  targetType: string;
  targetId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly logger: StructuredLoggerService) {}

  record(event: AuditEvent) {
    this.logger.info(`audit.${event.action}`, {
      actorId: event.actorId,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: event.metadata ?? {}
    });
  }
}
