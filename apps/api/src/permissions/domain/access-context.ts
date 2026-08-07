import { Injectable } from "@nestjs/common";
import { PermissionsService } from "../permissions.service";

type PermissionContext = Parameters<PermissionsService["getForUser"]>[1];

/** Single seam for current identity capability and scope decisions. */
@Injectable()
export class AccessContext {
  constructor(private readonly implementation: PermissionsService) {}

  resolve(userId: string, context: PermissionContext = {}) {
    return this.implementation.getForUser(userId, context);
  }

  can(userId: string, capability: string, action: string, context: PermissionContext = {}) {
    return this.implementation.authorize(userId, capability, action, context);
  }

  scope(userId: string, capability: string, action: string, context: PermissionContext = {}) {
    return this.implementation.buildScopeFilter(userId, capability, action, context);
  }
}
