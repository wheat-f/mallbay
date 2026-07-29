import { CrossStoreTaskStatus, ProductUnit } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength
} from "class-validator";

export enum CrossStoreTaskScope {
  SOURCE = "SOURCE",
  EXECUTION = "EXECUTION"
}

export class ListCrossStoreTasksDto {
  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @IsEnum(CrossStoreTaskScope)
  scope!: CrossStoreTaskScope;

  @IsEnum(CrossStoreTaskStatus)
  @IsOptional()
  status?: CrossStoreTaskStatus;
}

export class RejectCrossStoreTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

export class CancelCrossStoreTaskDto extends RejectCrossStoreTaskDto {}

export class CompleteCrossStoreAcceptanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  remark!: string;
}

export class UpsertCrossStoreProductMappingDto {
  @IsString()
  @IsNotEmpty()
  sourceProductId!: string;

  @IsString()
  @IsNotEmpty()
  executionStoreId!: string;

  @IsString()
  @IsNotEmpty()
  executionProductId!: string;

  @IsEnum(ProductUnit)
  sourceSalesUnit!: ProductUnit;

  @IsEnum(ProductUnit)
  executionInventoryUnit!: ProductUnit;

  @IsObject()
  @IsOptional()
  conversionSnapshot?: Record<string, unknown>;
}
