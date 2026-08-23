import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { InviteMemberDto } from "./dto/invite-member.dto";
import { MEMBER_INVITATION_WORKFLOW, type MemberInvitationWorkflow } from "./domain/member-invitation-workflow";

type AuthRequest = Request & { user: { id: string } };

@UseGuards(JwtAuthGuard)
@Controller()
export class MembersController {
  constructor(@Inject(MEMBER_INVITATION_WORKFLOW) private readonly membersService: MemberInvitationWorkflow) {}

  // 店长：搜索可邀请的用户
  @Get("stores/:storeId/members/search")
  searchUsers(
    @Req() req: AuthRequest,
    @Param("storeId") storeId: string,
    @Query("q") keyword: string
  ) {
    return this.membersService.searchInvitableUsers(req.user.id, storeId, keyword ?? "");
  }

  // 店长：邀请成员
  @Post("stores/:storeId/members/invite")
  invite(
    @Req() req: AuthRequest,
    @Param("storeId") storeId: string,
    @Body() dto: InviteMemberDto
  ) {
    return this.membersService.inviteMember(req.user.id, storeId, dto);
  }

  // 店长：开除成员
  @Delete("stores/:storeId/members/:userId")
  remove(
    @Req() req: AuthRequest,
    @Param("storeId") storeId: string,
    @Param("userId") userId: string
  ) {
    return this.membersService.removeMember(req.user.id, storeId, userId);
  }

  // 用户：查看收到的邀请
  @Get("invitations")
  myInvitations(@Req() req: AuthRequest) {
    return this.membersService.myInvitations(req.user.id);
  }

  // 用户：接受邀请
  @Post("invitations/:id/accept")
  accept(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.membersService.acceptInvitation(req.user.id, id);
  }

  // 用户：拒绝邀请
  @Post("invitations/:id/reject")
  reject(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.membersService.rejectInvitation(req.user.id, id);
  }
}
