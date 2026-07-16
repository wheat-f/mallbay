import { request } from "../../lib/request";

export type PricingRuleSetSummary = {
  id: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "RETIRED";
  effectiveFrom: string;
  effectiveTo?: string | null;
  rules?: unknown[];
  protectionPolicy?: unknown | null;
};

export type PricingRuleSetPayload = {
  storeId: string;
  effectiveFrom: string;
  effectiveTo?: string;
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
  guard?: { decision: "NORMAL" | "APPROVAL_REQUIRED" | "BLOCKED" };
};

export type VehiclePriceClass = { id: string; code: string; name: string; isDefault: boolean; status: string };
export type VehicleModelMapping = { id: string; brand?: string | null; modelKeyword: string; yearFrom?: number | null; yearTo?: number | null; priority: number; vehiclePriceClass?: VehiclePriceClass };
export type CostEstimateResponse = { lines: Array<{ productId: string; quantity: number; source: string; estimatedCostCents: number; warning?: string }>; materialCostCents: number; estimatedCostCents: number; hasMissingCost: boolean };
export type PricingTemplate = { id: string; code: string; name: string; description?: string | null; status: string; versions: Array<{ id: string; version: number; publishedAt?: string | null }> };
export type PricingRollout = { id: string; name: string; pricingRolloutMode: "LEGACY" | "SHADOW" | "ACTIVE" };

export const pricingApi = {
  ruleSets: (storeId: string) =>
    request<PricingRuleSetSummary[]>(`/pricing/rule-sets?storeId=${encodeURIComponent(storeId)}`),

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
  vehicleMappings: (storeId: string) => request<VehicleModelMapping[]>(`/pricing/vehicle-model-mappings?storeId=${encodeURIComponent(storeId)}`),
  createVehicleMapping: (payload: { storeId: string; brand?: string; modelKeyword: string; yearFrom?: number; yearTo?: number; vehiclePriceClassId: string; priority?: number }) =>
    request<VehicleModelMapping>("/pricing/vehicle-model-mappings", { method: "POST", body: JSON.stringify(payload) }),
  unmatchedVehicles: (storeId: string) => request<Array<{ id: string; carModel: string; carPlate?: string | null; customerId: string; suggestedMapping?: { mappingId: string; modelKeyword: string; source: "KEYWORD"; vehiclePriceClass?: VehiclePriceClass } | null }>>(`/pricing/vehicle-model-mappings/unmatched?storeId=${encodeURIComponent(storeId)}`),
  resolveVehicleClass: (payload: { storeId: string; model: string; brand?: string; year?: number }) =>
    request<{ source: "AUTO" | "AUTO_DEFAULT" | "UNMATCHED" | "MANUAL"; vehiclePriceClass: VehiclePriceClass | null; matchedMappingId: string | null }>("/pricing/vehicle-classify", { method: "POST", body: JSON.stringify(payload) }),
  estimateCost: (payload: { storeId: string; lines: Array<{ productId: string; quantity: number; salesUnit?: string }>; laborCostCents?: number }) =>
    request<CostEstimateResponse>("/pricing/estimate-cost", { method: "POST", body: JSON.stringify(payload) }),
  templates: () => request<PricingTemplate[]>("/pricing/templates"),
  createTemplate: (payload: { code: string; name: string; description?: string }) => request<PricingTemplate>("/pricing/templates", { method: "POST", body: JSON.stringify(payload) }),
  createTemplateVersion: (templateId: string, payload: { rules: unknown[]; protectionPolicy: Record<string, unknown> }) => request<{ id: string; version: number }>(`/pricing/templates/${templateId}/versions`, { method: "POST", body: JSON.stringify(payload) }),
  publishTemplateVersion: (templateId: string, versionId: string) => request<unknown>(`/pricing/templates/${templateId}/versions/${versionId}/publish`, { method: "POST" }),
  rollout: (storeId: string) => request<PricingRollout>(`/pricing/rollout?storeId=${encodeURIComponent(storeId)}`),
  setRollout: (payload: { storeId: string; mode: PricingRollout["pricingRolloutMode"] }) => request<PricingRollout>("/pricing/rollout", { method: "POST", body: JSON.stringify(payload) })
};
