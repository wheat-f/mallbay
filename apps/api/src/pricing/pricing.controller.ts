/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CalculatePricingDto } from "./dto/calculate-pricing.dto";
import {
  CreateVehicleModelMappingDto,
  CreateVehiclePriceClassDto,
  ImportVehicleModelMappingsDto,
  ListVehicleMappingsDto,
  ResolveVehiclePriceClassDto,
  UpdateVehicleModelMappingDto,
  UpdateVehiclePriceClassDto
} from "./dto/vehicle-pricing.dto";
import { PricingService, type PricingAuthenticatedUser } from "./pricing.service";
import { CreatePricingRuleSetDto, ListPricingRuleSetsDto, PublishPricingRuleSetDto, RuleSetStoreDto, UpdatePricingRuleSetDto } from "./dto/pricing-rules.dto";
import { VehiclePricingService } from "./vehicle-pricing.service";
import { CostEstimatorService } from "./cost-estimator.service";
import { EstimateCostDto } from "./dto/estimate-cost.dto";
import { CopyPricingTemplateDto, CreatePricingTemplateDto, CreatePricingTemplateVersionDto } from "./dto/pricing-template.dto";
import { SetPricingRolloutDto } from "./dto/pricing-rollout.dto";
import { PricingDecision } from "./domain/pricing-decision";
import { Inject } from "@nestjs/common";
import { PRICING_GOVERNANCE, type PricingGovernance } from "./domain/pricing-governance";
import { CreateConstructionServiceItemDto, CreatePositionCostRateVersionDto, StoreScopedDto, UpdateConstructionServiceItemDto, UpdatePositionCostRateVersionDto } from "./dto/construction-cost-config.dto";

type AuthRequest = Request & { user: PricingAuthenticatedUser };

