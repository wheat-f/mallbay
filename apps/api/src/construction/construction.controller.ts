/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { MulterFile } from "../users/multer-file.type";
import { ConstructionService, type AuthenticatedConstructionUser } from "./construction.service";
import { CapacityReservationService } from "./capacity-reservation.service";
import { ConstructionCostSettlementService } from "./construction-cost-settlement.service";
import { CrossStoreConstructionService } from "./cross-store-construction.service";
import {
  CancelCrossStoreTaskDto,
  CompleteCrossStoreAcceptanceDto,
  ListCrossStoreTasksDto,
  RejectCrossStoreTaskDto,
  UpsertCrossStoreProductMappingDto
} from "./dto/cross-store-construction.dto";
import {
  AssignOrderDto,
  ApproveCostAdjustmentDto,
  BatchConfirmCostSettlementDto,
  ConfirmCostSettlementDto,
  CompleteConstructionDto,
  LeaveRequestDto,
  ListConstructionDto,
  ListCostSettlementsDto,
  OfflineSyncDto,
  PickupConstructionMaterialDto,
  QualityCheckDto,
  RecordMaterialLossDto,
  WorkCostDeclarationDto,
  CreateCostAdjustmentDto,
  StartConstructionDto,
  UpdateDailyCapacityDto,
  UpdateLeaveRequestDto,
  UploadConstructionPhotoDto,
  UpsertDailyCapacityDto,
  UpsertScheduleDto,
  UpsertWorkerProfileDto,
  VerifyMaterialBatchDto
} from "./dto/construction.dto";

type AuthRequest = Request & {
  user: AuthenticatedConstructionUser;
};

@UseGuards(JwtAuthGuard)
@Controller("construction")
export class ConstructionController {
  constructor(
    private readonly construction: ConstructionService,
    private readonly capacities: CapacityReservationService,
    private readonly costSettlements: ConstructionCostSettlementService,
    private readonly crossStore: CrossStoreConstructionService
  ) {}

  @Get("cross-store/tasks")
  listCrossStoreTasks(@Req() req: AuthRequest, @Query() query: ListCrossStoreTasksDto) {
    return this.crossStore.list(req.user, query);
  }

  @Get("cross-store/tasks/:id")
  getCrossStoreTask(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.crossStore.get(req.user, id);
  }

  @Post("cross-store/tasks/:id/accept")
  acceptCrossStoreTask(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.crossStore.accept(req.user, id);
  }

  @Post("cross-store/tasks/:id/reject")
  rejectCrossStoreTask(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: RejectCrossStoreTaskDto
  ) {
    return this.crossStore.reject(req.user, id, dto);
  }

  @Post("cross-store/tasks/:id/cancel")
  cancelCrossStoreTask(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: CancelCrossStoreTaskDto
  ) {
    return this.crossStore.cancel(req.user, id, dto);
  }

  @Post("cross-store/tasks/:id/submit-acceptance")
  submitCrossStoreTaskForAcceptance(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: CompleteCrossStoreAcceptanceDto
  ) {
    return this.crossStore.submitForSourceAcceptance(req.user, id, dto);
  }

  @Post("cross-store/tasks/:id/source-accept")
  acceptCrossStoreTaskBySource(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.crossStore.completeSourceAcceptance(req.user, id);
  }

  @Get("cross-store/product-mappings")
  listCrossStoreProductMappings(
    @Req() req: AuthRequest,
    @Query("sourceStoreId") sourceStoreId: string,
    @Query("executionStoreId") executionStoreId: string
  ) {
    return this.crossStore.listProductMappings(req.user, sourceStoreId, executionStoreId);
  }

  @Post("cross-store/product-mappings")
  upsertCrossStoreProductMapping(
    @Req() req: AuthRequest,
    @Body() dto: UpsertCrossStoreProductMappingDto
  ) {
    return this.crossStore.upsertProductMapping(req.user, dto);
  }
  @Get("cost-settlements")
  listCostSettlements(@Req() req: AuthRequest, @Query() query: ListCostSettlementsDto) {
    return this.costSettlements.list(req.user, query);
  }

  @Get("cost-settlements/export")
  exportCostSettlements(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.costSettlements.exportDetails(req.user, storeId);
  }

  @Get("cost-settlements/:id")
  getCostSettlement(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.costSettlements.get(req.user, id);
  }

  @Post("cost-settlements/:id/declaration")
  declareCostWork(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: WorkCostDeclarationDto) {
    return this.costSettlements.declare(req.user, id, dto);
  }

  @Get("records/:recordId/cost-declaration")
  getOwnCostDeclaration(@Req() req: AuthRequest, @Param("recordId") recordId: string) {
    return this.costSettlements.getOwnDeclaration(req.user, recordId);
  }

  @Post("cost-settlements/:id/confirm")
  confirmCostSettlement(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ConfirmCostSettlementDto) {
    return this.costSettlements.confirm(req.user, id, dto, { allowAbnormal: true });
  }

  @Post("cost-settlements/batch-confirm")
  batchConfirmCostSettlements(@Req() req: AuthRequest, @Body() dto: BatchConfirmCostSettlementDto) {
    return this.costSettlements.batchConfirm(req.user, dto);
  }

  @Post("cost-settlements/:id/adjustments")
  createCostAdjustment(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CreateCostAdjustmentDto) {
    return this.costSettlements.createAdjustment(req.user, id, dto);
  }

