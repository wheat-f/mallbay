import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { ProductRepository } from "./repositories/product.repository";

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductRepository],
  exports: [ProductsService]
})
export class ProductsModule {}
