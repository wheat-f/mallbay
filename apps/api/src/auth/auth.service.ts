import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
  UnauthorizedException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthCryptoService } from "./auth-crypto.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { WechatLoginDto } from "./dto/wechat-login.dto";
import { TokenPayload } from "./token-payload";
import { WechatMiniProgramService } from "./wechat-mini-program.service";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
    @Optional() @Inject(AuthCryptoService) private readonly authCrypto?: AuthCryptoService,
    @Optional() @Inject(WechatMiniProgramService) private readonly wechatMiniProgram?: WechatMiniProgramService
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username }
    });

    if (existing) {
      throw new ConflictException("账号已被注册");
    }

    const password = this.resolvePassword(dto);
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash
      }
    });

    return this.issueAndPersistTokens(user.id);
  }

  async login(dto: LoginDto) {
    const identifier = dto.identifier.trim();
    const password = this.resolvePassword(dto);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier },
          { phone: identifier }
        ]
      }
    });

    if (!user) {
      this.recordLoginFailure("not_found");
      throw new UnauthorizedException("账号或密码不正确");
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.recordLoginFailure("invalid_password");
      throw new UnauthorizedException("账号或密码不正确");
    }

    return this.issueAndPersistTokens(user.id);
  }

  async loginWithWechatCode(dto: WechatLoginDto) {
    if (!this.wechatMiniProgram) {
      throw new InternalServerErrorException("微信小程序登录服务未配置");
    }

    const openId = await this.wechatMiniProgram.resolveOpenId(dto.code);
    const user = await this.prisma.user.findUnique({
      where: { wechatOpenId: openId }
    });

    if (!user) {
      throw new UnauthorizedException("微信未绑定账号");
    }

    return this.issueAndPersistTokens(user.id);
  }

  private recordLoginFailure(reason: string) {
    this.metrics?.increment("auth_login_failures_total", { reason });
  }

  getCredentialPublicKey() {
    return this.authCrypto?.getPublicKey();
  }

  private resolvePassword(dto: { password?: string; encryptedPassword?: string }) {
    if (dto.encryptedPassword) {
      if (!this.authCrypto) {
        throw new InternalServerErrorException("登录凭据解密服务未配置");
      }
      return this.authCrypto.decryptPassword(dto.encryptedPassword);
    }

    if (dto.password) {
      if (this.credentialEncryptionEnabled) {
        throw new BadRequestException("当前环境要求加密登录凭据");
      }
      return dto.password;
    }

    throw new UnauthorizedException("账号或密码不正确");
  }

  private get credentialEncryptionEnabled() {
    const value = this.config.get<string>("AUTH_CREDENTIAL_ENCRYPTION_ENABLED");
    return !["false", "0", "off", "disabled"].includes((value ?? "").trim().toLowerCase());
  }

  async refresh(refreshToken: string) {
    let payload: TokenPayload;

    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(refreshToken, {
        secret: this.refreshSecret
      });
    } catch {
      throw new UnauthorizedException("无效的刷新令牌");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException("无效的刷新令牌");
    }

    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException("无效的刷新令牌");
    }

    return this.issueAndPersistTokens(user.id);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        storeMembers: {
          include: { store: { select: { id: true, name: true, status: true } } }
        }
      }
    });

    const member = user.storeMembers[0] ?? null;
    return {
      ...this.toAuthUser(user),
      storeMember: member
        ? { position: member.position, store: member.store }
        : null
    };
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null }
    });

    return { success: true };
  }

  private async issueAndPersistTokens(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        storeMembers: {
          include: { store: { select: { id: true, name: true, status: true } } }
        }
      }
    });
    const member = user.storeMembers?.[0] ?? null;

    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      isAuditor: user.isAuditor
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.accessSecret,
        expiresIn: this.config.get<JwtSignOptions["expiresIn"]>("JWT_ACCESS_EXPIRES_IN") ?? "15m"
      }),
      this.jwt.signAsync(
        { ...payload, jti: randomUUID() },
        {
          secret: this.refreshSecret,
          expiresIn: this.config.get<JwtSignOptions["expiresIn"]>("JWT_REFRESH_EXPIRES_IN") ?? "7d"
        }
      )
    ]);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: await bcrypt.hash(refreshToken, 12)
      }
    });

    return {
      user: {
        ...this.toAuthUser(user),
        storeMember: member
          ? { position: member.position, store: member.store }
          : null
      },
      accessToken,
      refreshToken
    };
  }

  private get accessSecret() {
    return this.getRequiredConfig("JWT_ACCESS_SECRET");
  }

  private get refreshSecret() {
    return this.getRequiredConfig("JWT_REFRESH_SECRET");
  }

  private getRequiredConfig(key: string) {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new InternalServerErrorException(`${key} 未配置`);
    }
    return value;
  }

  toAuthUser(user: {
    id: string;
    username: string;
    nickname: string | null;
    avatarUrl: string | null;
    email: string | null;
    phone: string | null;
    wechatOpenId: string | null;
    alipayUserId: string | null;
    isAuditor: boolean;
  }) {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      email: user.email,
      phone: user.phone,
      wechatOpenId: user.wechatOpenId,
      alipayUserId: user.alipayUserId,
      isAuditor: user.isAuditor
    };
  }
}
