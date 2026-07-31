import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { PermissionScopeType, Prisma } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsService } from "./permissions.service";

@Controller()
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  private async assertPolicyAdmin(userId: string) {
    const result = await this.permissions.getForUser(userId);
    const allowed = result.permissions.some((permission) => permission.code === "settings" && permission.actions.includes("write") && permission.scopes.includes("GLOBAL"));
    if (!allowed) throw new ForbiddenException("只有总部管理员可以维护权限模型");
  }

  @Get("auth/me/permissions")
  getMine(@Req() request: { user: { id: string } }, @Query("storeId") storeId?: string) {
    return this.permissions.getForUser(request.user.id, { storeId });
  }

  @Get(["permissions/catalog", "permissions/definitions"])
  getCatalog() {
    return this.permissions.listCatalog();
  }

  @Get(["permissions/roles", "roles"])
  getRoles() {
    return this.permissions.listRoles();
  }

  @Post(["permissions/roles", "roles"])
  async createRole(@Req() request: { user: { id: string } }, @Body() body: { code: string; name: string; description?: string; grants?: Array<{ permissionCode: string; action: string; scope: string }> }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.createRole({ ...body, createdById: request.user.id });
  }

  @Get("users/:userId/role-bindings")
  async getUserBindings(@Req() request: { user: { id: string } }, @Param("userId") userId: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.listBindings(userId);
  }

  @Post(["permissions/roles/:id/disable", "roles/:id/disable"])
  async disableRole(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.disableRole(id, request.user.id);
  }

  @Get("permissions/role-bindings")
  async getBindings(@Req() request: { user: { id: string } }, @Query("userId") userId?: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.listBindings(userId);
  }

  @Post("permissions/role-bindings")
  async bindRole(@Req() request: { user: { id: string } }, @Body() body: { userId: string; roleId: string; scopeType: PermissionScopeType; storeId?: string }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.bindRole({ ...body, createdById: request.user.id });
  }

  @Post("users/:userId/role-bindings")
  async bindUserRole(@Req() request: { user: { id: string } }, @Param("userId") userId: string, @Body() body: { roleId: string; scopeType: PermissionScopeType; storeId?: string }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.bindRole({ ...body, userId, createdById: request.user.id });
  }

  @Patch("users/:userId/role-bindings/:bindingId")
  async updateUserRoleBinding(@Req() request: { user: { id: string } }, @Param("bindingId") bindingId: string, @Body() body: { status?: "ACTIVE" | "DISABLED" }) {
    await this.assertPolicyAdmin(request.user.id);
    if (body.status !== "DISABLED") throw new ForbiddenException("角色绑定仅支持即时停用");
    return this.permissions.disableBinding(bindingId, request.user.id);
  }
  @Post("permissions/role-bindings/:id/disable")
  async disableBinding(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.disableBinding(id, request.user.id);
  }

  @Get(["permissions/policy", "permission-policy-versions/current"])
  getCurrentPolicy() {
    return this.permissions.currentPolicy();
  }

  @Post(["permissions/policy/drafts", "permission-policy-versions"])
  async createDraft(@Req() request: { user: { id: string } }, @Body() body: { payload: Prisma.InputJsonValue; expectedVersion?: number }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.createDraft({ ...body, actorId: request.user.id });
  }

  @Post(["permissions/policy/:id/validate", "permission-policy-versions/:id/validate"])
  async validatePolicy(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.validatePolicy(id, request.user.id);
  }

  @Get(["permissions/policy/:id/impact", "permission-policy-versions/:id/impact"])
  async policyImpact(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.policyImpact(id);
  }

  @Post(["permissions/policy/:id/publish", "permission-policy-versions/:id/publish"])
  async publishPolicy(@Req() request: { user: { id: string } }, @Param("id") id: string, @Body() body: { expectedVersion?: number }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.publishPolicy(id, request.user.id, body.expectedVersion);
  }

  @Post(["permissions/policy/:id/rollback", "permission-policy-versions/:id/rollback"])
  async rollbackPolicy(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.permissions.rollbackPolicy(id, request.user.id);
  }
}
