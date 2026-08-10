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
  ListPurchaseOrderExportDetailsDto,
  ReceivePurchaseItemBatchesDto,
  ReceivePurchaseItemDto,
  UpdatePurchaseReceiptCostDto,
  UpdateSupplierDto
} from "../inventory/dto/inventory.dto";
import type { AuthenticatedInventoryUser } from "../inventory/inventory.service";
import { ProcurementFlow } from "../inventory/procurement-flow";
import { InventoryCatalog } from "../inventory/inventory-catalog";

type AuthRequest = Request & {
  user: AuthenticatedInventoryUser;
};

@UseGuards(JwtAuthGuard)
@Controller("purchases")
export class PurchasesController {
  constructor(
    private readonly procurement: ProcurementFlow,
    private readonly catalog: InventoryCatalog
  ) {}

  @Get("overview")
  overview(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.procurement.getOverview(req.user, storeId);
  }

  @Get("requirements")
  listRequirements(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.procurement.listRequirements(req.user, storeId);
  }

  @Post("requirements")
  createRequirement(@Req() req: AuthRequest, @Body() dto: CreatePurchaseRequirementDto) {
    return this.procurement.createRequirement(req.user, dto);
  }

  @Post("requirements/:id/orders")
  createOrderFromRequirement(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: CreatePurchaseOrderFromRequirementDto
  ) {
    return this.procurement.createOrderFromRequirement(req.user, id, dto);
  }

  @Get("orders")
  listOrders(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.procurement.listOrders(req.user, storeId);
  }

  @Get("orders/export-details")
  exportOrderDetails(@Req() req: AuthRequest, @Query() query: ListPurchaseOrderExportDetailsDto) {
    return this.procurement.exportOrderDetails(req.user, query);
  }

  @Post("orders")
  createOrder(@Req() req: AuthRequest, @Body() dto: CreatePurchaseOrderDto) {
    return this.procurement.createOrder(req.user, dto);
  }

  @Get("orders/:id")
  getOrder(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.procurement.getOrder(req.user, id);
  }

  @Post("orders/:id/approve")
  approveOrder(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.procurement.approveOrder(req.user, id);
  }

  @Post("orders/:id/cancel")
  cancelOrder(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CancelPurchaseOrderDto) {
    return this.procurement.cancelOrder(req.user, id, dto);
  }

  @Post("orders/items/:id/receive")
  receiveOrderItem(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReceivePurchaseItemDto) {
    return this.procurement.receive(req.user, id, dto);
  }

  @Post("orders/items/:id/receive-batches")
  receiveOrderItemBatches(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ReceivePurchaseItemBatchesDto
  ) {
    return this.procurement.receiveBatches(req.user, id, dto);
  }

  @Patch("receipt-costs/:id")
  updateReceiptCost(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdatePurchaseReceiptCostDto) {
    return this.procurement.updateReceiptCost(req.user, id, dto);
  }

  @Get("warehouses")
  listWarehouses(@Req() req: AuthRequest, @Query() query: ListWarehousesDto) {
    return this.catalog.listWarehouses(req.user, query.storeId);
  }

  @Get("suppliers")
  listSuppliers(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.catalog.listSuppliers(req.user, storeId);
  }

  @Post("suppliers")
  createSupplier(@Req() req: AuthRequest, @Body() dto: CreateSupplierDto) {
    return this.catalog.createSupplier(req.user, dto);
  }

  @Patch("suppliers/:id")
  updateSupplier(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateSupplierDto) {
    return this.catalog.updateSupplier(req.user, id, dto);
  }

  @Post("suppliers/:id/contacts")
  createSupplierContact(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CreateSupplierContactDto) {
    return this.catalog.createSupplierContact(req.user, id, dto);
  }

  @Post("suppliers/:id/rating-history")
  createSupplierRatingHistory(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: CreateSupplierRatingHistoryDto
  ) {
    return this.catalog.createSupplierRatingHistory(req.user, id, dto);
  }
}
