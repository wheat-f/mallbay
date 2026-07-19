import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class ReportQueryDto {
  @IsOptional()
  @IsString()
  storeId?: string;
}

/**
 * The operational report deliberately uses business dates rather than the
 * time at which a report happens to be viewed.  `DEFAULT` keeps the role
 * specific defaults: orders use their confirmation/creation date, payments
 * use their actual receipt date and after-sales uses its creation date.
 */
export class OperationalReportQueryDto extends ReportQueryDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsIn(["DEFAULT", "ORDER", "APPOINTMENT", "CONSTRUCTION_COMPLETED", "SETTLEMENT"])
  dateBasis?: "DEFAULT" | "ORDER" | "APPOINTMENT" | "CONSTRUCTION_COMPLETED" | "SETTLEMENT";

  @IsOptional()
  @IsString()
  salesPersonId?: string;

  @IsOptional()
  @IsString()
  workerUserId?: string;

  @IsOptional()
  @IsString()
  constructionType?: string;

  @IsOptional()
  @IsString()
  productCategory?: string;

  @IsOptional()
  @IsString()
  orderStatus?: string;
}
