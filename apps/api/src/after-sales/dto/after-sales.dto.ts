import { ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AfterSaleResponsibility } from "@prisma/client";

export class CreateAfterSaleDto {
  @IsString()
  orderId!: string;

  @IsString()
  @MaxLength(1000)
  description!: string;
}

export class ListAfterSalesDto {
  @IsString()
  storeId!: string;
}

export class AssignAfterSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  workerUserIds!: string[];
}

export class JudgeAfterSaleDto {
  @IsEnum(AfterSaleResponsibility)
  responsibility!: AfterSaleResponsibility;

  @IsOptional()
  @IsString()
  penaltyWorkerUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  penaltyAmountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  penaltyReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}
