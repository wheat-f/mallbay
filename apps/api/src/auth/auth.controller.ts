import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards
} from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { WechatLoginDto } from "./dto/wechat-login.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

type AuthRequest = Request & {
  user: {
    id: string;
    username: string;
    sessionId?: string;
  };
};

export const REFRESH_TOKEN_COOKIE_NAME = "mallbay_refresh_token";

const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get("public-key")
  publicKey() {
    return this.authService.getCredentialPublicKey();
  }

  @Post("register")
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.register(dto, getDeviceContext(req));
    this.setRefreshTokenCookie(res, session.refreshToken);
    return session;
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.login(dto, getDeviceContext(req));
    this.setRefreshTokenCookie(res, session.refreshToken);
    return session;
  }

  @Post("wechat-login")
  async wechatLogin(@Body() dto: WechatLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.authService.loginWithWechatCode(dto, getDeviceContext(req));
    this.setRefreshTokenCookie(res, session.refreshToken);
    return session;
  }

  @Post("refresh")
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = dto?.refreshToken ?? readCookie(req, REFRESH_TOKEN_COOKIE_NAME);
    if (!refreshToken) {
      throw new UnauthorizedException("无效的刷新令牌");
    }

    const session = await this.authService.refresh(refreshToken, getDeviceContext(req));
    this.setRefreshTokenCookie(res, session.refreshToken);
    return session;
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: AuthRequest) {
    return this.authService.me(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.logout(req.user.id, req.user.sessionId);
    res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, getRefreshTokenCookieOptions());
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get("sessions")
  sessions(@Req() req: AuthRequest) {
    return this.authService.listSessions(req.user.id, req.user.sessionId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("sessions/:id")
  revokeSession(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.authService.revokeSession(req.user.id, id);
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      ...getRefreshTokenCookieOptions(),
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE
    });
  }
}

function getDeviceContext(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const ipAddress = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.ip;
  return { userAgent: req.headers["user-agent"], ipAddress };
}

function getRefreshTokenCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: getRefreshTokenCookieSecure(),
    path: "/auth"
  };
}

export function getRefreshTokenCookieSecure() {
  const configured = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "production";
}

function readCookie(req: Request, name: string) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.trim().split("=");
    if (rawName !== name) {
      continue;
    }

    const value = rawValue.join("=");
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}
