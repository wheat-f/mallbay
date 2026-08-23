import { Inject, Injectable } from "@nestjs/common";
import type { PricingAuthenticatedUser } from "../pricing.service";
import type {
  CreatePricingRuleSetDto,
  ListPricingRuleSetsDto,
  UpdatePricingRuleSetDto
} from "../dto/pricing-rules.dto";
import type {
  CopyPricingTemplateDto,
  CreatePricingTemplateDto,
  CreatePricingTemplateVersionDto
} from "../dto/pricing-template.dto";
import type { SetPricingRolloutDto } from "../dto/pricing-rollout.dto";
import type {
  CreateConstructionServiceItemDto,
  CreatePositionCostRateVersionDto,
  StoreScopedDto,
  UpdateConstructionServiceItemDto,
  UpdatePositionCostRateVersionDto
} from "../dto/construction-cost-config.dto";
import { ConstructionCostConfigService } from "../construction-cost-config.service";
import { PricingRolloutService } from "../pricing-rollout.service";
import { PricingRulesService } from "../pricing-rules.service";
import { PricingTemplateService } from "../pricing-template.service";

export const PRICING_GOVERNANCE = Symbol("PRICING_GOVERNANCE");

/**
 * Governance seam for versioned pricing rules, templates, rollout readiness,
 * and construction cost configuration. Calculation and vehicle classification
 * remain behind their independent pricing seams.
 */
@Injectable()
export class PricingGovernance {
  constructor(
    @Inject(PricingRulesService) private readonly rules: PricingRulesService,
    @Inject(PricingTemplateService) private readonly templates: PricingTemplateService,
    @Inject(PricingRolloutService) private readonly rollout: PricingRolloutService,
    @Inject(ConstructionCostConfigService) private readonly constructionCosts: ConstructionCostConfigService
  ) {}

  listRuleSets(user: PricingAuthenticatedUser, dto: ListPricingRuleSetsDto) {
    return this.rules.list(user, dto);
  }

  getRuleSet(user: PricingAuthenticatedUser, storeId: string, id: string) {
    return this.rules.get(user, storeId, id);
  }

  updateRuleSet(user: PricingAuthenticatedUser, id: string, dto: UpdatePricingRuleSetDto) {
    return this.rules.updateDraft(user, id, dto);
  }

  createDefaultRuleSet(user: PricingAuthenticatedUser, storeId: string) {
    return this.rules.createDefaultDraft(user, storeId);
  }

  createRuleSet(user: PricingAuthenticatedUser, dto: CreatePricingRuleSetDto) {
    return this.rules.createDraft(user, dto);
  }

  publishRuleSet(user: PricingAuthenticatedUser, storeId: string, id: string) {
    return this.rules.publish(user, storeId, id);
  }

  validateRuleSet(user: PricingAuthenticatedUser, storeId: string, id: string) {
    return this.rules.validate(user, storeId, id);
  }

  retireRuleSet(user: PricingAuthenticatedUser, storeId: string, id: string) {
    return this.rules.retire(user, storeId, id);
  }

  copyRuleSet(user: PricingAuthenticatedUser, storeId: string, id: string) {
    return this.rules.copy(user, storeId, id);
  }

  listTemplates(user: PricingAuthenticatedUser) {
    return this.templates.list(user);
  }

  createTemplate(user: PricingAuthenticatedUser, dto: CreatePricingTemplateDto) {
    return this.templates.create(user, dto);
  }

  createTemplateVersion(user: PricingAuthenticatedUser, templateId: string, dto: CreatePricingTemplateVersionDto) {
    return this.templates.createVersion(user, templateId, dto);
  }

  publishTemplateVersion(user: PricingAuthenticatedUser, templateId: string, versionId: string) {
    return this.templates.publishVersion(user, templateId, versionId);
  }

  copyTemplateToStore(user: PricingAuthenticatedUser, templateId: string, versionId: string, dto: CopyPricingTemplateDto) {
    return this.templates.copyToStore(user, templateId, versionId, dto);
  }

  getRollout(user: PricingAuthenticatedUser, storeId: string) {
    return this.rollout.get(user, storeId);
  }

  setRollout(user: PricingAuthenticatedUser, dto: SetPricingRolloutDto) {
    return this.rollout.set(user, dto);
  }

  precheckRollout(user: PricingAuthenticatedUser, storeId: string) {
    return this.rollout.precheck(user, storeId);
  }

  migrationPrecheckRollout(user: PricingAuthenticatedUser, storeId: string) {
    return this.rollout.migrationPrecheck(user, storeId);
  }

  listConstructionServiceItems(user: PricingAuthenticatedUser, storeId: string) {
    return this.constructionCosts.listServiceItems(user, storeId);
  }

  createConstructionServiceItem(user: PricingAuthenticatedUser, dto: CreateConstructionServiceItemDto) {
    return this.constructionCosts.createServiceItem(user, dto);
  }

  updateConstructionServiceItem(user: PricingAuthenticatedUser, id: string, dto: UpdateConstructionServiceItemDto) {
    return this.constructionCosts.updateServiceItem(user, id, dto);
  }

  listPositionCostRateVersions(user: PricingAuthenticatedUser, storeId: string) {
    return this.constructionCosts.listRateVersions(user, storeId);
  }

  createPositionCostRateVersion(user: PricingAuthenticatedUser, dto: CreatePositionCostRateVersionDto) {
    return this.constructionCosts.createRateVersion(user, dto);
  }

  updatePositionCostRateVersion(user: PricingAuthenticatedUser, id: string, dto: UpdatePositionCostRateVersionDto) {
    return this.constructionCosts.updateRateVersion(user, id, dto);
  }

  publishPositionCostRateVersion(user: PricingAuthenticatedUser, storeId: string, id: string) {
    return this.constructionCosts.publishRateVersion(user, storeId, id);
  }
}
