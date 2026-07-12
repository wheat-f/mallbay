/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  CreatePurchaseOrderFromRequirementDto,
  CreatePurchaseRequirementDto,
  CreateSupplierContactDto,
  CreateSupplierDto,
  CreateSupplierRatingHistoryDto,
  ListWarehousesDto,
  ReceivePurchaseItemBatchesDto,
  ReceivePurchaseItemDto,
  UpdateSupplierDto
} from "../inventory/dto/inventory.dto";
import { InventoryService, type AuthenticatedInventoryUser } from "../inventory/inventory.service";

type AuthRequest = Request & {
  user: AuthenticatedInventoryUser;
};

@UseGuards(JwtAuthGuard)
@Controller("purchases")
export class PurchasesController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("overview")
  overview(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.inventory.getPurchaseOverview(req.user, storeId);
  }

  @Get("requirements")
  listRequirements(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.inventory.listPurchaseRequirements(req.user, storeId);
  }

  @Post("requirements")
  createRequirement(@Req() req: AuthRequest, @Body() dto: CreatePurchaseRequirementDto) {
    return this.inventory.createPurchaseRequirement(req.user, dto);
  }

  @Post("requirements/:id/orders")
  createOrderFromRequirement(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: CreatePurchaseOrderFromRequirementDto
  ) {
    return this.inventory.createPurchaseOrderFromRequirement(req.user, id, dto);
  }

  @Get("orders")
  listOrders(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.inventory.listPurchaseOrders(req.user, storeId);
  }

  @Post("orders")
  createOrder(@Req() req: AuthRequest, @Body() dto: CreatePurchaseOrderDto) {
    return this.inventory.createPurchaseOrder(req.user, dto);
  }

  @Get("orders/:id")
  getOrder(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.inventory.getPurchaseOrder(req.user, id);
  }

  @Post("orders/:id/approve")
  approveOrder(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.inventory.approvePurchaseOrder(req.user, id);
  }

  @Post("orders/:id/cancel")
  cancelOrder(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CancelPurchaseOrderDto) {
    return this.inventory.cancelPurchaseOrder(req.user, id, dto);
  }

  @Post("orders/items/:id/receive")
  receiveOrderItem(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReceivePurchaseItemDto) {
    return this.inventory.receivePurchaseItem(req.user, id, dto);
  }

  @Post("orders/items/:id/receive-batches")
  receiveOrderItemBatches(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ReceivePurchaseItemBatchesDto
  ) {
    return this.inventory.receivePurchaseItemBatches(req.user, id, dto);
  }

  @Get("warehouses")
  listWarehouses(@Req() req: AuthRequest, @Query() query: ListWarehousesDto) {
    return this.inventory.listWarehouses(req.user, query.storeId);
  }

  @Get("suppliers")
  listSuppliers(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.inventory.listSuppliers(req.user, storeId);
  }

  @Post("suppliers")
  createSupplier(@Req() req: AuthRequest, @Body() dto: CreateSupplierDto) {
    return this.inventory.createSupplier(req.user, dto);
  }

  @Patch("suppliers/:id")
  updateSupplier(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateSupplierDto) {
    return this.inventory.updateSupplier(req.user, id, dto);
  }

  @Post("suppliers/:id/contacts")
  createSupplierContact(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CreateSupplierContactDto) {
    return this.inventory.createSupplierContact(req.user, id, dto);
  }

  @Post("suppliers/:id/rating-history")
  createSupplierRatingHistory(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: CreateSupplierRatingHistoryDto
  ) {
    return this.inventory.createSupplierRatingHistory(req.user, id, dto);
  }
}
