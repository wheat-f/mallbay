import { IsString } from "class-validator";

export class ReportQueryDto {
  @IsString()
  storeId!: string;
}
