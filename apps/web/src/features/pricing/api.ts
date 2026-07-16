import { request } from "../../lib/request";

export type PricingRule = {
  id?: string;
  group: string;
  target: string;
  name: string;
  conditions: Array<{ field: string; operator: string; value: string | number | Array<string | number> }>;
  actionType: string;
  actionValue: number;
  priority: number;
  sortOrder: number;
  enabled: boolean;
};

export type PricingProtectionPolicy = {
  normalDeviationBps: number;
  approvalDeviationBps: number;
  minimumMarginBps: number;
  blockBelowMarginBps?: number | null;
  softHoldHours: number;
  allowSpecialApproval: boolean;
  internalLaborCostConfig: Record<string, unknown>;
};

export type PricingRuleSetSummary = {
  id: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  effectiveFrom: string;
  effectiveTo?: string | null;
  rules?: PricingRule[];
  protectionPolicy?: PricingProtectionPolicy | null;
  positionCostRateVersionId?: string | null;
  constructionStandards?: ConstructionStandard[];
};

export type ConstructionServiceItem = {
  id: string;
  code: string;
  name: string;
  constructionTypeCode: string;
  serviceGroupCode: string;
  defaultProductCategoryCode?: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export type PositionCostRate = { id?: string; positionTypeCode: string; hourlyCostCents: number };
export type PositionCostRateVersion = {
  id: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  effectiveFrom: string;
  effectiveTo?: string | null;
  rates: PositionCostRate[];
};

export type ConstructionStandardCrewRole = {
  positionTypeCode: string;
  workerCount: number;
  workMinutes: number;
};

export type ConstructionStandard = {
  id?: string;
  serviceItemId: string;
  vehiclePriceClassId?: string | null;
  constructionLocationCode: string;
  productCategoryCode?: string | null;
  salesUnitCode?: string | null;
  quantityFrom?: number | null;
  quantityTo?: number | null;
  baseConstructionChargeCents: number;
  standardWorkMinutes: number;
  addonChargeCents?: number;
  addonWorkMinutes?: number;
  standardCommissionCents?: number;
  standardAllowanceCents?: number;
  priority?: number;
  enabled?: boolean;
  crewRoles: ConstructionStandardCrewRole[];
  serviceItem?: ConstructionServiceItem;
  vehiclePriceClass?: VehiclePriceClass | null;
};

export type PricingRuleSetPayload = {
  storeId: string;
  effectiveFrom: string;
  effectiveTo?: string;
  positionCostRateVersionId?: string;
  constructionStandards?: Array<Omit<ConstructionStandard, "id" | "serviceItem" | "vehiclePriceClass">>;
  rules: Array<{
    group: string;
    target: string;
    name: string;
    conditions: Array<{ field: string; operator: string; value: string | number | Array<string | number> }>;
    actionType: string;
    actionValue: number;
    priority?: number;
    sortOrder?: number;
    enabled?: boolean;
  }>;
  protectionPolicy: {
    normalDeviationBps: number;
    approvalDeviationBps: number;
    minimumMarginBps: number;
    blockBelowMarginBps?: number;
    softHoldHours?: number;
    allowSpecialApproval?: boolean;
    internalLaborCostConfig: Record<string, unknown>;
  };
};

export type PricingCalculationPayload = {
  storeId: string;
  ruleSetId?: string;
  input: {
    ruleSetVersion: number;
    vehicleId?: string;
    vehicleClassCode?: string;
    constructionType: string;
    constructionLocation: string;
    effectiveAt?: string;
    baseLaborCostCents: number;
    lines: Array<{
      id: string;
      productId: string;
      category: string;
      brand: string;
      model: string;
      salesUnit: string;
      quantity: number;
      baseUnitPriceCents: number;
      minimumPriceCents?: number;
    }>;
  };
  rules?: unknown[];
  finalAmount?: {
    lines: Array<{ id: string; unitPriceCents: number }>;
    laborCostCents: number;
    estimatedCostCents?: number;
  };
};

export type PricingCalculationResponse = {
  mode: "SIMULATION";
  ruleSetId: string | null;
  pricingCalculationId: string | null;
  constructionChargeAvailable?: boolean;
  calculation: {
    ruleSetVersion: number;
    lines: Array<{
      id: string;
      productId: string;
      quantity: number;
      suggestedUnitPriceCents: number;
      suggestedAmountCents: number;
    }>;
    suggestedProductAmountCents: number;
    suggestedLaborCostCents: number;
    suggestedTotalCents: number;
    calculationSteps?: Array<{ stage: string; ruleId: string; ruleName: string; beforeCents: number; afterCents: number; lineId?: string }>;
  };
  rolloutMode?: "LEGACY" | "SHADOW" | "ACTIVE";
  shadowPricingCalculationId?: string | null;
  shadowComparison?: { legacyTotalCents: number; suggestedTotalCents: number; deltaTotalCents: number; deltaBps: number } | null;
  costEstimate?: {
    materialCostCents?: number;
    estimatedMaterialCostCents?: number;
    estimatedConstructionCostCents: number | null;
    estimatedTotalCostCents: number | null;
    hasMissingCost: boolean;
    costCompleteness: "COMPLETE" | "TEMPORARY" | "MISSING";
    reason?: string;
  };
  guard?: { decision: "NORMAL" | "APPROVAL_REQUIRED" | "BLOCKED" };
};

export type VehiclePriceClass = { id: string; code: string; name: string; isDefault: boolean; status: string };
export type VehicleModelMapping = { id: string; brand?: string | null; modelKeyword: string; yearFrom?: number | null; yearTo?: number | null; priority: number; status?: string; vehiclePriceClassId?: string; vehiclePriceClass?: VehiclePriceClass };
export type CostEstimateResponse = { lines: Array<{ productId: string; quantity: number; source: string; estimatedCostCents: number; warning?: string }>; materialCostCents: number; estimatedMaterialCostCents: number; estimatedCostCents: number; hasMissingCost: boolean; costCompleteness: "COMPLETE" | "MISSING" };
export type PricingTemplate = { id: string; code: string; name: string; description?: string | null; status: string; versions: Array<{ id: string; version: number; publishedAt?: string | null }> };
export type PricingRollout = { id: string; name: string; pricingRolloutMode: "LEGACY" | "SHADOW" | "ACTIVE" };
export type PricingRolloutPrecheck = { ready: boolean; errors: string[]; ruleSet: { id: string; version: number; standards: number; positionCostRateVersionId?: string | null } | null };
export type PricingMigrationPrecheck = PricingRolloutPrecheck & { orders: { totalOrders: number; legacyOrders: number; activeOrders: number; incompleteCostOrders: number; temporaryCostOrders: number }; warnings: string[] };

export const pricingApi = {
  ruleSets: (storeId: string) =>
    request<PricingRuleSetSummary[]>(`/pricing/rule-sets?storeId=${encodeURIComponent(storeId)}`),

  ruleSet: (id: string, storeId: string) =>
    request<PricingRuleSetSummary>(`/pricing/rule-sets/${id}?storeId=${encodeURIComponent(storeId)}`),

  updateRuleSet: (id: string, payload: PricingRuleSetPayload) =>
    request<PricingRuleSetSummary>(`/pricing/rule-sets/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  calculate: (payload: PricingCalculationPayload) =>
    request<PricingCalculationResponse>("/pricing/calculate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createDefaultRuleSet: (storeId: string) => request<{ created: boolean; ruleSet: PricingRuleSetSummary }>(`/pricing/rule-sets/default-draft?storeId=${encodeURIComponent(storeId)}`, { method: "POST" }),

  createRuleSet: (payload: PricingRuleSetPayload) =>
    request<PricingRuleSetSummary>("/pricing/rule-sets", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  publishRuleSet: (id: string, storeId: string) =>
    request<PricingRuleSetSummary>(`/pricing/rule-sets/${id}/publish`, {
      method: "POST",
      body: JSON.stringify({ storeId })
    }),

  validateRuleSet: (id: string, storeId: string) =>
    request<{ valid: boolean; errors: string[]; status: string; version: number }>(`/pricing/rule-sets/${id}/validate`, {
      method: "POST",
      body: JSON.stringify({ storeId })
    }),

  retireRuleSet: (id: string, storeId: string) =>
    request<PricingRuleSetSummary>(`/pricing/rule-sets/${id}/retire`, {
      method: "POST",
      body: JSON.stringify({ storeId })
    }),

  copyRuleSet: (id: string, storeId: string) =>
    request<PricingRuleSetSummary>(`/pricing/rule-sets/${id}/copy`, {
      method: "POST",
      body: JSON.stringify({ storeId })
    }),

  vehicleClasses: (storeId: string) => request<VehiclePriceClass[]>(`/pricing/vehicle-classes?storeId=${encodeURIComponent(storeId)}`),
  createVehicleClass: (payload: { storeId: string; code: string; name: string; description?: string; sortOrder?: number; isDefault?: boolean }) =>
    request<VehiclePriceClass>("/pricing/vehicle-classes", { method: "POST", body: JSON.stringify(payload) }),
  updateVehicleClass: (id: string, payload: { storeId: string; code?: string; name?: string; description?: string; sortOrder?: number; isDefault?: boolean; status?: string }) =>
    request<VehiclePriceClass>(`/pricing/vehicle-classes/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  vehicleMappings: (storeId: string) => request<VehicleModelMapping[]>(`/pricing/vehicle-model-mappings?storeId=${encodeURIComponent(storeId)}`),
  createVehicleMapping: (payload: { storeId: string; brand?: string; modelKeyword: string; yearFrom?: number; yearTo?: number; vehiclePriceClassId: string; priority?: number }) =>
    request<VehicleModelMapping>("/pricing/vehicle-model-mappings", { method: "POST", body: JSON.stringify(payload) }),
  updateVehicleMapping: (id: string, payload: { storeId: string; brand?: string; modelKeyword?: string; yearFrom?: number; yearTo?: number; vehiclePriceClassId?: string; priority?: number; status?: string }) =>
    request<VehicleModelMapping>(`/pricing/vehicle-model-mappings/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  unmatchedVehicles: (storeId: string) => request<Array<{ id: string; carModel: string; carPlate?: string | null; customerId: string; suggestedMapping?: { mappingId: string; modelKeyword: string; source: "KEYWORD"; vehiclePriceClass?: VehiclePriceClass } | null }>>(`/pricing/vehicle-model-mappings/unmatched?storeId=${encodeURIComponent(storeId)}`),
  resolveVehicleClass: (payload: { storeId: string; model: string; brand?: string; year?: number }) =>
    request<{ source: "AUTO" | "AUTO_DEFAULT" | "UNMATCHED" | "MANUAL"; vehiclePriceClass: VehiclePriceClass | null; matchedMappingId: string | null }>("/pricing/vehicle-classify", { method: "POST", body: JSON.stringify(payload) }),
  estimateCost: (payload: { storeId: string; lines: Array<{ productId: string; quantity: number; salesUnit?: string }> }) =>
    request<CostEstimateResponse>("/pricing/estimate-cost", { method: "POST", body: JSON.stringify(payload) }),
  constructionServiceItems: (storeId: string) => request<ConstructionServiceItem[]>(`/pricing/construction-service-items?storeId=${encodeURIComponent(storeId)}`),
  createConstructionServiceItem: (payload: { storeId: string; code: string; name: string; constructionTypeCode: string; serviceGroupCode: string; defaultProductCategoryCode?: string }) =>
    request<ConstructionServiceItem>("/pricing/construction-service-items", { method: "POST", body: JSON.stringify(payload) }),
  updateConstructionServiceItem: (id: string, payload: { storeId: string; name?: string; constructionTypeCode?: string; serviceGroupCode?: string; defaultProductCategoryCode?: string; status?: "ACTIVE" | "INACTIVE" }) =>
    request<ConstructionServiceItem>(`/pricing/construction-service-items/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  positionCostRateVersions: (storeId: string) => request<PositionCostRateVersion[]>(`/pricing/position-cost-rate-versions?storeId=${encodeURIComponent(storeId)}`),
  createPositionCostRateVersion: (payload: { storeId: string; effectiveFrom: string; effectiveTo?: string; rates: Array<{ positionTypeCode: string; hourlyCostCents: number }> }) =>
    request<PositionCostRateVersion>("/pricing/position-cost-rate-versions", { method: "POST", body: JSON.stringify(payload) }),
  updatePositionCostRateVersion: (id: string, payload: { storeId: string; effectiveFrom: string; effectiveTo?: string; rates: Array<{ positionTypeCode: string; hourlyCostCents: number }> }) =>
    request<PositionCostRateVersion>(`/pricing/position-cost-rate-versions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  publishPositionCostRateVersion: (id: string, storeId: string) =>
    request<PositionCostRateVersion>(`/pricing/position-cost-rate-versions/${id}/publish`, { method: "POST", body: JSON.stringify({ storeId }) }),
  templates: () => request<PricingTemplate[]>("/pricing/templates"),
  createTemplate: (payload: { code: string; name: string; description?: string }) => request<PricingTemplate>("/pricing/templates", { method: "POST", body: JSON.stringify(payload) }),
  createTemplateVersion: (templateId: string, payload: { rules: unknown[]; protectionPolicy: Record<string, unknown> }) => request<{ id: string; version: number }>(`/pricing/templates/${templateId}/versions`, { method: "POST", body: JSON.stringify(payload) }),
  publishTemplateVersion: (templateId: string, versionId: string) => request<unknown>(`/pricing/templates/${templateId}/versions/${versionId}/publish`, { method: "POST" }),
  rollout: (storeId: string) => request<PricingRollout>(`/pricing/rollout?storeId=${encodeURIComponent(storeId)}`),
  rolloutPrecheck: (storeId: string) => request<PricingRolloutPrecheck>(`/pricing/rollout/precheck?storeId=${encodeURIComponent(storeId)}`),
  pricingMigrationPrecheck: (storeId: string) => request<PricingMigrationPrecheck>(`/pricing/rollout/migration-precheck?storeId=${encodeURIComponent(storeId)}`),
  setRollout: (payload: { storeId: string; mode: PricingRollout["pricingRolloutMode"] }) => request<PricingRollout>("/pricing/rollout", { method: "POST", body: JSON.stringify(payload) })
};
