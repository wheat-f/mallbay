"use client";

import { App, Alert, Button, Card, DatePicker, Input, InputNumber, Select, Space, Table, Tag, Typography } from "antd";
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pricingApi, type PricingRuleSetPayload, type PricingRuleSetSummary } from "../../../src/features/pricing/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

const RULE_GROUPS = ["PRODUCT", "VEHICLE", "CONSTRUCTION", "SURCHARGE", "BUNDLE"];
const RULE_TARGETS = ["PRODUCT_LINE", "LABOR", "ORDER"];
const ACTIONS = ["ADD_CENTS", "SUBTRACT_CENTS", "MULTIPLY_BPS", "DISCOUNT_BPS"];
const CONDITION_FIELDS = ["productCategory", "productBrand", "productModel", "productId", "salesUnit", "quantity", "vehicleClassCode", "constructionType", "constructionLocation", "lineCount", "totalQuantity"];
const OPERATORS = ["EQ", "IN", "BETWEEN", "GTE", "LTE"];

type RuleDraft = PricingRuleSetPayload["rules"][number];

function emptyRule(): RuleDraft {
  return {
    group: "PRODUCT",
    target: "PRODUCT_LINE",
    name: "",
    conditions: [{ field: "productCategory", operator: "EQ", value: "" }],
    actionType: "ADD_CENTS",
    actionValue: 0,
    priority: 1,
    sortOrder: 1,
    enabled: true
  };
}

function parseConditionValue(operator: string, value: string) {
  if (operator === "IN") return value.split(",").map((item) => item.trim()).filter(Boolean);
  if (operator === "BETWEEN") return value.split(",").map((item) => Number(item.trim()));
  if (["GTE", "LTE"].includes(operator)) return Number(value);
  return value.trim();
}

