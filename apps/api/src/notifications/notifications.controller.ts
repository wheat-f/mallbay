import { Body, Controller, Get, Inject, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { IsArray, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

class MarkReadDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

type AuthRequest = Request & { user: { id: string } };

@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notificationsService: NotificationsService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    return this.notificationsService.list(
      req.user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20
    );
  }

@Get("todos")
  todos(
    @Req() req: AuthRequest,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    return this.notificationsService.listTodos(
      req.user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20
    );
  }
  @Get("unread-count")
  unreadCount(@Req() req: AuthRequest) {
    return this.notificationsService.unreadCount(req.user.id);
  }

  @Patch("read")
  markRead(@Req() req: AuthRequest, @Body() dto: MarkReadDto) {
    return this.notificationsService.markRead(req.user.id, dto.ids);
  }

  @Patch("read-all")
  markAllRead(@Req() req: AuthRequest) {
    return this.notificationsService.markAllRead(req.user.id);
  }
}
