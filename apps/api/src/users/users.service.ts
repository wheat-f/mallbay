import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { BindEmailDto } from "./dto/bind-email.dto";
import { BindPhoneDto } from "./dto/bind-phone.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { AuthService } from "../auth/auth.service";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.nickname !== undefined ? { nickname: dto.nickname } : {})
      }
    });

    return this.authService.toAuthUser(user);
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl }
    });

    return this.authService.toAuthUser(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const isOldPasswordValid = await bcrypt.compare(dto.oldPassword, user.passwordHash);
    if (!isOldPasswordValid) {
      throw new UnauthorizedException("旧密码不正确");
    }

    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException("新密码不能与旧密码相同");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    return { success: true };
  }

  async bindEmail(userId: string, dto: BindEmailDto) {
    const conflict = await this.prisma.user.findFirst({
      where: { email: dto.email, NOT: { id: userId } }
    });
    if (conflict) {
      throw new ConflictException("该邮箱已被其他账号绑定");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { email: dto.email }
    });

    return this.authService.toAuthUser(user);
  }

  async bindPhone(userId: string, dto: BindPhoneDto) {
    const conflict = await this.prisma.user.findFirst({
      where: { phone: dto.phone, NOT: { id: userId } }
    });
    if (conflict) {
      throw new ConflictException("该手机号已被其他账号绑定");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { phone: dto.phone }
    });

    return this.authService.toAuthUser(user);
  }
}
