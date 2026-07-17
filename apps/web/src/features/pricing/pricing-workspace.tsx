"use client";

import { CheckCircleFilled, ClockCircleOutlined, WarningFilled } from "@ant-design/icons";
import { Button, Steps, Tag, Typography } from "antd";
import type { PricingRule } from "./api";

export const PRICING_STEPS = [
  { title: "产品建议价规则", description: "设置产品建议价调整" },
  { title: "车辆类型", description: "从车辆档案带入车型类型" },
  { title: "改价审批与保护", description: "设置偏差和毛利底线" },
  { title: "试算并发布", description: "检查影响后正式生效" }
] as const;

export const CONDITION_FIELD_OPTIONS = [
  { value: "productCategory", label: "产品类别" },
  { value: "productBrand", label: "产品品牌" },
  { value: "productModel", label: "产品型号" },
  { value: "productId", label: "指定产品" },
  { value: "salesUnit", label: "销售单位" },
  { value: "quantity", label: "购买数量" },
  { value: "vehicleTypeCode", label: "车辆类型" },
  { value: "constructionType", label: "施工项目" },
  { value: "constructionLocation", label: "施工地点" },
  { value: "lineCount", label: "产品种类数" },
  { value: "totalQuantity", label: "产品总数量" }
] as const;

export const OPERATOR_OPTIONS = [
  { value: "EQ", label: "为" },
  { value: "IN", label: "属于" },
  { value: "BETWEEN", label: "介于" },
  { value: "GTE", label: "不少于" },
  { value: "LTE", label: "不超过" }
] as const;

const NUMERIC_CONDITION_FIELDS = new Set(["quantity", "lineCount", "totalQuantity"]);

/**
 * 条件字段不是都可以比较大小：车辆类型、产品类别等都是字典枚举，
 * 只有数量类字段才有可比较的数值含义。
 */
const ENUM_CONDITION_OPERATORS = new Set(["EQ", "IN"]);
const NUMERIC_CONDITION_OPERATORS = new Set(["EQ", "BETWEEN", "GTE", "LTE"]);

export function isNumericConditionField(field?: string) {
  return Boolean(field && NUMERIC_CONDITION_FIELDS.has(field));
}

export function conditionOperatorOptions(field?: string) {
  const allowedOperators = isNumericConditionField(field)
    ? NUMERIC_CONDITION_OPERATORS
    : ENUM_CONDITION_OPERATORS;
  return OPERATOR_OPTIONS.filter((item) => allowedOperators.has(item.value));
}

export function conditionOperatorHelp(field?: string) {
  return isNumericConditionField(field)
    ? "数量可按单个值、区间、下限或上限匹配。"
    : "此项为选择项，只能匹配指定值或多个指定值，不能比较大小。";
}

export function defaultConditionOperator(field?: string) {
  return isNumericConditionField(field) ? "GTE" : "EQ";
}

export const TARGET_OPTIONS = [
  { value: "PRODUCT_LINE", label: "产品建议价" }
] as const;

export const ACTION_OPTIONS = [
  { value: "ADD_CENTS", label: "加价" },
  { value: "SUBTRACT_CENTS", label: "减价" },
  { value: "MULTIPLY_BPS", label: "上浮" },
  { value: "DISCOUNT_BPS", label: "优惠" }
] as const;

const FIELD_LABELS = Object.fromEntries(CONDITION_FIELD_OPTIONS.map((item) => [item.value, item.label]));
const OPERATOR_LABELS = Object.fromEntries(OPERATOR_OPTIONS.map((item) => [item.value, item.label]));
const TARGET_LABELS: Record<string, string> = {
  PRODUCT_LINE: "产品建议价",
  LABOR: "施工人工费（历史规则）",
  ORDER: "订单总价（历史规则）"
};
const ACTION_LABELS = Object.fromEntries(ACTION_OPTIONS.map((item) => [item.value, item.label]));

