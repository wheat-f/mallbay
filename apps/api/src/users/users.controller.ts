import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MetricsService } from "../observability/metrics.service";
import { BindEmailDto } from "./dto/bind-email.dto";
import { BindPhoneDto } from "./dto/bind-phone.dto";
import { BindWechatDto } from "./dto/bind-wechat.dto";
import { BindAlipayDto } from "./dto/bind-alipay.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import type { MulterFile } from "./multer-file.type";
import { OssService } from "./oss.service";
import { UsersService } from "./users.service";

type AuthRequest = Request & {
  user: { id: string; username: string; isAuditor: boolean };
};

// 头像最大 2 MB
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly ossService: OssService,
    private readonly metrics: MetricsService
  ) {}

  @Patch("profile")
  updateProfile(@Req() req: AuthRequest, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  @Post("avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: AVATAR_MAX_BYTES },
      fileFilter(_req, file, cb) {
        if (!file.mimetype.startsWith("image/")) {
          return cb(new BadRequestException("只允许上传图片"), false);
        }
        cb(null, true);
      }
    })
  )
  async uploadAvatar(@Req() req: AuthRequest, @UploadedFile() file: MulterFile) {
    if (!file) {
      throw new BadRequestException("请上传图片文件");
    }

    let url: string;
    try {
      url = await this.ossService.uploadAvatar(req.user.id, file);
    } catch (error) {
      this.metrics.increment("upload_failures_total", { target: "avatar" });
      throw error;
    }

    return this.usersService.updateAvatar(req.user.id, url);
  }

  @Patch("password")
  changePassword(@Req() req: AuthRequest, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(req.user.id, dto);
  }

  @Post("bind/email")
  bindEmail(@Req() req: AuthRequest, @Body() dto: BindEmailDto) {
    return this.usersService.bindEmail(req.user.id, dto);
  }

  @Post("bind/phone")
  bindPhone(@Req() req: AuthRequest, @Body() dto: BindPhoneDto) {
    return this.usersService.bindPhone(req.user.id, dto);
  }

  @Post("bind/wechat")
  bindWechat(@Req() req: AuthRequest, @Body() dto: BindWechatDto) {
    return this.usersService.bindWechat(req.user.id, dto);
  }

  @Post("bind/alipay")
  bindAlipay(@Req() req: AuthRequest, @Body() dto: BindAlipayDto) {
    return this.usersService.bindAlipay(req.user.id, dto);
  }

  // 管理员专用：搜索用户
  @Get("search")
  searchUsers(@Req() req: AuthRequest, @Query("q") keyword: string) {
    return this.usersService.searchUsers(req.user.id, req.user.isAuditor, keyword ?? "");
  }

  // 管理员专用：重置用户密码
  @Post("reset-password")
  resetPassword(@Req() req: AuthRequest, @Body() dto: ResetPasswordDto) {
    return this.usersService.resetPassword(req.user.isAuditor, dto);
  }
}
