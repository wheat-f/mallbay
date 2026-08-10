/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  ConvertBatchUnitDto,
  CreateInventoryBatchDto,
  CreateWarehouseDto,
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
  ListWarehousesDto,
  OutboundOrderInventoryDto,
  ReceivePurchaseItemBatchesDto,
  ReceivePurchaseItemDto,
  SplitBatchDto,
  UpdateWarehouseDto,
  UpdateSupplierDto
} from "./dto/inventory.dto";
import type { AuthenticatedInventoryUser } from "./inventory.service";
import { InventoryLedger } from "./domain/inventory-ledger";
import { ProcurementFlow } from "./procurement-flow";
import { InventoryCatalog } from "./inventory-catalog";

type AuthRequest = Request & {
  user: AuthenticatedInventoryUser;
};

@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
  constructor(
    private readonly ledger: InventoryLedger,
    private readonly procurement: ProcurementFlow,
    private readonly catalog: InventoryCatalog
  ) {}

  @Get("batches")
  listBatches(@Req() req: AuthRequest, @Query() query: ListInventoryDto) {
    return this.ledger.listBatches(req.user, query);
  }

  @Post("batches")
  createBatch(@Req() req: AuthRequest, @Body() dto: CreateInventoryBatchDto) {
    return this.ledger.receiveBatch(req.user, dto);
  }

  @Get("warehouses")
  listWarehouses(@Req() req: AuthRequest, @Query() query: ListWarehousesDto) {
    return this.catalog.listWarehouses(req.user, query.storeId);
  }

  @Post("warehouses")
  createWarehouse(@Req() req: AuthRequest, @Body() dto: CreateWarehouseDto) {
    return this.catalog.createWarehouse(req.user, dto);
  }

  @Patch("warehouses/:id")
  updateWarehouse(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateWarehouseDto) {
    return this.catalog.updateWarehouse(req.user, id, dto);
  }

  @Get("suppliers")
  listSuppliers(@Req() req: AuthRequest, @Query() query: ListSuppliersDto) {
    return this.catalog.listSuppliers(req.user, query.storeId);
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

  @Post("batches/:batchId/convert")
  convertBatch(@Req() req: AuthRequest, @Param("batchId") batchId: string, @Body() dto: ConvertBatchUnitDto) {
    return this.ledger.convertBatch(req.user, batchId, dto);
  }

  @Post("batches/:batchId/split")
  splitBatch(@Req() req: AuthRequest, @Param("batchId") batchId: string, @Body() dto: SplitBatchDto) {
    return this.ledger.splitBatch(req.user, batchId, dto);
  }

  @Get("movements")
  listMovements(@Req() req: AuthRequest, @Query() query: ListInventoryDto) {
    return this.ledger.trace(req.user, query);
  }

  @Get("orders/pending-match")
  listPendingMatchOrders(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.ledger.pendingMatches(req.user, storeId);
  }

  @Get("orders/:orderId/match")
  getOrderInventoryMatch(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.ledger.orderMatch(req.user, orderId);
  }

  @Post("orders/:orderId/allocations")
  createOrderInventoryAllocations(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() dto: CreateOrderInventoryAllocationsDto
  ) {
    return this.ledger.reserve(req.user, { orderId, allocations: dto });
  }

  @Get("purchase-orders")
  listPurchaseOrders(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.procurement.listOrders(req.user, storeId);
  }

  @Get("purchase-requirements")
  listPurchaseRequirements(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.procurement.listRequirements(req.user, storeId);
  }

  @Post("purchase-requirements")
  createPurchaseRequirement(@Req() req: AuthRequest, @Body() dto: CreatePurchaseRequirementDto) {
    return this.procurement.createRequirement(req.user, dto);
  }

  @Post("purchase-requirements/:id/purchase-orders")
  createPurchaseOrderFromRequirement(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: CreatePurchaseOrderFromRequirementDto
  ) {
    return this.procurement.createOrderFromRequirement(req.user, id, dto);
  }

  @Post("purchase-orders")
  createPurchaseOrder(@Req() req: AuthRequest, @Body() dto: CreatePurchaseOrderDto) {
    return this.procurement.createOrder(req.user, dto);
  }

  @Post("purchase-orders/:id/approve")
  approvePurchaseOrder(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.procurement.approveOrder(req.user, id);
  }

  @Post("purchase-orders/:id/cancel")
  cancelPurchaseOrder(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CancelPurchaseOrderDto) {
    return this.procurement.cancelOrder(req.user, id, dto);
  }

  @Post("purchase-orders/items/:id/receive")
  receivePurchaseItem(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReceivePurchaseItemDto) {
    return this.ledger.receive(req.user, { purchaseOrderItemId: id, receipt: dto });
  }

  @Post("purchase-orders/items/:id/receive-batches")
  receivePurchaseItemBatches(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ReceivePurchaseItemBatchesDto
  ) {
    return this.ledger.receiveBatches(req.user, { purchaseOrderItemId: id, receipt: dto });
  }

  @Post("orders/:orderId/outbound")
  outboundOrderInventory(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() dto: OutboundOrderInventoryDto
  ) {
    return this.ledger.outbound(req.user, { orderId, outbound: dto });
  }

  @Post("orders/:orderId/release")
  releaseOrderInventory(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.ledger.release(req.user, { orderId });
  }

  @Post("stock-operations")
  createStockOperation(@Req() req: AuthRequest, @Body() dto: CreateStockOperationDto) {
    return this.ledger.adjust(req.user, dto);
  }
}
