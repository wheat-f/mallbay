import {
  BadRequestException,
  Body,
  Controller,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BindEmailDto } from "./dto/bind-email.dto";
import { BindPhoneDto } from "./dto/bind-phone.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import type { MulterFile } from "./multer-file.type";
import { UsersService } from "./users.service";

type AuthRequest = Request & {
  user: { id: string; username: string };
};

// 头像最大 2 MB
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

@UseGuards(JwtAuthGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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

    const { OssService } = await import("./oss.service");
    const ossService = new OssService();
    const url = await ossService.uploadAvatar(req.user.id, file);

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
}
