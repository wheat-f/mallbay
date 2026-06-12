import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { BindEmailDto } from "./dto/bind-email.dto";
import { BindPhoneDto } from "./dto/bind-phone.dto";
import { BindWechatDto } from "./dto/bind-wechat.dto";
import { BindAlipayDto } from "./dto/bind-alipay.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { AuthService } from "../auth/auth.service";

// 管理员重置密码后的初始密码
const RESET_PASSWORD_DEFAULT = "Test1234!";

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

  async bindWechat(userId: string, dto: BindWechatDto) {
    const conflict = await this.prisma.user.findFirst({
      where: { wechatOpenId: dto.openId, NOT: { id: userId } }
    });
    if (conflict) {
      throw new ConflictException("该微信已被其他账号绑定");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { wechatOpenId: dto.openId }
    });

    return this.authService.toAuthUser(user);
  }

  async bindAlipay(userId: string, dto: BindAlipayDto) {
    const conflict = await this.prisma.user.findFirst({
      where: { alipayUserId: dto.userId, NOT: { id: userId } }
    });
    if (conflict) {
      throw new ConflictException("该支付宝已被其他账号绑定");
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { alipayUserId: dto.userId }
    });

    return this.authService.toAuthUser(user);
  }

  // 管理员搜索用户（按用户名模糊匹配）
  async searchUsers(currentUserId: string, isAuditor: boolean, keyword: string) {
    if (!isAuditor) {
      throw new ForbiddenException("无权限");
    }

    return this.prisma.user.findMany({
      where: {
        username: { contains: keyword, mode: "insensitive" }
      },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarUrl: true,
        isAuditor: true
      },
      take: 20
    });
  }

  // 管理员重置用户密码为初始密码
  async resetPassword(isAuditor: boolean, dto: ResetPasswordDto) {
    if (!isAuditor) {
      throw new ForbiddenException("无权限");
    }

    const user = await this.prisma.user.findUnique({
      where: { username: dto.username }
    });

    if (!user) {
      throw new NotFoundException("用户不存在");
    }

    const passwordHash = await bcrypt.hash(RESET_PASSWORD_DEFAULT, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, refreshTokenHash: null }
    });

    return { success: true, defaultPassword: RESET_PASSWORD_DEFAULT };
  }
}
