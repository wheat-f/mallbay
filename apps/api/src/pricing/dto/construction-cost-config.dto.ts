import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { DictionaryStatus } from "@prisma/client";

export class StoreScopedDto {
  @IsString()
  storeId!: string;
}

export class CreateConstructionServiceItemDto extends StoreScopedDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(50)
  constructionTypeCode!: string;

  @IsString()
  @MaxLength(50)
  serviceGroupCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultProductCategoryCode?: string;
}

export class UpdateConstructionServiceItemDto extends StoreScopedDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  constructionTypeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  serviceGroupCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  defaultProductCategoryCode?: string;

  @IsOptional()
  @IsEnum(DictionaryStatus)
  status?: DictionaryStatus;
}

export class PositionCostRateDto {
  @IsString()
  @MaxLength(50)
  positionTypeCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  hourlyCostCents!: number;
}

export class CreatePositionCostRateVersionDto extends StoreScopedDto {
  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PositionCostRateDto)
  rates!: PositionCostRateDto[];
}

export class UpdatePositionCostRateVersionDto extends CreatePositionCostRateVersionDto {}
