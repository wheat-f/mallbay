import { Injectable } from "@nestjs/common";
import { ProductsService } from "../products.service";
import type { AuthenticatedProductUser } from "../products.service";
import type { CreateProductDto } from "../dto/create-product.dto";
import type { ListProductsDto } from "../dto/list-products.dto";
import type { UpdateProductDto } from "../dto/update-product.dto";
import type { UpdateProductUnitSuggestedPricesDto } from "../dto/update-product-unit-suggested-prices.dto";

/**
 * Product master-data seam.
 *
 * Product creation, unit conversion, suggested prices, standard cost and
 * lifecycle reads/writes cross this seam. ProductsService remains the
 * compatibility implementation behind it while callers learn only this
 * focused interface.
 */
@Injectable()
export class ProductCatalog {
  constructor(private readonly implementation: ProductsService) {}

  create(user: AuthenticatedProductUser, dto: CreateProductDto) {
    return this.implementation.create(user, dto);
  }

  list(user: AuthenticatedProductUser, dto: ListProductsDto) {
    return this.implementation.list(user, dto);
  }

  detail(user: AuthenticatedProductUser, id: string) {
    return this.implementation.detail(user, id);
  }

  update(user: AuthenticatedProductUser, id: string, dto: UpdateProductDto) {
    return this.implementation.update(user, id, dto);
  }

  updateStandardCost(user: AuthenticatedProductUser, id: string, standardCostCents: number) {
    return this.implementation.updateStandardCost(user, id, standardCostCents);
  }

  updateUnitSuggestedPrices(
    user: AuthenticatedProductUser,
    id: string,
    prices: UpdateProductUnitSuggestedPricesDto["prices"]
  ) {
    return this.implementation.updateUnitSuggestedPrices(user, id, prices);
  }

  remove(user: AuthenticatedProductUser, id: string) {
    return this.implementation.remove(user, id);
  }
}
