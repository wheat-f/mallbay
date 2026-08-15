import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import {
  ConstructionPhotoStage,
  ConstructionCostAdjustmentStatus,
  ConstructionTaskStatus,
  QualityCheckResult,
  ScheduleStatus,
  WorkerSkillTag
} from "@prisma/client";

export class UpsertDailyCapacityDto {
  @IsString()
  storeId!: string;

  @IsDateString()
  date!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  inStoreCapacity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  outsideCapacity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  heatFilmCapacity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  inspectionCapacity!: number;
}

export class UpdateDailyCapacityDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  inStoreCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  outsideCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  heatFilmCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  inspectionCapacity?: number;
}

export class ListConstructionDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AssignOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  workerUserIds!: string[];
}

export class CompleteConstructionDto {
  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class StartConstructionDto {
  @IsOptional()
  @IsDateString()
  startedAt?: string;
}

export class UploadConstructionPhotoDto {
  @IsEnum(ConstructionPhotoStage)
  stage!: ConstructionPhotoStage;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsDateString()
  takenAt?: string;

  /** Stable client/ offline operation key used to make object and DB writes replay-safe. */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  clientOperationId?: string;
}

export class VerifyMaterialBatchDto {
  @IsString()
  batchId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class PickupConstructionMaterialDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  allocationIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RecordMaterialLossDto {
  @IsString()
  batchId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class QualityCheckDto {
  @IsEnum(QualityCheckResult)
  result!: QualityCheckResult;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  responsibilityType?: string;
}

export class UpsertWorkerProfileDto {
  @IsString()
  storeId!: string;

  @IsString()
  userId!: string;

  @IsOptional()
  @IsBoolean()
  canWorkOutside?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(WorkerSkillTag, { each: true })
  skillTags?: WorkerSkillTag[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class LeaveRequestDto {
  @IsString()
  storeId!: string;

  @IsString()
  workerId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @MaxLength(80)
  leaveType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  clientOperationId?: string;
}

export class UpdateLeaveRequestDto {
  @IsIn(["APPROVED", "REJECTED"])
  status!: "APPROVED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class UpsertScheduleDto {
  @IsString()
  storeId!: string;

  @IsString()
  workerId!: string;

  @IsDateString()
  date!: string;

  @IsEnum(ScheduleStatus)
  status!: ScheduleStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class OfflinePhotoPayloadDto {
  @IsString()
  recordId!: string;

  @IsEnum(ConstructionPhotoStage)
  stage!: ConstructionPhotoStage;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsDateString()
  takenAt?: string;
}

export class OfflineTaskStatusPayloadDto {
  @IsString()
  orderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsEnum(ConstructionTaskStatus)
  status!: ConstructionTaskStatus;

  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class OfflineLeavePayloadDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  workerId?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @MaxLength(80)
  leaveType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class OfflineSyncOperationDto {
  @IsString()
  clientOperationId!: string;

  @IsString()
  type!: "PHOTO_UPLOAD" | "TASK_STATUS" | "LEAVE_REQUEST";

  @ValidateNested()
  payload!: OfflinePhotoPayloadDto | OfflineTaskStatusPayloadDto | OfflineLeavePayloadDto;
}

export class OfflineSyncDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  operations!: OfflineSyncOperationDto[];
}

export class ListCostSettlementsDto extends ListConstructionDto {
  @IsOptional()
  @IsString()
  status?: string;
}

export class WorkCostDeclarationDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  declaredWorkMinutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  varianceReasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  varianceReasonText?: string;
}

export class ConfirmCostWorkerLineDto {
  @IsString()
  workerUserId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  confirmedMinutes!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  commissionCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  allowanceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  manualConstructionChargeCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  varianceReasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  varianceReasonText?: string;
}

export class ConfirmCostSettlementDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmCostWorkerLineDto)
  workerLines!: ConfirmCostWorkerLineDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualMaterialCostCents?: number;
}

export class BatchConfirmCostSettlementDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  settlementIds!: string[];
}

export class CreateCostAdjustmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  idempotencyKey?: string;

  @IsString()
  @MaxLength(50)
  adjustmentType!: string;

  @Type(() => Number)
  @IsInt()
  amountCents!: number;

  @IsString()
  @MaxLength(50)
  reasonCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonText?: string;
}

export class ApproveCostAdjustmentDto {
  @IsEnum(ConstructionCostAdjustmentStatus)
  status!: "APPROVED" | "REJECTED";
}
