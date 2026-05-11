import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { TokenPayload } from "./token-payload";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() }
    });

    if (existing) {
      throw new ConflictException("Email is already registered");
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash
      }
    });

    return this.issueAndPersistTokens(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.issueAndPersistTokens(user.id);
  }

  async refresh(refreshToken: string) {
    let payload: TokenPayload;

    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(refreshToken, {
        secret: this.refreshSecret
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user?.refreshTokenHash) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isRefreshTokenValid) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    return this.issueAndPersistTokens(user.id);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId }
    });

    return this.toAuthUser(user);
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
      where: { id: userId }
    });

    const payload: TokenPayload = {
      sub: user.id,
      email: user.email
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.accessSecret,
        expiresIn: this.config.get<JwtSignOptions["expiresIn"]>("JWT_ACCESS_EXPIRES_IN") ?? "15m"
      }),
      this.jwt.signAsync(payload, {
        secret: this.refreshSecret,
        expiresIn: this.config.get<JwtSignOptions["expiresIn"]>("JWT_REFRESH_EXPIRES_IN") ?? "7d"
      })
    ]);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: await bcrypt.hash(refreshToken, 12)
      }
    });

    return {
      user: this.toAuthUser(user),
      accessToken,
      refreshToken
    };
  }

  private get accessSecret() {
    return this.config.get<string>("JWT_ACCESS_SECRET") ?? "mallbay-dev-access-secret";
  }

  private get refreshSecret() {
    return this.config.get<string>("JWT_REFRESH_SECRET") ?? "mallbay-dev-refresh-secret";
  }

  private toAuthUser(user: { id: string; email: string; name: string; role: "CUSTOMER" | "STAFF" }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };
  }
}
