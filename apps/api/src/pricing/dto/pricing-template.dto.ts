import { Type } from "class-transformer";
import { IsArray, IsDateString, IsDefined, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { CreatePricingRuleDto, PricingProtectionPolicyDto } from "./pricing-rules.dto";

export class CreatePricingTemplateDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class CreatePricingTemplateVersionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePricingRuleDto)
  rules!: CreatePricingRuleDto[];

  @IsDefined()
  @IsObject()
  protectionPolicy!: PricingProtectionPolicyDto;
}

export class CopyPricingTemplateDto {
  @IsString()
  storeId!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
