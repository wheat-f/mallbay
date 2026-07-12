/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  get client() {
    return this.prisma.customer;
  }
}
