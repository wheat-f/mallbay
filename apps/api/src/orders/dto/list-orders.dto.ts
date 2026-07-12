import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { ConstructionType, OrderStatus } from "@prisma/client";

export const ORDER_PAYMENT_STATUSES = ["UNPAID", "PARTIAL", "PAID"] as const;
export type OrderPaymentStatus = typeof ORDER_PAYMENT_STATUSES[number];

export class ListOrdersDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(ConstructionType)
  constructionType?: ConstructionType;

  @IsOptional()
  @IsIn(ORDER_PAYMENT_STATUSES)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

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
}
