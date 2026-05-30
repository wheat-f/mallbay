import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ObservabilityModule } from "../observability/observability.module";
import { AuthController } from "./auth.controller";
import { AuthCryptoService } from "./auth-crypto.service";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [PassportModule, JwtModule.register({}), ObservabilityModule],
  controllers: [AuthController],
  providers: [AuthCryptoService, AuthService, JwtStrategy],
  exports: [AuthCryptoService, AuthService]
})
export class AuthModule {}
