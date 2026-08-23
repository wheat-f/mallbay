import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { ProductCatalog } from "./domain/product-catalog";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [PermissionsModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductCatalog],
  exports: [ProductCatalog]
})
export class ProductsModule {}
