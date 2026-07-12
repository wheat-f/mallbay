/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  get client() {
    return this.prisma.product;
  }
}
