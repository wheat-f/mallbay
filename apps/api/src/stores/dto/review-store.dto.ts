import { IsEnum, IsOptional, IsString } from "class-validator";

export enum ReviewAction {
  APPROVE = "APPROVE",
  REJECT = "REJECT"
}

export class ReviewStoreDto {
  @IsEnum(ReviewAction)
  action!: ReviewAction;

  @IsOptional()
  @IsString()
  reviewNote?: string; // 驳回时必填，在 service 层校验
}