export function PricingWorkspaceHeader({
  activeStep,
  onStepChange,
  draftPending,
  lastSavedAt,
  conflictCount = 0
}: {
  activeStep: number;
  onStepChange: (step: number) => void;
  draftPending?: boolean;
  lastSavedAt?: string | null;
  conflictCount?: number;
}) {
  return (
    <>
      <div className="pricing-workspace-heading">
        <div>
          <Typography.Title level={1}>设置新的建议价方案</Typography.Title>
          <Typography.Paragraph>
            所有修改先保存为草稿，不会影响当前已生效的价格规则和订单。
          </Typography.Paragraph>
        </div>
        <div className={`pricing-draft-state${conflictCount ? " has-conflict" : ""}`} aria-live="polite">
          {conflictCount ? <WarningFilled /> : draftPending ? <ClockCircleOutlined /> : <CheckCircleFilled />}
          <span>{conflictCount ? `发现 ${conflictCount} 条规则冲突` : draftPending ? "有修改正在保存" : "草稿已自动保存"}</span>
          {conflictCount ? <small>修改冲突后才能保存</small> : lastSavedAt ? <small>{lastSavedAt}</small> : null}
        </div>
      </div>
      <Steps
        className="pricing-workspace-steps"
        current={activeStep}
        responsive={false}
        onChange={onStepChange}
        items={PRICING_STEPS.map((step) => ({ title: step.title }))}
      />
    </>
  );
}

export function PricingWorkspaceTabs({
  active,
  onChange
}: {
  active: "overview" | "price" | "vehicle" | "protection" | "versions";
  onChange: (key: "overview" | "price" | "vehicle" | "protection" | "versions") => void;
}) {
  const items = [
    { key: "overview" as const, label: "概览" },
    { key: "price" as const, label: "产品建议价规则" },
    { key: "vehicle" as const, label: "车辆类型" },
    { key: "protection" as const, label: "改价审批与保护" },
    { key: "versions" as const, label: "草稿及版本" }
  ];
  return (
    <div className="pricing-workspace-tabs" role="tablist" aria-label="建议价设置栏目">
      {items.map((item) => (
        <Button
          key={item.key}
          type="text"
          role="tab"
          aria-selected={active === item.key}
          className={active === item.key ? "is-active" : ""}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}

export function RuleStatusTag({ enabled }: { enabled: boolean }) {
  return enabled ? <Tag color="success">已启用</Tag> : <Tag>已停用</Tag>;
}

export function formatRuleSentence(rule: PricingRule, valueLabel?: string) {
  const condition = rule.conditions[0];
  const field = FIELD_LABELS[condition?.field] ?? "业务条件";
  const operator = OPERATOR_LABELS[condition?.operator] ?? "为";
  const rawValue = Array.isArray(condition?.value) ? condition.value.join("、") : String(condition?.value ?? "未设置");
  const value = valueLabel ?? rawValue;
  const target = TARGET_LABELS[rule.target] ?? "建议价";
  const action = ACTION_LABELS[rule.actionType] ?? "调整";
  const amount = isPercentAction(rule.actionType)
    ? `${formatPercent(rule.actionValue)}%`
    : `¥${formatYuan(rule.actionValue)}`;
  return `当${field}${operator}“${value}”时，将${target}${action}${amount}`;
}

export function formatYuan(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function formatPercent(bps: number) {
  return Number((bps / 100).toFixed(2));
}

export function isPercentAction(actionType: string) {
  return actionType === "MULTIPLY_BPS" || actionType === "DISCOUNT_BPS";
}

export function businessRuleName(rule: PricingRule) {
  const condition = rule.conditions[0];
  const field = FIELD_LABELS[condition?.field] ?? "业务条件";
  const target = TARGET_LABELS[rule.target] ?? "建议价";
  return `${field} · ${target}`;
}

export function findRuleConflictIndexes(rules: PricingRule[]) {
  const indexes = new Set<number>();
  const seen = new Map<string, number>();
  rules.forEach((rule, index) => {
    if (rule.enabled === false || rule.conditions.some((condition) => isBlankConditionValue(condition.value))) return;
    const key = `${rule.group}:${rule.target}:${canonicalConditions(rule.conditions)}`;
    const prior = seen.get(key);
    if (prior !== undefined) {
      indexes.add(prior);
      indexes.add(index);
    } else {
      seen.set(key, index);
    }
  });
  return indexes;
}

function canonicalConditions(conditions: PricingRule["conditions"]) {
  return JSON.stringify(conditions
    .map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: condition.operator === "IN" && Array.isArray(condition.value)
        ? [...condition.value].map(String).sort((left, right) => left.localeCompare(right, "zh-CN"))
        : condition.value
    }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right), "zh-CN")));
}

function isBlankConditionValue(value: PricingRule["conditions"][number]["value"]) {
  if (Array.isArray(value)) return value.length === 0;
  return String(value ?? "").trim() === "";
}
