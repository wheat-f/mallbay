/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
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
import {
  AssignOrderDto,
  CompleteConstructionDto,
  LeaveRequestDto,
  ListConstructionDto,
  OfflineSyncDto,
  PickupConstructionMaterialDto,
  QualityCheckDto,
  RecordMaterialLossDto,
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
  constructor(private readonly construction: ConstructionService) {}

  @Get("capacities")
  listCapacities(@Req() req: AuthRequest, @Query() query: ListConstructionDto) {
    return this.construction.listCapacities(req.user, query);
  }

  @Post("capacities")
  upsertCapacity(@Req() req: AuthRequest, @Body() dto: UpsertDailyCapacityDto) {
    return this.construction.upsertCapacity(req.user, dto);
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
