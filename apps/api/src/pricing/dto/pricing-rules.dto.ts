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

export class ConstructionStandardCrewRoleDto {
  @IsString()
  @MaxLength(50)
  positionTypeCode!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  workerCount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  workMinutes!: number;
}

export class ConstructionStandardLineDto {
  @IsString()
  serviceItemId!: string;

  @IsOptional()
  @IsString()
  vehiclePriceClassId?: string;

  @IsString()
  @MaxLength(50)
  constructionLocationCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  productCategoryCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  salesUnitCode?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  quantityFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  quantityTo?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  baseConstructionChargeCents!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  standardWorkMinutes!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  addonChargeCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  addonWorkMinutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standardCommissionCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standardAllowanceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConstructionStandardCrewRoleDto)
  crewRoles!: ConstructionStandardCrewRoleDto[];
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

  @IsOptional()
  @IsString()
  positionCostRateVersionId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConstructionStandardLineDto)
  constructionStandards?: ConstructionStandardLineDto[];

  @ValidateNested()
  @Type(() => PricingProtectionPolicyDto)
  protectionPolicy!: PricingProtectionPolicyDto;
}

export class UpdatePricingRuleSetDto extends CreatePricingRuleSetDto {}

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
