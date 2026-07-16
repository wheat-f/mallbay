import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsDateString, IsDefined, IsEnum, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { PricingRuleActionType, PricingRuleGroup, PricingRuleTarget } from "@prisma/client";

export class PricingRuleConditionDto {
  @IsString()
  field!: string;

  @IsString()
  operator!: string;

  @IsDefined()
  value!: string | number | Array<string | number>;
}

export class CreatePricingRuleDto {
  @IsEnum(PricingRuleGroup)
  group!: PricingRuleGroup;

  @IsEnum(PricingRuleTarget)
  target!: PricingRuleTarget;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PricingRuleConditionDto)
  conditions!: PricingRuleConditionDto[];

  @IsEnum(PricingRuleActionType)
  actionType!: PricingRuleActionType;

  @Type(() => Number)
  @IsInt()
  actionValue!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class PricingProtectionPolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  normalDeviationBps!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  approvalDeviationBps!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumMarginBps!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  blockBelowMarginBps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  softHoldHours?: number;

  @IsOptional()
  @IsBoolean()
  allowSpecialApproval?: boolean;

  @IsObject()
  internalLaborCostConfig!: Record<string, unknown>;
}

export class CreatePricingRuleSetDto {
  @IsString()
  storeId!: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePricingRuleDto)
  rules!: CreatePricingRuleDto[];

  @ValidateNested()
  @Type(() => PricingProtectionPolicyDto)
  protectionPolicy!: PricingProtectionPolicyDto;
}

export class ListPricingRuleSetsDto {
  @IsString()
  storeId!: string;
}

export class PublishPricingRuleSetDto {
  @IsString()
  storeId!: string;
}

export class RuleSetStoreDto {
  @IsString()
  storeId!: string;
}
