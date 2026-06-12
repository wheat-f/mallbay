/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  ConvertBatchUnitDto,
  CreateInventoryBatchDto,
  CreateOrderInventoryAllocationsDto,
  CreatePurchaseOrderFromRequirementDto,
  CreatePurchaseOrderDto,
  CancelPurchaseOrderDto,
  CreatePurchaseRequirementDto,
  CreateSupplierContactDto,
  CreateSupplierRatingHistoryDto,
  CreateSupplierDto,
  CreateStockOperationDto,
  ListInventoryDto,
  ListSuppliersDto,
  ReceivePurchaseItemBatchesDto,
  ReceivePurchaseItemDto,
  SplitBatchDto,
  UpdateSupplierDto
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

  @Get("suppliers")
  listSuppliers(@Req() req: AuthRequest, @Query() query: ListSuppliersDto) {
    return this.inventory.listSuppliers(req.user, query.storeId);
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

  @Post("batches/:batchId/convert")
  convertBatch(@Req() req: AuthRequest, @Param("batchId") batchId: string, @Body() dto: ConvertBatchUnitDto) {
    return this.inventory.convertBatchUnit(req.user, batchId, dto);
  }

  @Post("batches/:batchId/split")
  splitBatch(@Req() req: AuthRequest, @Param("batchId") batchId: string, @Body() dto: SplitBatchDto) {
    return this.inventory.splitBatch(req.user, batchId, dto);
  }

  @Get("movements")
  listMovements(@Req() req: AuthRequest, @Query() query: ListInventoryDto) {
    return this.inventory.listMovements(req.user, query);
  }

  @Get("orders/pending-match")
  listPendingMatchOrders(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.inventory.listPendingMatchOrders(req.user, storeId);
  }

  @Get("orders/:orderId/match")
  getOrderInventoryMatch(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.inventory.getOrderInventoryMatch(req.user, orderId);
  }

  @Post("orders/:orderId/allocations")
  createOrderInventoryAllocations(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() dto: CreateOrderInventoryAllocationsDto
  ) {
    return this.inventory.createOrderInventoryAllocations(req.user, orderId, dto);
  }

  @Get("purchase-orders")
  listPurchaseOrders(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.inventory.listPurchaseOrders(req.user, storeId);
  }

  @Get("purchase-requirements")
  listPurchaseRequirements(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.inventory.listPurchaseRequirements(req.user, storeId);
  }

  @Post("purchase-requirements")
  createPurchaseRequirement(@Req() req: AuthRequest, @Body() dto: CreatePurchaseRequirementDto) {
    return this.inventory.createPurchaseRequirement(req.user, dto);
  }

  @Post("purchase-requirements/:id/purchase-orders")
  createPurchaseOrderFromRequirement(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: CreatePurchaseOrderFromRequirementDto
  ) {
    return this.inventory.createPurchaseOrderFromRequirement(req.user, id, dto);
  }

  @Post("purchase-orders")
  createPurchaseOrder(@Req() req: AuthRequest, @Body() dto: CreatePurchaseOrderDto) {
    return this.inventory.createPurchaseOrder(req.user, dto);
  }

  @Post("purchase-orders/:id/approve")
  approvePurchaseOrder(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.inventory.approvePurchaseOrder(req.user, id);
  }

  @Post("purchase-orders/:id/cancel")
  cancelPurchaseOrder(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CancelPurchaseOrderDto) {
    return this.inventory.cancelPurchaseOrder(req.user, id, dto);
  }

  @Post("purchase-orders/items/:id/receive")
  receivePurchaseItem(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReceivePurchaseItemDto) {
    return this.inventory.receivePurchaseItem(req.user, id, dto);
  }

  @Post("purchase-orders/items/:id/receive-batches")
  receivePurchaseItemBatches(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ReceivePurchaseItemBatchesDto
  ) {
    return this.inventory.receivePurchaseItemBatches(req.user, id, dto);
  }

  @Post("orders/:orderId/lock")
  lockOrderInventory(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.inventory.lockOrderInventory(req.user, orderId);
  }

  @Post("orders/:orderId/outbound")
  outboundOrderInventory(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.inventory.outboundOrderInventory(req.user, orderId);
  }

  @Post("orders/:orderId/release")
  releaseOrderInventory(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.inventory.releaseOrderInventory(req.user, orderId);
  }

  @Post("stock-operations")
  createStockOperation(@Req() req: AuthRequest, @Body() dto: CreateStockOperationDto) {
    return this.inventory.createStockOperation(req.user, dto);
  }
}
