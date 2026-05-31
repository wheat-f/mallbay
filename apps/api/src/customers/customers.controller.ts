/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CustomersService, type AuthenticatedCustomerUser } from "./customers.service";
import { CreateCustomerNoteDto } from "./dto/create-customer-note.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateVehicleDto } from "./dto/create-vehicle.dto";
import { ListCustomersDto } from "./dto/list-customers.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { UpdateVehicleDto } from "./dto/update-vehicle.dto";

type AuthRequest = Request & {
  user: AuthenticatedCustomerUser;
};

@UseGuards(JwtAuthGuard)
@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateCustomerDto) {
    return this.customers.create(req.user, dto.storeId, dto);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListCustomersDto) {
    return this.customers.list(req.user, query);
  }

  @Get("search")
  search(@Req() req: AuthRequest, @Query("storeId") storeId: string, @Query("q") q = "") {
    return this.customers.search(req.user, storeId, q);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.customers.detail(req.user, id);
  }

  @Patch(":id")
  update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(req.user, id, dto);
  }

  @Post("vehicles")
  createVehicle(@Req() req: AuthRequest, @Body() dto: CreateVehicleDto) {
    return this.customers.createVehicle(req.user, dto);
  }

  @Patch("vehicles/:id")
  updateVehicle(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateVehicleDto) {
    return this.customers.updateVehicle(req.user, id, dto);
  }

  @Post("notes")
  createNote(@Req() req: AuthRequest, @Body() dto: CreateCustomerNoteDto) {
    return this.customers.createNote(req.user, dto);
  }
}
