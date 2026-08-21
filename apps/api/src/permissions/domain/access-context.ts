import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { PermissionsService } from "../permissions.service";

export type AccessSubject = { userId: string };
/** @deprecated Migrate callers to AccessSubject; kept only for the staged caller migration. */
export type AccessActor = AccessSubject | string;
export type AccessContextInput = {
  storeId?: string;
  ownerId?: string;
};
export type AccessDenialReason =
  | "ACCESS_DENIED"
  | "STORE_OUT_OF_SCOPE"
  | "OWNER_OUT_OF_SCOPE"
  | "SCOPE_UNRESOLVED";
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
export type AccessScopeFacts = {
  allowed: boolean;
  global: boolean;
  storeIds: string[];
  ownerId?: string;
  reason?: AccessDenialReason;
};
export type AccessScope = AccessScopeFacts;
export type AccessDecision = {
  allowed: true;
  userId: string;
  capability: string;
  action: string;
  context: AccessContextInput;
  scope: AccessScopeFacts;
};

/** Single seam for current identity capability and scope decisions. */
@Injectable()
export class AccessContext {
  constructor(@Inject(PermissionsService) private readonly implementation: PermissionsService) {}

  resolve(actor: AccessActor, context: AccessContextInput = {}): Promise<AccessResolution> {
    return this.implementation.getForUser(resolveActorId(actor), context) as Promise<AccessResolution>;
  }

  can(actor: AccessActor, capability: string, action: string, context: AccessContextInput = {}) {
    return this.implementation.authorize(resolveActorId(actor), capability, action, context);
  }

  scope(actor: AccessActor, capability: string, action: string, context: AccessContextInput = {}): Promise<AccessScopeFacts> {
    return this.implementation.buildScopeFacts(resolveActorId(actor), capability, action, context);
  }

  async require(actor: AccessActor, capability: string, action: string, context: AccessContextInput = {}): Promise<AccessDecision> {
    const userId = resolveActorId(actor);
    const scope = await this.scope({ userId }, capability, action, context);
    if (!scope.allowed) {
      throw new ForbiddenException({ code: scope.reason ?? "ACCESS_DENIED", message: "无权限" });
    }
    return { allowed: true, userId, capability, action, context, scope };
  }
}

function resolveActorId(actor: AccessActor) {
  return typeof actor === "string" ? actor : actor.userId;
}
