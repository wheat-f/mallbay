import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { AfterSalesModule } from "./after-sales/after-sales.module";
import { CommissionsModule } from "./commissions/commissions.module";
import { ConstructionModule } from "./construction/construction.module";
import { CustomersModule } from "./customers/customers.module";
import { FinanceModule } from "./finance/finance.module";
import { InvoicesModule } from "./invoices/invoices.module";
import { InventoryModule } from "./inventory/inventory.module";
import { MembersModule } from "./members/members.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObservabilityModule } from "./observability/observability.module";
import { OrdersModule } from "./orders/orders.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProductsModule } from "./products/products.module";
import { PricingModule } from "./pricing/pricing.module";
import { PurchasesModule } from "./purchases/purchases.module";
import { RebatesModule } from "./rebates/rebates.module";
import { ReportsModule } from "./reports/reports.module";
import { SettingsModule } from "./settings/settings.module";
import { SalesQuotesModule } from "./sales-quotes/sales-quotes.module";
import { StoresModule } from "./stores/stores.module";
import { UsersModule } from "./users/users.module";
import { WarrantiesModule } from "./warranties/warranties.module";
import { getApiEnvFilePaths } from "./config/env";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: getApiEnvFilePaths() }),
    PrismaModule,
    AuthModule,
    AfterSalesModule,
    CommissionsModule,
    CustomersModule,
    ConstructionModule,
    InventoryModule,
    WarrantiesModule,
    FinanceModule,
    InvoicesModule,
    RebatesModule,
    ReportsModule,
    SettingsModule,
    ProductsModule,
    PricingModule,
    SalesQuotesModule,
    PurchasesModule,
    OrdersModule,
    UsersModule,
    StoresModule,
    MembersModule,
    NotificationsModule,
    ObservabilityModule
  ]
})
export class AppModule {}
