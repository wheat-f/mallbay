import { Body, Controller, ForbiddenException, Get, Headers, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AccessContext } from "./domain/access-context";
import { PERMISSION_GOVERNANCE, type PermissionGovernance } from "./domain/permission-governance";
import { requireBindingCommandId } from "./require-binding-command-id";

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
  async disableRole(@Req() request: { user: { id: string } }, @Param("id") id: string, @Headers("x-request-id") commandId?: string) {
    await this.assertPolicyAdmin(request.user.id, "write");
    return this.governance.disableRole(id, request.user.id, requireBindingCommandId(commandId));
  }

  @Get("permissions/role-bindings")
  async getBindings(@Req() request: { user: { id: string } }, @Query("userId") userId?: string) {
    await this.assertPolicyAdmin(request.user.id);
    return this.governance.listBindings(userId);
  }

  @Post("permissions/role-bindings")
  bindRole() {
    throw new ForbiddenException({ code: "HQ_MEMBER_BINDING_DISABLED", message: "人员角色不能直接绑定；请由总部新增或更换店长，普通成员由店长邀请" });
  }

  @Post("users/:userId/role-bindings")
  bindUserRole() {
    throw new ForbiddenException({ code: "HQ_MEMBER_BINDING_DISABLED", message: "人员角色不能直接绑定；请由总部新增或更换店长，普通成员由店长邀请" });
  }

  @Patch("users/:userId/role-bindings/:bindingId")
  updateUserRoleBinding() {
    throw new ForbiddenException({ code: "HQ_MEMBER_BINDING_DISABLED", message: "人员角色不能直接修改；请通过门店治理或店长成员流程调整" });
  }
  @Post("permissions/role-bindings/:id/disable")
  disableBinding() {
    throw new ForbiddenException({ code: "HQ_MEMBER_BINDING_DISABLED", message: "人员角色不能直接停用；请通过门店治理或店长成员流程调整" });
  }

  @Get(["permissions/policy", "permission-policy-versions/current"])
  async getCurrentPolicy(@Req() request: { user: { id: string } }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.governance.currentPolicy();
  }

  @Get("permissions/policy/draft")
  async getCurrentDraft(@Req() request: { user: { id: string } }) {
    await this.assertPolicyAdmin(request.user.id);
    return this.governance.currentDraft();
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
  async publishPolicy(@Req() request: { user: { id: string } }, @Param("id") id: string, @Body() body: { expectedVersion?: number; expectedPublishedId?: string }) {
    await this.assertPolicyAdmin(request.user.id, "publish");
    return this.governance.publishPolicy(id, request.user.id, body.expectedVersion, body.expectedPublishedId);
  }

  @Post(["permissions/policy/:id/rollback", "permission-policy-versions/:id/rollback"])
  async rollbackPolicy(@Req() request: { user: { id: string } }, @Param("id") id: string) {
    await this.assertPolicyAdmin(request.user.id, "publish");
    return this.governance.rollbackPolicy(id, request.user.id);
  }
}
