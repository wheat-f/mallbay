import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { CustomersModule } from "./customers/customers.module";
import { MembersModule } from "./members/members.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PrismaModule } from "./prisma/prisma.module";
import { StoresModule } from "./stores/stores.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    CustomersModule,
    UsersModule,
    StoresModule,
    MembersModule,
    NotificationsModule,
    ObservabilityModule
  ]
})
export class AppModule {}
