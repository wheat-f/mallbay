/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  ConvertBatchUnitDto,
  CreateInventoryBatchDto,
  CreatePurchaseOrderDto,
  ListInventoryDto,
  ReceivePurchaseItemDto
} from "./dto/inventory.dto";
import { InventoryService, type AuthenticatedInventoryUser } from "./inventory.service";

type AuthRequest = Request & {
  user: AuthenticatedInventoryUser;
};

@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("batches")
  listBatches(@Req() req: AuthRequest, @Query() query: ListInventoryDto) {
    return this.inventory.listBatches(req.user, query);
  }

  @Post("batches")
  createBatch(@Req() req: AuthRequest, @Body() dto: CreateInventoryBatchDto) {
    return this.inventory.createBatch(req.user, dto);
  }

  @Post("batches/:batchId/convert")
  convertBatch(@Req() req: AuthRequest, @Param("batchId") batchId: string, @Body() dto: ConvertBatchUnitDto) {
    return this.inventory.convertBatchUnit(req.user, batchId, dto);
  }

  @Get("movements")
  listMovements(@Req() req: AuthRequest, @Query() query: ListInventoryDto) {
    return this.inventory.listMovements(req.user, query);
  }

  @Get("purchase-orders")
  listPurchaseOrders(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.inventory.listPurchaseOrders(req.user, storeId);
  }

  @Post("purchase-orders")
  createPurchaseOrder(@Req() req: AuthRequest, @Body() dto: CreatePurchaseOrderDto) {
    return this.inventory.createPurchaseOrder(req.user, dto);
  }

  @Post("purchase-orders/items/:id/receive")
  receivePurchaseItem(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReceivePurchaseItemDto) {
    return this.inventory.receivePurchaseItem(req.user, id, dto);
  }

  @Post("orders/:orderId/lock")
  lockOrderInventory(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.inventory.lockOrderInventory(req.user, orderId);
  }

  @Post("orders/:orderId/outbound")
  outboundOrderInventory(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.inventory.outboundOrderInventory(req.user, orderId);
  }
}
