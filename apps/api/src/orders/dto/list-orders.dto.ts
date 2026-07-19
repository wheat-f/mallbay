import { Transform, Type } from "class-transformer";
import { IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { ConstructionType, OrderStatus } from "@prisma/client";

export const ORDER_PAYMENT_STATUSES = ["UNPAID", "PARTIAL", "PAID"] as const;
export type OrderPaymentStatus = typeof ORDER_PAYMENT_STATUSES[number];
export const ORDER_EXPORT_DIMENSIONS = ["customer", "date", "product"] as const;
export type OrderExportDimension = typeof ORDER_EXPORT_DIMENSIONS[number];

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

  /** 已完工或已质保、允许进入开票流程的订单。 */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  invoiceable?: boolean;

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

export class ExportOrderDetailsDto extends ListOrdersDto {
  @IsOptional()
  @IsIn(ORDER_EXPORT_DIMENSIONS)
  exportDimension?: OrderExportDimension = "customer";
}