  @Post("cost-adjustments/:id/approve")
  approveCostAdjustment(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ApproveCostAdjustmentDto) {
    return this.costSettlements.approveAdjustment(req.user, id, dto);
  }

  @Post("cost-settlements/:id/settle")
  settleCostSettlement(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.costSettlements.settle(req.user, id);
  }

  @Get("orders/:orderId/cost-comparison")
  compareOrderCost(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.costSettlements.compareOrder(req.user, orderId);
  }

  @Get("capacities")
  listCapacities(@Req() req: AuthRequest, @Query() query: ListConstructionDto) {
    return this.construction.listCapacities(req.user, query);
  }

  @Post("capacities")
  upsertCapacity(@Req() req: AuthRequest, @Body() dto: UpsertDailyCapacityDto) {
    return this.construction.upsertCapacity(req.user, dto);
  }

  @Get("capacities/reconciliation")
  reconcileCapacities(@Req() req: AuthRequest, @Query() query: ListConstructionDto) {
    const member = req.user.storeMember;
    if (!req.user.isAuditor && (!member || member.storeId !== query.storeId || member.position !== "MANAGER")) throw new ForbiddenException("只有店长可以执行容量对账");
    return this.capacities.reconcile(query.storeId, query.from ?? new Date().toISOString(), false);
  }

  @Patch("capacities/:id")
  updateCapacity(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateDailyCapacityDto) {
    return this.construction.updateCapacity(req.user, id, dto);
  }

  @Get("assignments")
  listAssignments(@Req() req: AuthRequest, @Query() query: ListConstructionDto) {
    return this.construction.listAssignments(req.user, query);
  }

  @Post("orders/:orderId/assign")
  assignOrder(@Req() req: AuthRequest, @Param("orderId") orderId: string, @Body() dto: AssignOrderDto) {
    return this.construction.assignOrder(req.user, orderId, dto);
  }

  @Post("orders/:orderId/start")
  startOrder(@Req() req: AuthRequest, @Param("orderId") orderId: string, @Body() dto: StartConstructionDto) {
    return this.construction.startOrder(req.user, orderId, dto);
  }

  @Post("orders/:orderId/complete")
  completeOrder(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() dto: CompleteConstructionDto
  ) {
    return this.construction.completeOrderForOrder(req.user, orderId, dto);
  }

  @Post("records/:recordId/photos")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadPhoto(
    @Req() req: AuthRequest,
    @Param("recordId") recordId: string,
    @Body() dto: UploadConstructionPhotoDto,
    @UploadedFile() file?: MulterFile
  ) {
    return this.construction.uploadPhoto(req.user, recordId, dto, file);
  }

  @Post("records/:recordId/quality-check")
  qualityCheck(@Req() req: AuthRequest, @Param("recordId") recordId: string, @Body() dto: QualityCheckDto) {
    return this.construction.qualityCheck(req.user, recordId, dto);
  }

  @Get("orders/:orderId/materials")
  getOrderMaterials(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.construction.getOrderMaterials(req.user, orderId);
  }

  @Post("orders/:orderId/materials/verify-batch")
  verifyMaterialBatch(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() dto: VerifyMaterialBatchDto
  ) {
    return this.construction.verifyMaterialBatch(req.user, orderId, dto);
  }

  @Post("orders/:orderId/materials/pickup")
  pickupMaterials(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() dto: PickupConstructionMaterialDto
  ) {
    return this.construction.pickupMaterials(req.user, orderId, dto);
  }

  @Post("orders/:orderId/materials/losses")
  recordMaterialLoss(
    @Req() req: AuthRequest,
    @Param("orderId") orderId: string,
    @Body() dto: RecordMaterialLossDto
  ) {
    return this.construction.recordMaterialLoss(req.user, orderId, dto);
  }

  @Get("workers")
  listWorkers(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.construction.listWorkers(req.user, storeId);
  }

  @Post("workers")
  upsertWorker(@Req() req: AuthRequest, @Body() dto: UpsertWorkerProfileDto) {
    return this.construction.upsertWorker(req.user, dto);
  }

  @Patch("workers/:userId")
  updateWorker(@Req() req: AuthRequest, @Param("userId") userId: string, @Body() dto: UpsertWorkerProfileDto) {
    return this.construction.upsertWorker(req.user, { ...dto, userId });
  }

  @Get("leaves")
  listLeaves(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.construction.listLeaves(req.user, storeId);
  }

  @Post("leaves")
  createLeave(@Req() req: AuthRequest, @Body() dto: LeaveRequestDto) {
    return this.construction.createLeave(req.user, dto);
  }

  @Patch("leaves/:id")
  updateLeave(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateLeaveRequestDto) {
    return this.construction.updateLeave(req.user, id, dto);
  }

  @Post("schedules")
  upsertSchedule(@Req() req: AuthRequest, @Body() dto: UpsertScheduleDto) {
    return this.construction.upsertSchedule(req.user, dto);
  }

  @Get("schedules")
  listSchedules(@Req() req: AuthRequest, @Query() query: ListConstructionDto) {
    return this.construction.listSchedules(req.user, query);
  }

  @Post("offline-sync")
  syncOfflineOperations(@Req() req: AuthRequest, @Body() dto: OfflineSyncDto) {
    return this.construction.syncOfflineOperations(req.user, dto);
  }
}
