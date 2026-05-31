import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsDto } from "./dto/list-products.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService, type AuthenticatedProductUser } from "./products.service";

type AuthRequest = Request & {
  user: AuthenticatedProductUser;
};

@UseGuards(JwtAuthGuard)
@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateProductDto) {
    return this.products.create(req.user, dto);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListProductsDto) {
    return this.products.list(req.user, query);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.products.detail(req.user, id);
  }

  @Patch(":id")
  update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(req.user, id, dto);
  }

  @Delete(":id")
  remove(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.products.remove(req.user, id);
  }
}
