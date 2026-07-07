import { Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { CustomerRepository } from "./repositories/customer.repository";

@Module({
  imports: [UsersModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerRepository],
  exports: [CustomersService]
})
export class CustomersModule {}
