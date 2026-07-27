import { CustomerVehicleStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ListCustomerVehiclesDto {
  @IsOptional()
  @IsEnum(CustomerVehicleStatus)
  status?: CustomerVehicleStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ChangeVehicleStatusDto {
  @IsString()
  @MaxLength(200)
  reason!: string;
}

export class TransferVehicleDto {
  @IsString()
  toCustomerId!: string;

  @IsString()
  @MaxLength(200)
  reason!: string;
}
