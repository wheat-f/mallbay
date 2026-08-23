import { Inject, Injectable } from "@nestjs/common";
import { AuthService } from "../auth.service";
import { LoginDto } from "../dto/login.dto";
import { RegisterDto } from "../dto/register.dto";
import { WechatLoginDto } from "../dto/wechat-login.dto";

export type IdentitySessionDeviceContext = {
  userAgent?: string;
  ipAddress?: string;
  sessionIdToReplace?: string;
};

/** External seam for identity authentication and session lifecycle. */
@Injectable()
export class IdentitySession {
  constructor(@Inject(AuthService) private readonly implementation: AuthService) {}

  publicKey() {
    return this.implementation.getCredentialPublicKey();
  }

  register(dto: RegisterDto, context: IdentitySessionDeviceContext = {}) {
    return this.implementation.register(dto, context);
  }

  login(dto: LoginDto, context: IdentitySessionDeviceContext = {}) {
    return this.implementation.login(dto, context);
  }

  wechatLogin(dto: WechatLoginDto, context: IdentitySessionDeviceContext = {}) {
    return this.implementation.loginWithWechatCode(dto, context);
  }

  refresh(refreshToken: string, context: IdentitySessionDeviceContext = {}) {
    return this.implementation.refresh(refreshToken, context);
  }

  me(userId: string) {
    return this.implementation.me(userId);
  }

  logout(userId: string, sessionId?: string) {
    return this.implementation.logout(userId, sessionId);
  }

  sessions(userId: string, currentSessionId?: string) {
    return this.implementation.listSessions(userId, currentSessionId);
  }

  revokeSession(userId: string, sessionId: string) {
    return this.implementation.revokeSession(userId, sessionId);
  }
}