export default function PricingRulesPage() {
  const { message } = App.useApp();
  const client = useQueryClient();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const [effectiveFrom, setEffectiveFrom] = useState(dayjs());
  const [normalDeviationBps, setNormalDeviationBps] = useState(500);
  const [approvalDeviationBps, setApprovalDeviationBps] = useState(1500);
  const [minimumMarginBps, setMinimumMarginBps] = useState(1000);
  const [laborBaseCosts, setLaborBaseCosts] = useState({ PPF: 180000, COLOR_FILM: 160000, HEAT_FILM: 80000, MODIFICATION: 200000, INSPECTION: 20000 });
  const [rules, setRules] = useState<RuleDraft[]>([emptyRule()]);
  const rulesQuery = useQuery({
    queryKey: ["pricing-rule-sets", storeId],
    queryFn: () => pricingApi.ruleSets(storeId!),
    enabled: Boolean(storeId)
  });
  const rolloutQuery = useQuery({ queryKey: ["pricing-rollout", storeId], queryFn: () => pricingApi.rollout(storeId!), enabled: Boolean(storeId) });
  const invalidate = () => client.invalidateQueries({ queryKey: ["pricing-rule-sets", storeId] });
  const defaultDraftMutation = useMutation({
    mutationFn: () => pricingApi.createDefaultRuleSet(storeId!),
    onSuccess: (result) => { message.success(result.created ? "已生成默认规则草稿" : "门店已有规则版本"); invalidate(); },
    onError: (error: Error) => message.error(error.message)
  });
  const createMutation = useMutation({
    mutationFn: (payload: PricingRuleSetPayload) => pricingApi.createRuleSet(payload),
    onSuccess: () => { message.success("价格规则草稿已创建"); invalidate(); },
    onError: (error: Error) => message.error(error.message)
  });
  const publishMutation = useMutation({
    mutationFn: (id: string) => pricingApi.publishRuleSet(id, storeId!),
    onSuccess: () => { message.success("价格规则已发布"); invalidate(); },
    onError: (error: Error) => message.error(error.message)
  });
  const actionMutation = useMutation<PricingRuleSetSummary | { valid: boolean; errors: string[]; status: string; version: number }, Error, { id: string; action: "validate" | "retire" | "copy" }>({
    mutationFn: ({ id, action }: { id: string; action: "validate" | "retire" | "copy" }) =>
      action === "validate" ? pricingApi.validateRuleSet(id, storeId!) : action === "retire" ? pricingApi.retireRuleSet(id, storeId!) : pricingApi.copyRuleSet(id, storeId!),
    onSuccess: (result) => {
      if ("valid" in result) message.success(result.valid ? "规则校验通过" : result.errors.join("；"));
      else message.success("规则版本操作成功");
      invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const rolloutMutation = useMutation({ mutationFn: (mode: "LEGACY" | "SHADOW" | "ACTIVE") => pricingApi.setRollout({ storeId: storeId!, mode }), onSuccess: () => { message.success("价格运行模式已更新"); rolloutQuery.refetch(); }, onError: (error: Error) => message.error(error.message) });
  const tableRows = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const updateRule = (index: number, patch: Partial<RuleDraft>) => setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule));
  const updateCondition = (index: number, patch: Partial<RuleDraft["conditions"][number]>) => setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, conditions: [{ ...rule.conditions[0], ...patch }] } : rule));
  const createDraft = () => {
    if (!storeId) return message.error("当前账号尚未加入门店");
    const normalizedRules = rules.filter((rule) => rule.name.trim()).map((rule) => ({
      ...rule,
      name: rule.name.trim(),
      conditions: rule.conditions.map((condition) => ({ ...condition, field: condition.field.trim(), value: parseConditionValue(condition.operator, String(condition.value)) }))
    }));
    createMutation.mutate({
      storeId,
      effectiveFrom: effectiveFrom.toISOString(),
      rules: normalizedRules,
      protectionPolicy: { normalDeviationBps, approvalDeviationBps, minimumMarginBps, softHoldHours: 24, allowSpecialApproval: false, internalLaborCostConfig: { baseLaborCostCentsByConstruction: laborBaseCosts } }
    });
  };
  return (
    <div className="management-page">
      <StorePageHeader title="建议价规则" description="维护门店独立生效的版本化建议价和审批保护参数" />
      <Alert className="mb-4" type="info" showIcon title="规则发布后不可原地修改；新建订单只消费当前生效版本。金额使用分，比例使用基点。" />
      <Card className="mb-4" title="门店运行模式"><Space wrap><Typography.Text>当前：{rolloutQuery.data?.pricingRolloutMode ?? "ACTIVE"}</Typography.Text><Select value={rolloutQuery.data?.pricingRolloutMode ?? "ACTIVE"} loading={rolloutQuery.isLoading} onChange={(mode: "LEGACY" | "SHADOW" | "ACTIVE") => rolloutMutation.mutate(mode)} options={[{ value: "LEGACY", label: "LEGACY：沿用旧逻辑" }, { value: "SHADOW", label: "SHADOW：只记录差异" }, { value: "ACTIVE", label: "ACTIVE：启用建议价" }]} /></Space></Card>
      <Card title="创建结构化规则草稿" extra={<Space><Button type="primary" icon={<PlusOutlined />} loading={createMutation.isPending} onClick={createDraft}>创建草稿</Button><Button loading={defaultDraftMutation.isPending} onClick={() => storeId && defaultDraftMutation.mutate()}>生成默认草稿</Button></Space>}>
        <Space wrap>
          <DatePicker value={effectiveFrom} onChange={(value) => value && setEffectiveFrom(value)} showTime />
          <InputNumber min={0} value={normalDeviationBps} onChange={(value) => setNormalDeviationBps(value ?? 0)} addonBefore="普通偏差 bps" />
          <InputNumber min={0} value={approvalDeviationBps} onChange={(value) => setApprovalDeviationBps(value ?? 0)} addonBefore="审批上限 bps" />
          <InputNumber min={0} value={minimumMarginBps} onChange={(value) => setMinimumMarginBps(value ?? 0)} addonBefore="毛利底线 bps" />
          {Object.entries(laborBaseCosts).map(([type, value]) => <InputNumber key={type} min={0} value={value} onChange={(next) => setLaborBaseCosts((current) => ({ ...current, [type]: next ?? 0 }))} addonBefore={type + " 人工分"} />)}
        </Space>
        <Space direction="vertical" className="mt-4" style={{ width: "100%" }}>
          {rules.map((rule, index) => <Card size="small" key={index} title={`规则 ${index + 1}`} extra={rules.length > 1 ? <Button danger type="text" icon={<DeleteOutlined />} onClick={() => setRules((current) => current.filter((_, ruleIndex) => ruleIndex !== index))} /> : null}>
            <Space wrap>
              <Input placeholder="规则名称" value={rule.name} onChange={(event) => updateRule(index, { name: event.target.value })} style={{ width: 220 }} />
              <Select value={rule.group} onChange={(value) => updateRule(index, { group: value })} options={RULE_GROUPS.map((value) => ({ value, label: value }))} />
              <Select value={rule.target} onChange={(value) => updateRule(index, { target: value })} options={RULE_TARGETS.map((value) => ({ value, label: value }))} />
              <Select value={rule.actionType} onChange={(value) => updateRule(index, { actionType: value })} options={ACTIONS.map((value) => ({ value, label: value }))} />
              <InputNumber value={rule.actionValue} onChange={(value) => updateRule(index, { actionValue: value ?? 0 })} addonBefore="调整值" />
              <InputNumber min={0} value={rule.priority} onChange={(value) => updateRule(index, { priority: value ?? 0 })} addonBefore="优先级" />
            </Space>
            <Space className="mt-3" wrap>
              <Select value={rule.conditions[0]?.field} onChange={(value) => updateCondition(index, { field: value })} options={CONDITION_FIELDS.map((value) => ({ value, label: value }))} />
              <Select value={rule.conditions[0]?.operator} onChange={(value) => updateCondition(index, { operator: value })} options={OPERATORS.map((value) => ({ value, label: value }))} />
              <Input placeholder="值；IN/BETWEEN 用逗号分隔" value={String(rule.conditions[0]?.value ?? "")} onChange={(event) => updateCondition(index, { value: event.target.value })} style={{ width: 260 }} />
            </Space>
          </Card>)}
          <Button onClick={() => setRules((current) => [...current, emptyRule()])}>添加规则</Button>
        </Space>
      </Card>
      <Card className="mt-4" title="规则版本" extra={<Button icon={<ReloadOutlined />} onClick={() => rulesQuery.refetch()}>刷新</Button>}>
        <Table<PricingRuleSetSummary> rowKey="id" loading={rulesQuery.isLoading} dataSource={tableRows} pagination={false} columns={[
          { title: "版本", dataIndex: "version", width: 110, render: (value: number, row: PricingRuleSetSummary) => <Button type="link" href={`/orders/pricing/rule-sets/${row.id}`}>v{value}</Button> },
          { title: "状态", dataIndex: "status", render: (status: string) => <Tag color={status === "PUBLISHED" ? "green" : status === "DRAFT" ? "blue" : "default"}>{status}</Tag> },
          { title: "生效时间", dataIndex: "effectiveFrom", render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm") },
          { title: "规则数", key: "ruleCount", render: (_: unknown, row: PricingRuleSetSummary) => row.rules?.length ?? 0 },
          { title: "操作", key: "actions", render: (_: unknown, row: PricingRuleSetSummary) => <Space>
            {row.status === "DRAFT" ? <><Button size="small" onClick={() => actionMutation.mutate({ id: row.id, action: "validate" })}>校验</Button><Button size="small" loading={publishMutation.isPending} onClick={() => publishMutation.mutate(row.id)}>发布</Button></> : null}
            {row.status === "PUBLISHED" ? <Button size="small" danger onClick={() => actionMutation.mutate({ id: row.id, action: "retire" })}>停用</Button> : null}
            {row.status !== "DRAFT" ? <Button size="small" onClick={() => actionMutation.mutate({ id: row.id, action: "copy" })}>复制为草稿</Button> : null}
          </Space> }
        ]} />
        <Typography.Paragraph type="secondary" className="mt-3 mb-0">同组规则按优先级择一，跨组按固定顺序叠加；发布前会校验字段、操作符、调整范围和冲突。</Typography.Paragraph>
      </Card>
      <Card className="mt-4" title="车辆映射与报价审批入口"><Space><Button onClick={() => { window.location.href = "/orders/pricing/vehicles"; }}>维护车辆映射</Button><Button onClick={() => { window.location.href = "/orders/pricing/simulator"; }}>试算明细</Button><Button onClick={() => { window.location.href = "/orders/quotes"; }}>查看报价审批</Button><Button onClick={() => { window.location.href = "/products"; }}>维护产品基础价</Button></Space></Card>
    </div>
  );
}