@UseGuards(JwtAuthGuard)
@Controller("pricing")
export class PricingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly pricingDecision: PricingDecision,
    private readonly vehiclePricing: VehiclePricingService,
    private readonly costs: CostEstimatorService,
    @Inject(PRICING_GOVERNANCE) private readonly governance: PricingGovernance
  ) {}

  @Post("calculate")
  calculate(@Req() req: AuthRequest, @Body() dto: CalculatePricingDto) {
    return this.pricingDecision.decide(req.user, dto);
  }

  @Post("estimate-cost")
  estimateCost(@Req() req: AuthRequest, @Body() dto: EstimateCostDto) {
    return this.costs.estimate(req.user, dto);
  }

  @Get("construction-service-items")
  listConstructionServiceItems(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.governance.listConstructionServiceItems(req.user, storeId);
  }

  @Post("construction-service-items")
  createConstructionServiceItem(@Req() req: AuthRequest, @Body() dto: CreateConstructionServiceItemDto) {
    return this.governance.createConstructionServiceItem(req.user, dto);
  }

  @Patch("construction-service-items/:id")
  updateConstructionServiceItem(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateConstructionServiceItemDto) {
    return this.governance.updateConstructionServiceItem(req.user, id, dto);
  }

  @Get("position-cost-rate-versions")
  listPositionCostRateVersions(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.governance.listPositionCostRateVersions(req.user, storeId);
  }

  @Post("position-cost-rate-versions")
  createPositionCostRateVersion(@Req() req: AuthRequest, @Body() dto: CreatePositionCostRateVersionDto) {
    return this.governance.createPositionCostRateVersion(req.user, dto);
  }

  @Patch("position-cost-rate-versions/:id")
  updatePositionCostRateVersion(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdatePositionCostRateVersionDto) {
    return this.governance.updatePositionCostRateVersion(req.user, id, dto);
  }

  @Post("position-cost-rate-versions/:id/publish")
  publishPositionCostRateVersion(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: StoreScopedDto) {
    return this.governance.publishPositionCostRateVersion(req.user, dto.storeId, id);
  }

  @Get("templates")
  listTemplates(@Req() req: AuthRequest) {
    return this.governance.listTemplates(req.user);
  }

  @Get("rollout")
  getRollout(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.governance.getRollout(req.user, storeId);
  }

  @Get("rollout/precheck")
  precheckRollout(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.governance.precheckRollout(req.user, storeId);
  }

  @Get("rollout/migration-precheck")
  migrationPrecheck(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.governance.migrationPrecheckRollout(req.user, storeId);
  }

  @Post("rollout")
  setRollout(@Req() req: AuthRequest, @Body() dto: SetPricingRolloutDto) {
    return this.governance.setRollout(req.user, dto);
  }

  @Post("templates")
  createTemplate(@Req() req: AuthRequest, @Body() dto: CreatePricingTemplateDto) {
    return this.governance.createTemplate(req.user, dto);
  }

  @Post("templates/:templateId/versions")
  createTemplateVersion(@Req() req: AuthRequest, @Param("templateId") templateId: string, @Body() dto: CreatePricingTemplateVersionDto) {
    return this.governance.createTemplateVersion(req.user, templateId, dto);
  }

  @Post("templates/:templateId/versions/:versionId/publish")
  publishTemplateVersion(@Req() req: AuthRequest, @Param("templateId") templateId: string, @Param("versionId") versionId: string) {
    return this.governance.publishTemplateVersion(req.user, templateId, versionId);
  }

  @Post("templates/:templateId/versions/:versionId/copy-to-store")
  copyTemplateToStore(@Req() req: AuthRequest, @Param("templateId") templateId: string, @Param("versionId") versionId: string, @Body() dto: CopyPricingTemplateDto) {
    return this.governance.copyTemplateToStore(req.user, templateId, versionId, dto);
  }

  @Get("rule-sets")
  listRuleSets(@Req() req: AuthRequest, @Query() query: ListPricingRuleSetsDto) {
    return this.governance.listRuleSets(req.user, query);
  }

  @Get("rule-sets/:id")
  getRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Query("storeId") storeId: string) {
    return this.governance.getRuleSet(req.user, storeId, id);
  }

  @Patch("rule-sets/:id")
  updateRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdatePricingRuleSetDto) {
    return this.governance.updateRuleSet(req.user, id, dto);
  }

  @Post("rule-sets/default-draft")
  createDefaultRuleSet(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.governance.createDefaultRuleSet(req.user, storeId);
  }

  @Post("rule-sets")
  createRuleSet(@Req() req: AuthRequest, @Body() dto: CreatePricingRuleSetDto) {
    return this.governance.createRuleSet(req.user, dto);
  }

  @Post("rule-sets/:id/publish")
  publishRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: PublishPricingRuleSetDto) {
    return this.governance.publishRuleSet(req.user, dto.storeId, id);
  }

  @Post("rule-sets/:id/validate")
  validateRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: RuleSetStoreDto) {
    return this.governance.validateRuleSet(req.user, dto.storeId, id);
  }

  @Post("rule-sets/:id/retire")
  retireRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: RuleSetStoreDto) {
    return this.governance.retireRuleSet(req.user, dto.storeId, id);
  }

  @Post("rule-sets/:id/copy")
  copyRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: RuleSetStoreDto) {
    return this.governance.copyRuleSet(req.user, dto.storeId, id);
  }

  @Post("rule-sets/:id/simulate")
  simulateRuleSet(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CalculatePricingDto) {
    return this.pricingDecision.decide(req.user, { ...dto, ruleSetId: id });
  }

  @Get("vehicle-classes")
  listVehicleClasses(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.vehiclePricing.listClasses(req.user, storeId);
  }

  @Post("vehicle-classes")
  createVehicleClass(@Req() req: AuthRequest, @Body() dto: CreateVehiclePriceClassDto) {
    return this.vehiclePricing.createClass(req.user, dto);
  }

  @Patch("vehicle-classes/:id")
  updateVehicleClass(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateVehiclePriceClassDto) {
    return this.vehiclePricing.updateClass(req.user, id, dto);
  }

  @Post("vehicle-model-mappings")
  createVehicleMapping(@Req() req: AuthRequest, @Body() dto: CreateVehicleModelMappingDto) {
    return this.vehiclePricing.createMapping(req.user, dto);
  }

  @Patch("vehicle-model-mappings/:id")
  updateVehicleMapping(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateVehicleModelMappingDto) {
    return this.vehiclePricing.updateMapping(req.user, id, dto);
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
