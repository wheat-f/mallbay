import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  get client() {
    return this.prisma.order;
  }
}
