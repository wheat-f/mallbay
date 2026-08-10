import { ForbiddenException, Injectable } from "@nestjs/common";
import { PermissionsService } from "../permissions.service";

export type AccessActor = string | { userId: string };
export type AccessContextInput = {
  storeId?: string;
  ownerId?: string;
};
export type AccessResolution = {
  userId: string;
  policyVersion: number;
  bindingVersion: number;
  roles: Array<{
    roleCode: string;
    roleName: string;
    scopeType: string;
    scopeIds: string[];
  }>;
  permissions: Array<{
    code: string;
    actions: string[];
    scopes: string[];
    bindingScopes?: Array<{ scopeType: string; scopeIds: string[] }>;
  }>;
  generatedAt: string;
};
export type AccessScope = {
  allowed: boolean;
  scopes: string[];
  where: Record<string, string>;
};
export type AccessDecision = {
  allowed: true;
  userId: string;
  capability: string;
  action: string;
  context: AccessContextInput;
};

/** Single seam for current identity capability and scope decisions. */
@Injectable()
export class AccessContext {
  constructor(private readonly implementation: PermissionsService) {}

  resolve(actor: AccessActor, context: AccessContextInput = {}): Promise<AccessResolution> {
    return this.implementation.getForUser(resolveActorId(actor), context) as Promise<AccessResolution>;
  }

  can(actor: AccessActor, capability: string, action: string, context: AccessContextInput = {}) {
    return this.implementation.authorize(resolveActorId(actor), capability, action, context);
  }

  scope(actor: AccessActor, capability: string, action: string, context: AccessContextInput = {}): Promise<AccessScope> {
    return this.implementation.buildScopeFilter(resolveActorId(actor), capability, action, context) as Promise<AccessScope>;
  }

  async require(actor: AccessActor, capability: string, action: string, context: AccessContextInput = {}): Promise<AccessDecision> {
    const userId = resolveActorId(actor);
    const allowed = await this.can(userId, capability, action, context);
    if (!allowed) {
      throw new ForbiddenException({ code: "ACCESS_DENIED", message: "无权限" });
    }
    return { allowed: true, userId, capability, action, context };
  }
}

function resolveActorId(actor: AccessActor) {
  return typeof actor === "string" ? actor : actor.userId;
}
