import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { CustomerRepository } from "./repositories/customer.repository";
import { CustomerAccount } from "./domain/customer-account";

@Module({
  imports: [UsersModule, PermissionsModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerRepository, CustomerAccount],
  exports: [CustomersService, CustomerAccount]
})
export class CustomersModule {}
