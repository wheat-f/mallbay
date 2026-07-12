import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { CommissionRuleType, ConstructionType } from "@prisma/client";

export class CreateSalesCommissionRuleDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsEnum(CommissionRuleType)
  ruleType!: CommissionRuleType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rateBasisPoints?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fixedAmountCents?: number;

  @IsOptional()
  @IsEnum(ConstructionType)
  constructionType?: ConstructionType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListCommissionRulesDto {
  @IsString()
  storeId!: string;
}

export class WorkerCommissionAdjustmentDto {
  @IsString()
  workerUserId!: string;

  @Type(() => Number)
  @IsInt()
  adjustmentCents!: number;
}

export class GenerateWorkerCommissionsDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseAmountCents!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerCommissionAdjustmentDto)
  adjustments?: WorkerCommissionAdjustmentDto[];
}
