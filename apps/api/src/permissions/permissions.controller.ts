import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PermissionScopeType, Prisma } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AccessContext } from "./domain/access-context";
import { PERMISSION_GOVERNANCE, type PermissionGovernance } from "./domain/permission-governance";

@Controller()
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(
    @Inject(PERMISSION_GOVERNANCE) private readonly governance: PermissionGovernance,
    @Inject(AccessContext) private readonly accessContext: AccessContext
  ) {}

  private async assertPolicyAdmin(userId: string, action: "read" | "write" | "publish" = "read") {
    const scope = await this.accessContext.scope({ userId }, "permissions.policy", action);
    if (!scope.allowed || !scope.global) throw new ForbiddenException("只有总部管理员可以维护权限模型");
  }

  @Get("auth/me/permissions")
  getMine(@Req() request: { user: { id: string } }, @Query("storeId") storeId?: string) {
    return this.accessContext.resolve(request.user.id, { storeId });
  }

  @Get(["permissions/catalog", "permissions/definitions"])
  async getCatalog(@Req() request: { user: { id: string } }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.governance.listCatalog();
  }

  @Get(["permissions/roles", "roles"])
  async getRoles(@Req() request: { user: { id: string } }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.governance.listRoles();
  }

  @Post(["permissions/roles", "roles"])
  async createRole(@Req() request: { user: { id: string } }, @Body() body: { code: string; name: string; description?: string }) {
    await this.assertPolicyAdmin(request.user.id, "write");
    return this.governance.createRole({ ...body, createdById: request.user.id });
  }

  @Get("users/:userId/role-bindings")
  async getUserBindings(@Req() request: { user: { id: string } }, @Param("userId") userId: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.governance.listBindings(userId);
  }

  @Post(["permissions/roles/:id/disable", "roles/:id/disable"])
  async disableRole(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id, "write");
    return this.governance.disableRole(id, request.user.id);
  }

  @Get("permissions/role-bindings")
  async getBindings(@Req() request: { user: { id: string } }, @Query("userId") userId?: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.governance.listBindings(userId);
  }

  @Post("permissions/role-bindings")
  async bindRole(@Req() request: { user: { id: string } }, @Body() body: { userId: string; roleId: string; scopeType: PermissionScopeType; storeId?: string }) {
    await this.assertPolicyAdmin(request.user.id, "write");
    await this.governance.assertRoleBindingWriteAllowed(request.user.id, body.userId, body.scopeType);
    return this.governance.bindRole({ ...body, createdById: request.user.id });
  }

  @Post("users/:userId/role-bindings")
  async bindUserRole(@Req() request: { user: { id: string } }, @Param("userId") userId: string, @Body() body: { roleId: string; scopeType: PermissionScopeType; storeId?: string }) {
    await this.assertPolicyAdmin(request.user.id, "write");
    await this.governance.assertRoleBindingWriteAllowed(request.user.id, userId, body.scopeType);
    return this.governance.bindRole({ ...body, userId, createdById: request.user.id });
  }

  @Patch("users/:userId/role-bindings/:bindingId")
  async updateUserRoleBinding(@Req() request: { user: { id: string } }, @Param("userId") userId: string, @Param("bindingId") bindingId: string, @Body() body: { status?: "ACTIVE" | "DISABLED" }) {
    await this.assertPolicyAdmin(request.user.id, "write");
    if (body.status !== "DISABLED") throw new ForbiddenException("角色绑定仅支持即时停用");
    await this.governance.assertExistingRoleBindingWriteAllowed(request.user.id, bindingId);
    return this.governance.disableBinding(bindingId, request.user.id);
  }
  @Post("permissions/role-bindings/:id/disable")
  async disableBinding(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id, "write");
    await this.governance.assertExistingRoleBindingWriteAllowed(request.user.id, id);
    return this.governance.disableBinding(id, request.user.id);
  }

  @Get(["permissions/policy", "permission-policy-versions/current"])
  async getCurrentPolicy(@Req() request: { user: { id: string } }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.governance.currentPolicy();
  }

  @Post(["permissions/policy/drafts", "permission-policy-versions"])
  async createDraft(@Req() request: { user: { id: string } }, @Body() body: { payload: Prisma.InputJsonValue; expectedVersion?: number }) {
    await this.assertPolicyAdmin(request.user.id, "write");
    return this.governance.createDraft({ ...body, actorId: request.user.id });
  }

  @Post(["permissions/policy/:id/validate", "permission-policy-versions/:id/validate"])
  async validatePolicy(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id, "write");
    return this.governance.validatePolicy(id, request.user.id);
  }

  @Get(["permissions/policy/:id/impact", "permission-policy-versions/:id/impact"])
  async policyImpact(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.governance.policyImpact(id);
  }

  @Post(["permissions/policy/:id/publish", "permission-policy-versions/:id/publish"])
  async publishPolicy(@Req() request: { user: { id: string } }, @Param("id") id: string, @Body() body: { expectedVersion?: number }) {
    await this.assertPolicyAdmin(request.user.id, "publish");
    return this.governance.publishPolicy(id, request.user.id, body.expectedVersion);
  }

  @Post(["permissions/policy/:id/rollback", "permission-policy-versions/:id/rollback"])
  async rollbackPolicy(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id, "publish");
    return this.governance.rollbackPolicy(id, request.user.id);
  }
}
