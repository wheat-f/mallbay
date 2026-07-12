import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
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

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateLeaveRequestDto {
  @IsOptional()
  @IsString()
  status?: string;
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
