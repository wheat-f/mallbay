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
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthCryptoService } from "./auth-crypto.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { WechatLoginDto } from "./dto/wechat-login.dto";
import { TokenPayload } from "./token-payload";
import { WechatMiniProgramService } from "./wechat-mini-program.service";
import { AccessContext } from "../permissions/domain/access-context";
type DeviceContext = { userAgent?: string; ipAddress?: string; sessionIdToReplace?: string };

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
    @Optional() @Inject(AuthCryptoService) private readonly authCrypto?: AuthCryptoService,
    @Optional() @Inject(WechatMiniProgramService) private readonly wechatMiniProgram?: WechatMiniProgramService,
    @Optional() @Inject(AccessContext) private readonly accessContext?: AccessContext
  ) {}

  async register(dto: RegisterDto, context: DeviceContext = {}) {
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

    return this.issueAndPersistTokens(user.id, context);
  }

  async login(dto: LoginDto, context: DeviceContext = {}) {
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

    if (user.isActive === false) {
      throw new UnauthorizedException("账号已停用，请联系管理员");
    }

    const policy = await this.getSecurityPolicy();
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException("账号已锁定，请稍后再试");
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      this.recordLoginFailure("invalid_password");
      await this.recordUserLoginFailure(user.id, policy.maxLoginFailures, policy.lockoutMinutes);
      throw new UnauthorizedException("账号或密码不正确");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginFailureCount: 0, lockedUntil: null }
    });

    return this.issueAndPersistTokens(user.id, context);
  }

  async loginWithWechatCode(dto: WechatLoginDto, context: DeviceContext = {}) {
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

    if (user.isActive === false) {
      throw new UnauthorizedException("账号已停用，请联系管理员");
    }

    return this.issueAndPersistTokens(user.id, context);
  }

  private async getSecurityPolicy() {
    const version = await this.prisma.settingsConfigVersion.findFirst({ where: { capabilityCode: "settings.security", scopeId: "global", status: "PUBLISHED", effectiveAt: { lte: new Date() } }, orderBy: { effectiveAt: "desc" } });
    const payload = version?.payload && typeof version.payload === "object" && !Array.isArray(version.payload) ? version.payload as Record<string, unknown> : {};
    return { sessionIdleMinutes: Number(payload.sessionIdleMinutes) || 30, maxLoginFailures: Number(payload.maxLoginFailures) || 5, lockoutMinutes: Number(payload.lockoutMinutes) || 15 };
  }

  private async recordUserLoginFailure(userId: string, threshold: number, lockoutMinutes: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { loginFailureCount: true, lockedUntil: true } });
    if (!user) return;
    const nextCount = user.loginFailureCount + 1;
    await this.prisma.user.update({ where: { id: userId }, data: nextCount >= threshold ? { loginFailureCount: 0, lockedUntil: new Date(Date.now() + lockoutMinutes * 60_000) } : { loginFailureCount: nextCount } });
    await this.prisma.auditEvent.create({ data: { action: nextCount >= threshold ? "auth.account.locked" : "auth.login.failed", actorId: userId, targetType: "User", targetId: userId, metadata: { reason: "invalid_password", failureCount: nextCount } } });
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

  async refresh(refreshToken: string, context: DeviceContext = {}) {
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

    if (!user) {
      throw new UnauthorizedException("无效的刷新令牌");
    }
    const deviceSession = (payload.sessionId ? await this.prisma.authSession.findUnique({ where: { id: payload.sessionId } }) : null);
    const isRefreshTokenValid = deviceSession
      ? Boolean(!deviceSession.revokedAt && deviceSession.userId === user.id && await bcrypt.compare(refreshToken, deviceSession.tokenHash))
      : user.refreshTokenHash ? await bcrypt.compare(refreshToken, user.refreshTokenHash) : false;
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException("无效的刷新令牌");
    }
    if (deviceSession) await this.prisma.authSession.update({ where: { id: deviceSession.id }, data: { lastSeenAt: new Date() } });
    const policy = await this.getSecurityPolicy();
    const issuedAt = (payload as TokenPayload & { iat?: number }).iat;
    if (issuedAt && Date.now() - issuedAt * 1000 > policy.sessionIdleMinutes * 60_000) {
      throw new UnauthorizedException("会话已因闲置超时，请重新登录");
    }

    return this.issueAndPersistTokens(user.id, { ...context, sessionIdToReplace: payload.sessionId });
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
    const isHeadquartersAdmin = await this.isEffectiveHeadquartersAdmin(user.id);
    return {
      ...this.toAuthUser(user, isHeadquartersAdmin),
      storeMember: member
        ? { position: member.position, store: member.store }
        : null
    };
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.prisma.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    } else {
      await this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: null } });
    }
    return { success: true };
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.authSession.findMany({ where: { userId, revokedAt: null }, orderBy: { lastSeenAt: "desc" } });
    return sessions.map((session) => ({ id: session.id, deviceName: session.deviceName, userAgent: session.userAgent, ipAddress: session.ipAddress ? `${session.ipAddress.slice(0, 3)}***` : null, lastSeenAt: session.lastSeenAt, createdAt: session.createdAt, current: session.id === currentSessionId }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, revokedAt: null } });
    if (!session) throw new UnauthorizedException("设备会话不存在或已撤销");
    await this.prisma.authSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  private async issueAndPersistTokens(userId: string, context: DeviceContext = {}) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        storeMembers: {
          include: { store: { select: { id: true, name: true, status: true } } }
        }
      }
    });
    const member = user.storeMembers?.[0] ?? null;

    const sessionId = context.sessionIdToReplace ?? randomUUID();
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      sessionId
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

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash } }),
      context.sessionIdToReplace
        ? this.prisma.authSession.update({ where: { id: sessionId }, data: { tokenHash: refreshTokenHash, lastSeenAt: new Date(), revokedAt: null, userAgent: context.userAgent, ipAddress: context.ipAddress } })
        : this.prisma.authSession.create({ data: { id: sessionId, userId: user.id, tokenHash: refreshTokenHash, deviceName: getDeviceName(context.userAgent), userAgent: context.userAgent, ipAddress: context.ipAddress } })
    ]);

    const isHeadquartersAdmin = await this.isEffectiveHeadquartersAdmin(user.id);
    return {
      user: {
        ...this.toAuthUser(user, isHeadquartersAdmin),
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
  }, effectiveIsAuditor = user.isAuditor) {
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      email: user.email,
      phone: user.phone,
      wechatOpenId: user.wechatOpenId,
      alipayUserId: user.alipayUserId,
      // Compatibility field derived from the active HQ_ADMIN/HQ binding.
      isAuditor: effectiveIsAuditor
    };
  }

  private async isEffectiveHeadquartersAdmin(userId: string) {
    if (!this.accessContext) return false;
    const scope = await this.accessContext.scope({ userId }, "permissions.policy", "publish");
    return scope.allowed && scope.global;
  }
}

function getDeviceName(userAgent?: string) {
  if (!userAgent) return "未知设备";
  if (/mobile|android|iphone|ipad/i.test(userAgent)) return "移动设备";
  if (/windows/i.test(userAgent)) return "Windows 浏览器";
  if (/macintosh|mac os/i.test(userAgent)) return "Mac 浏览器";
  return "浏览器设备";
}
