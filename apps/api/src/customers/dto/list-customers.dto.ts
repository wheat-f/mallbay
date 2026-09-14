import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
import { CustomerStatus } from "@prisma/client";

export class ListCustomersDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  systemTag?: string;

  @IsOptional()
  @IsString()
  customTagId?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus = CustomerStatus.ACTIVE;
}
