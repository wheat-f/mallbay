/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateOrderDto } from "./dto/create-order.dto";
import { CreateOrderPaymentDto } from "./dto/create-order-payment.dto";
import { CreatePaymentAccountDto } from "./dto/create-payment-account.dto";
import { ListOrdersDto } from "./dto/list-orders.dto";
import { ReturnOrderDto } from "./dto/return-order.dto";
import { UpdateOrderCommercialsDto } from "./dto/update-order-commercials.dto";
import { UpdatePaymentAccountDto } from "./dto/update-payment-account.dto";
import { OrdersService, type AuthenticatedOrderUser } from "./orders.service";

type AuthRequest = Request & {
  user: AuthenticatedOrderUser;
};

@UseGuards(JwtAuthGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateOrderDto) {
    return this.orders.create(req.user, dto);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListOrdersDto) {
    return this.orders.list(req.user, query);
  }

  @Get(":id/audit-events")
  listAuditEvents(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.orders.listAuditEvents(req.user, id);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.orders.detail(req.user, id);
  }

  @Patch(":id/commercials")
  updateCommercials(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: UpdateOrderCommercialsDto
  ) {
    return this.orders.updateCommercials(req.user, id, dto);
  }

  @Post(":id/return-to-pending")
  returnToPendingDispatch(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ReturnOrderDto
  ) {
    return this.orders.returnToPendingDispatch(req.user, id, dto);
  }

  @Post(":id/payments")
  addPayment(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: CreateOrderPaymentDto
  ) {
    return this.orders.addPayment(req.user, id, dto);
  }

  @Get(":id/payments")
  listPayments(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.orders.listPayments(req.user, id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller("payment-accounts")
export class PaymentAccountsController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreatePaymentAccountDto) {
    return this.orders.createPaymentAccount(req.user, dto);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.orders.listPaymentAccounts(req.user, storeId);
  }

  @Get(":id/audit-events")
  listAuditEvents(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.orders.listPaymentAccountAuditEvents(req.user, id);
  }

  @Patch(":id")
  update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdatePaymentAccountDto) {
    return this.orders.updatePaymentAccount(req.user, id, dto);
  }

  @Delete(":id")
  remove(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.orders.removePaymentAccount(req.user, id);
  }
}
