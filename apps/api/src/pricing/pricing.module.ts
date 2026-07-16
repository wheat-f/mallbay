import { Module } from "@nestjs/common";
import { PricingController } from "./pricing.controller";
import { PricingService } from "./pricing.service";
import { VehiclePricingService } from "./vehicle-pricing.service";
import { PricingRulesService } from "./pricing-rules.service";
import { CostEstimatorService } from "./cost-estimator.service";
import { PricingTemplateService } from "./pricing-template.service";
import { PricingRolloutService } from "./pricing-rollout.service";
import { ConstructionCostConfigService } from "./construction-cost-config.service";
import { ObservabilityModule } from "../observability/observability.module";

@Module({
  imports: [ObservabilityModule],
  controllers: [PricingController],
  providers: [PricingService, VehiclePricingService, PricingRulesService, CostEstimatorService, PricingTemplateService, PricingRolloutService, ConstructionCostConfigService],
  exports: [PricingService, VehiclePricingService, PricingRulesService, CostEstimatorService, PricingTemplateService, PricingRolloutService, ConstructionCostConfigService]
})
export class PricingModule {}
