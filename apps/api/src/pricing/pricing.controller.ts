/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CalculatePricingDto } from "./dto/calculate-pricing.dto";
import {
  CreateVehicleModelMappingDto,
  CreateVehiclePriceClassDto,
  ImportVehicleModelMappingsDto,
  ListVehicleMappingsDto,
  ResolveVehiclePriceClassDto
} from "./dto/vehicle-pricing.dto";
import { PricingService, type PricingAuthenticatedUser } from "./pricing.service";
import { CreatePricingRuleSetDto, ListPricingRuleSetsDto, PublishPricingRuleSetDto, RuleSetStoreDto } from "./dto/pricing-rules.dto";
import { PricingRulesService } from "./pricing-rules.service";
import { VehiclePricingService } from "./vehicle-pricing.service";
import { CostEstimatorService } from "./cost-estimator.service";
import { EstimateCostDto } from "./dto/estimate-cost.dto";
import { CopyPricingTemplateDto, CreatePricingTemplateDto, CreatePricingTemplateVersionDto } from "./dto/pricing-template.dto";
import { PricingTemplateService } from "./pricing-template.service";
import { PricingRolloutService } from "./pricing-rollout.service";
import { SetPricingRolloutDto } from "./dto/pricing-rollout.dto";

type AuthRequest = Request & { user: PricingAuthenticatedUser };

@UseGuards(JwtAuthGuard)
@Controller("pricing")
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly vehiclePricing: VehiclePricingService,
    private readonly pricingRules: PricingRulesService,
    private readonly costs: CostEstimatorService,
    private readonly templates: PricingTemplateService,
    private readonly rollout: PricingRolloutService
  ) {}

  @Post("calculate")
  calculate(@Req() req: AuthRequest, @Body() dto: CalculatePricingDto) {
    return this.pricing.calculate(req.user, dto);
  }

  @Post("estimate-cost")
  estimateCost(@Req() req: AuthRequest, @Body() dto: EstimateCostDto) {
    return this.costs.estimate(req.user, dto);
  }

  @Get("templates")
  listTemplates(@Req() req: AuthRequest) {
    return this.templates.list(req.user);
  }

  @Get("rollout")
  getRollout(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.rollout.get(req.user, storeId);
  }

  @Post("rollout")
  setRollout(@Req() req: AuthRequest, @Body() dto: SetPricingRolloutDto) {
    return this.rollout.set(req.user, dto);
  }

  @Post("templates")
  createTemplate(@Req() req: AuthRequest, @Body() dto: CreatePricingTemplateDto) {
    return this.templates.create(req.user, dto);
  }

  @Post("templates/:templateId/versions")
  createTemplateVersion(@Req() req: AuthRequest, @Param("templateId") templateId: string, @Body() dto: CreatePricingTemplateVersionDto) {
    return this.templates.createVersion(req.user, templateId, dto);
  }

  @Post("templates/:templateId/versions/:versionId/publish")
  publishTemplateVersion(@Req() req: AuthRequest, @Param("templateId") templateId: string, @Param("versionId") versionId: string) {
    return this.templates.publishVersion(req.user, templateId, versionId);
  }

  @Post("templates/:templateId/versions/:versionId/copy-to-store")
  copyTemplateToStore(@Req() req: AuthRequest, @Param("templateId") templateId: string, @Param("versionId") versionId: string, @Body() dto: CopyPricingTemplateDto) {
    return this.templates.copyToStore(req.user, templateId, versionId, dto);
  }

  @Get("rule-sets")
  listRuleSets(@Req() req: AuthRequest, @Query() query: ListPricingRuleSetsDto) {
    return this.pricingRules.list(req.user, query);
  }

  @Post("rule-sets/default-draft")
  createDefaultRuleSet(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.pricingRules.createDefaultDraft(req.user, storeId);
  }

  @Post("rule-sets")
  createRuleSet(@Req() req: AuthRequest, @Body() dto: CreatePricingRuleSetDto) {
    return this.pricingRules.createDraft(req.user, dto);
  }

  @Post("rule-sets/:id/publish")
  publishRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: PublishPricingRuleSetDto) {
    return this.pricingRules.publish(req.user, dto.storeId, id);
  }

  @Post("rule-sets/:id/validate")
  validateRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: RuleSetStoreDto) {
    return this.pricingRules.validate(req.user, dto.storeId, id);
  }

  @Post("rule-sets/:id/retire")
  retireRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: RuleSetStoreDto) {
    return this.pricingRules.retire(req.user, dto.storeId, id);
  }

  @Post("rule-sets/:id/copy")
  copyRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: RuleSetStoreDto) {
    return this.pricingRules.copy(req.user, dto.storeId, id);
  }

  @Post("rule-sets/:id/simulate")
  simulateRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CalculatePricingDto) {
    return this.pricing.calculate(req.user, { ...dto, ruleSetId: id });
  }

  @Get("vehicle-classes")
  listVehicleClasses(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.vehiclePricing.listClasses(req.user, storeId);
  }

  @Post("vehicle-classes")
  createVehicleClass(@Req() req: AuthRequest, @Body() dto: CreateVehiclePriceClassDto) {
    return this.vehiclePricing.createClass(req.user, dto);
  }

  @Post("vehicle-model-mappings")
  createVehicleMapping(@Req() req: AuthRequest, @Body() dto: CreateVehicleModelMappingDto) {
    return this.vehiclePricing.createMapping(req.user, dto);
  }

  @Get("vehicle-model-mappings")
  listVehicleMappings(@Req() req: AuthRequest, @Query() query: ListVehicleMappingsDto) {
    return this.vehiclePricing.listMappings(req.user, query.storeId);
  }

  @Post("vehicle-model-mappings/import")
  importVehicleMappings(@Req() req: AuthRequest, @Body() dto: ImportVehicleModelMappingsDto) {
    return this.vehiclePricing.importMappings(req.user, dto);
  }

  @Get("vehicle-model-mappings/unmatched")
  listUnmatchedVehicles(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.vehiclePricing.listUnmatchedVehicles(req.user, storeId);
  }

  @Post("vehicle-classify")
  resolveVehicleClass(@Req() req: AuthRequest, @Body() dto: ResolveVehiclePriceClassDto) {
    return this.vehiclePricing.resolve(req.user, dto);
  }
}
