import { Injectable } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";

/** Shared notification dispatch seam; channel and retry details stay internal. */
@Injectable()
export class NotificationDispatcher {
  constructor(private readonly implementation: NotificationsService) {}

  dispatch(input: { userId: string; type: Parameters<NotificationsService["send"]>[1]; payload: object; dedupeKey?: string }) {
    return this.implementation.send(input.userId, input.type, input.payload, input.dedupeKey);
  }
}
