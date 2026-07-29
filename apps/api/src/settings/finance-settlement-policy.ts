import { BadRequestException } from "@nestjs/common";

export const FINANCE_SETTLEMENT_CAPABILITY = "finance.settlement";

export type FinanceSettlementPolicy = {
  actualInboundPricePriority: boolean;
  standardMaterialFallback: boolean;
  missingCostPolicy: "BLOCK_CONFIRMATION" | "ALLOW_TEMPORARY_COST_APPROVAL";
  commissionSource: "FINAL_WORKER_COMMISSION";
  settlementFreezeAfter: "SETTLED";
  adjustmentPolicy: "FINANCE_APPROVAL_ONLY";
};

export const DEFAULT_FINANCE_SETTLEMENT_POLICY: FinanceSettlementPolicy = {
  actualInboundPricePriority: true,
  standardMaterialFallback: true,
  missingCostPolicy: "BLOCK_CONFIRMATION",
  commissionSource: "FINAL_WORKER_COMMISSION",
  settlementFreezeAfter: "SETTLED",
  adjustmentPolicy: "FINANCE_APPROVAL_ONLY"
};

export function validateFinanceSettlementPolicy(payload: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  if (typeof payload.actualInboundPricePriority !== "boolean") errors.actualInboundPricePriority = "必须明确设置实际入库价优先策略";
  if (typeof payload.standardMaterialFallback !== "boolean") errors.standardMaterialFallback = "必须明确设置标准材料成本兜底策略";
  if (payload.missingCostPolicy !== "BLOCK_CONFIRMATION" && payload.missingCostPolicy !== "ALLOW_TEMPORARY_COST_APPROVAL") errors.missingCostPolicy = "成本缺失处理策略不合法";
  if (payload.commissionSource !== "FINAL_WORKER_COMMISSION") errors.commissionSource = "提成必须来自财务维护的最终提成";
  if (payload.settlementFreezeAfter !== "SETTLED") errors.settlementFreezeAfter = "结算冻结节点必须是 SETTLED";
  if (payload.adjustmentPolicy !== "FINANCE_APPROVAL_ONLY") errors.adjustmentPolicy = "成本调整必须由财务审批";
  return errors;
}

export function parseFinanceSettlementPolicy(payload: unknown): FinanceSettlementPolicy {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new BadRequestException("财务结算策略必须是对象");
  const errors = validateFinanceSettlementPolicy(payload as Record<string, unknown>);
  if (Object.keys(errors).length) throw new BadRequestException(Object.values(errors).join("；"));
  return payload as FinanceSettlementPolicy;
}

type ConfigVersionReader = { settingsConfigVersion?: unknown };

export async function loadPublishedFinanceSettlementPolicy(prisma: ConfigVersionReader, storeId: string) {
  const model = prisma.settingsConfigVersion as { findFirst?: (args: { where: Record<string, unknown>; orderBy: unknown }) => Promise<{ payload: unknown } | null> } | undefined;
  if (!model?.findFirst) return DEFAULT_FINANCE_SETTLEMENT_POLICY;
  const row = await model.findFirst({
    where: { capabilityCode: FINANCE_SETTLEMENT_CAPABILITY, scopeId: storeId, status: "PUBLISHED" },
    orderBy: [{ version: "desc" }]
  });
  if (!row) throw new BadRequestException("当前门店尚未发布财务结算策略");
  return parseFinanceSettlementPolicy(row.payload);
}