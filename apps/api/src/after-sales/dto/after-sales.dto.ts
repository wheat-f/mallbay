import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { AfterSaleCostCategory, AfterSalePhotoStage, AfterSaleResponsibility } from "@prisma/client";

export class AfterSalePhotoInputDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class CreateAfterSaleDto {
  @IsString()
  orderId!: string;

  @IsString()
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  issuePhotoUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AfterSalePhotoInputDto)
  issuePhotos?: AfterSalePhotoInputDto[];
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
  @IsString()
  @MaxLength(100)
  constructionIssueCategory?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  constructionPhotoUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AfterSalePhotoInputDto)
  constructionPhotos?: AfterSalePhotoInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  supplementPhotoUrls?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AfterSalePhotoInputDto)
  supplementPhotos?: AfterSalePhotoInputDto[];

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

export class UploadAfterSalePhotoDto {
  @IsEnum(AfterSalePhotoStage)
  stage!: AfterSalePhotoStage;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class SubmitAfterSaleEvidenceDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AfterSalePhotoInputDto)
  constructionPhotos?: AfterSalePhotoInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => AfterSalePhotoInputDto)
  supplementPhotos?: AfterSalePhotoInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  evidenceNote?: string;
}

export class CreateAfterSaleCostDto {
  @IsEnum(AfterSaleCostCategory)
  category!: AfterSaleCostCategory;

  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  paymentRecordId?: string;
}

export class ReverseAfterSaleCostDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}
