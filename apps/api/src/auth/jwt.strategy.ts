import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { TokenPayload } from "./token-payload";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(ConfigService) config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>("JWT_ACCESS_SECRET") ?? "mallbay-dev-access-secret"
    });
  }

  validate(payload: TokenPayload) {
    return {
      id: payload.sub,
      username: payload.username,
      // PermissionInterceptor resolves the effective role-derived value at runtime.
      isAuditor: false,
      sessionId: payload.sessionId
    };
  }
}
