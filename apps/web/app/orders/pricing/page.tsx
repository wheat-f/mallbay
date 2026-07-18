"use client";

import {
  ArrowRightOutlined,
  CheckCircleFilled,
  EditOutlined,
  EyeOutlined,
  LockOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  WarningFilled
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  DatePicker,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { productApi } from "../../../src/features/products/api";
import {
  pricingApi,
  type PricingRule,
  type PricingRuleSetPayload,
  type PricingRuleSetSummary
} from "../../../src/features/pricing/api";
import {
  ACTION_OPTIONS,
  CONDITION_FIELD_OPTIONS,
  PricingWorkspaceHeader,
  PricingWorkspaceTabs,
  TARGET_OPTIONS,
  businessRuleName,
  conditionOperatorOptions,
  conditionOperatorHelp,
  defaultConditionOperator,
  formatPercent,
  formatRuleSentence,
  formatYuan,
  findRuleConflictIndexes,
  isNumericConditionField,
  isPercentAction
} from "../../../src/features/pricing/pricing-workspace";
import { dictionaryApi, type DictionaryItem } from "../../../src/features/settings/api";
import { useAuthStore } from "../../../src/stores/auth-store";

type ActiveView = "overview" | "price" | "protection" | "versions";
type ValidationResult = { valid: boolean; errors: string[]; status: string; version: number };
type PricingProduct = {
  id: string;
  brand: string;
  name: string;
  model: string;
  category: string;
  salesUnit: string;
  basePriceCents: number;
};

function emptyRule(index = 0): PricingRule {
  return {
    group: "PRODUCT",
    target: "PRODUCT_LINE",
    name: "",
    conditions: [{ field: "productCategory", operator: "EQ", value: "" }],
    actionType: "ADD_CENTS",
    actionValue: 0,
    priority: index + 1,
    sortOrder: index,
    enabled: true
  };
}

function getDictionaryOptions(dictionaries: DictionaryItem[], code: string) {
  const dictionary = dictionaries.find((item) => item.code === code && item.status === "ACTIVE");
  return (dictionary?.dictionaryItems ?? [])
    .filter((item) => item.status === "ACTIVE")
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({ value: item.code, label: item.name }));
}

function dictionaryCodeForField(field: string) {
  if (field === "productCategory") return "PRODUCT_CATEGORY";
  if (field === "constructionType") return "CONSTRUCTION_TYPE";
  if (field === "constructionLocation") return "CONSTRUCTION_LOCATION";
  if (field === "salesUnit") return "PRODUCT_UNIT";
  if (field === "vehicleTypeCode") return "VEHICLE_TYPE";
  return null;
}

function groupForField(field: string) {
  if (field === "vehicleTypeCode" || field === "vehicleClassCode") return "VEHICLE";
  if (field.startsWith("construction")) return "CONSTRUCTION";
  return "PRODUCT";
}

function normalizeRule(rule: PricingRule, index: number): PricingRule {
  const condition = rule.conditions[0];
  const operator = conditionOperatorOptions(condition?.field).some((item) => item.value === condition?.operator)
    ? condition.operator
    : defaultConditionOperator(condition?.field);
  const value = operator === condition?.operator
    ? condition.value
    : isNumericConditionField(condition?.field)
      ? Number(Array.isArray(condition?.value) ? condition.value[0] ?? 0 : condition?.value ?? 0)
      : Array.isArray(condition?.value) ? condition.value[0] ?? "" : condition?.value ?? "";
  return {
    ...rule,
    conditions: [{ ...condition, operator, value }],
    name: rule.name.trim() || businessRuleName(rule),
    priority: index + 1,
    sortOrder: index,
    enabled: rule.enabled !== false
  };
}

function statusLabel(status: PricingRuleSetSummary["status"]) {
  if (status === "PUBLISHED") return "已发布";
  if (status === "DRAFT") return "草稿";
  return "已停用";
}

function rolloutLabel(mode?: "LEGACY" | "SHADOW" | "ACTIVE") {
  if (mode === "LEGACY") return "沿用原价格";
  if (mode === "SHADOW") return "观察试运行";
  return "正式启用";
}

export default function PricingRulesPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const client = useQueryClient();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const [activeView, setActiveView] = useState<ActiveView>("price");
  const [activeRuleIndex, setActiveRuleIndex] = useState(0);
  const [effectiveFrom, setEffectiveFrom] = useState<Dayjs>(dayjs());
  const [normalDeviationBps, setNormalDeviationBps] = useState(500);
  const [approvalDeviationBps, setApprovalDeviationBps] = useState(1500);
  const [minimumMarginBps, setMinimumMarginBps] = useState(1000);
  const [rules, setRules] = useState<PricingRule[]>([emptyRule()]);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const hydratedDraftId = useRef<string | null>(null);
  const editSequence = useRef(0);

  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get("view");
    if (requestedView === "overview" || requestedView === "price" || requestedView === "protection" || requestedView === "versions") {
      setActiveView(requestedView);
    }
  }, []);

  const rulesQuery = useQuery({
    queryKey: ["pricing-rule-sets", storeId],
    queryFn: () => pricingApi.ruleSets(storeId!),
    enabled: Boolean(storeId)
  });
  const rolloutQuery = useQuery({
    queryKey: ["pricing-rollout", storeId],
    queryFn: () => pricingApi.rollout(storeId!),
    enabled: Boolean(storeId)
  });
  const dictionariesQuery = useQuery({
    queryKey: ["store-dictionaries", storeId],
    queryFn: () => dictionaryApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const productsQuery = useQuery({
    queryKey: ["pricing-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, status: "ACTIVE", page: 1, pageSize: 200 }),
    enabled: Boolean(storeId)
  });

  const ruleSets = useMemo(() => rulesQuery.data ?? [], [rulesQuery.data]);
  const publishedRuleSet = useMemo(
    () => ruleSets.find((item) => item.status === "PUBLISHED") ?? null,
    [ruleSets]
  );
  const draftRuleSet = useMemo(
    () => ruleSets.find((item) => item.status === "DRAFT") ?? null,
    [ruleSets]
  );
  const dictionaries = useMemo(() => dictionariesQuery.data ?? [], [dictionariesQuery.data]);
  const products = useMemo(
    () => (productsQuery.data?.items ?? []) as PricingProduct[],
    [productsQuery.data]
  );
  const conflictIndexes = useMemo(() => findRuleConflictIndexes(rules), [rules]);
  const conflictCount = conflictIndexes.size;

  const invalidateRules = useCallback(
    () => client.invalidateQueries({ queryKey: ["pricing-rule-sets", storeId] }),
    [client, storeId]
  );

  useEffect(() => {
    if (!draftRuleSet || hydratedDraftId.current === draftRuleSet.id) return;
    const policy = draftRuleSet.protectionPolicy;
    setEffectiveFrom(dayjs(draftRuleSet.effectiveFrom));
    setNormalDeviationBps(policy?.normalDeviationBps ?? 500);
    setApprovalDeviationBps(policy?.approvalDeviationBps ?? 1500);
    setMinimumMarginBps(policy?.minimumMarginBps ?? 1000);
    setRules((draftRuleSet.rules?.length ? draftRuleSet.rules : [emptyRule()]).map((rule, index) => normalizeRule(rule, index)));
    setActiveRuleIndex(0);
    setDirty(false);
    setValidation(null);
    setLastSavedAt(dayjs().format("今天 HH:mm:ss"));
    hydratedDraftId.current = draftRuleSet.id;
    editSequence.current = 0;
  }, [draftRuleSet]);

  const markDirty = useCallback(() => {
    editSequence.current += 1;
    setDirty(true);
    setValidation(null);
  }, []);

  const buildPayload = useCallback((): PricingRuleSetPayload | null => {
    if (!storeId) return null;
    return {
      storeId,
      effectiveFrom: effectiveFrom.toISOString(),
      rules: rules.map(normalizeRule),
      protectionPolicy: {
        normalDeviationBps,
        approvalDeviationBps,
        minimumMarginBps,
        softHoldHours: draftRuleSet?.protectionPolicy?.softHoldHours ?? 24,
        allowSpecialApproval: draftRuleSet?.protectionPolicy?.allowSpecialApproval ?? false,
        // 对客报价规则不再维护人工成本；施工成本只由岗位小时成本和施工标准计算。
        internalLaborCostConfig: { constructionCostSource: "STRUCTURED_STANDARD" }
      }
    };
  }, [approvalDeviationBps, draftRuleSet, effectiveFrom, minimumMarginBps, normalDeviationBps, rules, storeId]);

  const saveMutation = useMutation({
    mutationFn: (payload: PricingRuleSetPayload) => pricingApi.updateRuleSet(draftRuleSet!.id, payload),
    onError: (error: Error) => message.error(`草稿自动保存失败：${error.message}`)
  });

  const saveDraft = useCallback(
    (showSuccess = false) => {
      if (conflictIndexes.size) {
        if (showSuccess) message.error("存在适用条件相同的规则，请先合并或修改冲突规则");
        return;
      }
      const payload = buildPayload();
      if (!payload || !draftRuleSet || saveMutation.isPending) return;
      const savingSequence = editSequence.current;
      saveMutation.mutate(payload, {
        onSuccess: () => {
          if (editSequence.current === savingSequence) setDirty(false);
          setLastSavedAt(dayjs().format("今天 HH:mm:ss"));
          if (showSuccess) message.success("草稿已保存");
          invalidateRules();
        }
      });
    },
    [buildPayload, conflictIndexes, draftRuleSet, invalidateRules, message, saveMutation]
  );

  useEffect(() => {
    if (!dirty || !draftRuleSet || conflictIndexes.size) return;
    const timer = window.setTimeout(() => saveDraft(false), 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, draftRuleSet, rules, normalDeviationBps, approvalDeviationBps, minimumMarginBps, effectiveFrom, conflictIndexes, saveDraft]);

  const startDraftMutation = useMutation({
    mutationFn: async () => {
      if (publishedRuleSet) return pricingApi.copyRuleSet(publishedRuleSet.id, storeId!);
      const result = await pricingApi.createDefaultRuleSet(storeId!);
      return result.ruleSet;
    },
    onSuccess: () => {
      message.success(publishedRuleSet ? "已复制当前方案，可以开始修改" : "已生成门店默认草稿");
      hydratedDraftId.current = null;
      invalidateRules();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const validateMutation = useMutation({
    mutationFn: () => pricingApi.validateRuleSet(draftRuleSet!.id, storeId!),
    onSuccess: (result) => {
      setValidation(result);
      if (result.valid) message.success("检查通过，可以发布");
      else message.error(result.errors.join("；"));
    },
    onError: (error: Error) => message.error(error.message)
  });

  const publishMutation = useMutation({
    mutationFn: () => pricingApi.publishRuleSet(draftRuleSet!.id, storeId!),
    onSuccess: () => {
      message.success("新的建议价方案已正式生效");
      hydratedDraftId.current = null;
      setValidation(null);
      invalidateRules();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const versionActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "copy" | "retire" }) =>
      action === "copy" ? pricingApi.copyRuleSet(id, storeId!) : pricingApi.retireRuleSet(id, storeId!),
    onSuccess: () => {
      message.success("规则版本操作成功");
      hydratedDraftId.current = null;
      invalidateRules();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const rolloutMutation = useMutation({
    mutationFn: (mode: "LEGACY" | "SHADOW" | "ACTIVE") => pricingApi.setRollout({ storeId: storeId!, mode }),
    onSuccess: () => {
      message.success("运行方式已更新");
      rolloutQuery.refetch();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const updateRule = (index: number, patch: Partial<PricingRule>) => {
    setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule));
    markDirty();
  };

  const updateCondition = (index: number, patch: Partial<PricingRule["conditions"][number]>) => {
    setRules((current) => current.map((rule, ruleIndex) => ruleIndex === index
      ? { ...rule, conditions: [{ ...rule.conditions[0], ...patch }] }
      : rule));
    markDirty();
  };

  const conditionOptions = (rule: PricingRule) => {
    const field = rule.conditions[0]?.field;
    const dictionaryCode = dictionaryCodeForField(field);
    if (dictionaryCode) return getDictionaryOptions(dictionaries, dictionaryCode);
    if (field === "productId") return products.map((item) => ({ value: item.id, label: `${item.brand} / ${item.name} / ${item.model}` }));
    if (field === "productBrand") return [...new Set(products.map((item) => item.brand).filter(Boolean))].map((value) => ({ value, label: value }));
    if (field === "productModel") return [...new Set(products.map((item) => item.model).filter(Boolean))].map((value) => ({ value, label: value }));
    return [];
  };

  const getRuleValueLabel = (rule: PricingRule) => {
    const value = rule.conditions[0]?.value;
    const raw = Array.isArray(value) ? value.join("、") : String(value ?? "");
    return conditionOptions(rule).find((item) => item.value === raw)?.label ?? raw;
  };

  const createAvailableRule = () => {
    const nextIndex = rules.length;
    const candidates: Array<{ field: string; value: string | number }> = [
      ...getDictionaryOptions(dictionaries, "PRODUCT_CATEGORY").map((item) => ({ field: "productCategory", value: item.value })),
      ...products.map((item) => ({ field: "productId", value: item.id })),
      ...[...new Set(products.map((item) => item.brand).filter(Boolean))].map((value) => ({ field: "productBrand", value }))
    ];
    for (const candidate of candidates) {
      const rule = { ...emptyRule(nextIndex), conditions: [{ field: candidate.field, operator: "EQ", value: candidate.value }] };
      if (!findRuleConflictIndexes([...rules, rule]).has(nextIndex)) return rule;
    }
    let quantity = 1;
    while (quantity < 10000) {
      const rule = { ...emptyRule(nextIndex), conditions: [{ field: "quantity", operator: "GTE", value: quantity }] };
      if (!findRuleConflictIndexes([...rules, rule]).has(nextIndex)) return rule;
      quantity += 1;
    }
    return emptyRule(nextIndex);
  };

  const activeRule = rules[activeRuleIndex] ?? rules[0];
  const activeStep = activeView === "protection" ? 1 : activeView === "versions" ? 2 : 0;

  const navigateStep = (step: number) => {
    if (step === 1) setActiveView("protection");
    else if (step === 2) setActiveView("versions");
    else setActiveView("price");
  };

  const navigateTab = (key: "overview" | "price" | "protection" | "versions") => {
    setActiveView(key);
  };

  const advance = () => {
    if (conflictIndexes.size) {
      message.error("存在冲突规则，处理后才能进入下一步");
      return;
    }
    saveDraft(true);
    if (activeView === "price" || activeView === "overview") setActiveView("protection");
    else if (activeView === "protection") setActiveView("versions");
  };

  return (
    <div className="management-page pricing-workspace-page">
      <PricingWorkspaceHeader
        activeStep={activeStep}
        onStepChange={navigateStep}
        draftPending={dirty || saveMutation.isPending}
        lastSavedAt={lastSavedAt}
        conflictCount={conflictCount}
      />

      <Card className="pricing-workspace-shell" variant="borderless">
        <PricingWorkspaceTabs active={activeView} onChange={navigateTab} />

        {rulesQuery.isLoading ? <Card loading /> : null}

        {!rulesQuery.isLoading && !draftRuleSet ? (
          <div className="pricing-start-state">
            <div className="pricing-start-copy">
              <Tag color="success">{rolloutLabel(rolloutQuery.data?.pricingRolloutMode)}</Tag>
              <Typography.Title level={3}>{publishedRuleSet ? `当前生效方案 v${publishedRuleSet.version}` : "尚未建立建议价方案"}</Typography.Title>
              <Typography.Paragraph>
                {publishedRuleSet
                  ? `当前方案自 ${dayjs(publishedRuleSet.effectiveFrom).format("YYYY-MM-DD HH:mm")} 起生效。修改时系统会先复制为草稿，发布前不会影响门店报价。`
                  : "先生成一份门店默认草稿，再按业务步骤完成设置和试算。"}
              </Typography.Paragraph>
              <Button
                type="primary"
                size="large"
                icon={<EditOutlined />}
                loading={startDraftMutation.isPending}
                onClick={() => storeId && startDraftMutation.mutate()}
              >
                {publishedRuleSet ? "编辑当前建议价" : "开始设置建议价"}
              </Button>
            </div>
            <div className="pricing-start-summary">
              <span>当前规则</span>
              <strong>{publishedRuleSet?.rules?.length ?? 0} 条</strong>
              <span>产品建议价</span>
              <Link href="/products">前往产品档案查看 <ArrowRightOutlined /></Link>
            </div>
          </div>
        ) : null}

        {draftRuleSet && activeView === "overview" ? (
          <div className="pricing-overview-grid">
            <section className="pricing-overview-primary">
              <Tag color="processing">草稿 v{draftRuleSet.version}</Tag>
              <Typography.Title level={3}>这份方案有 {rules.length} 条价格规则</Typography.Title>
              <Typography.Paragraph>按步骤完成价格规则和保护设置，再统一试算发布。</Typography.Paragraph>
              <div className="pricing-overview-actions">
                <Button type="primary" onClick={() => setActiveView("price")}>继续设置价格</Button>
                <Button onClick={() => router.push("/orders/pricing/simulator")}>打开试算工具</Button>
              </div>
            </section>
            <section className="pricing-overview-checklist">
              <div><CheckCircleFilled /><span>产品建议价规则</span><Button type="link" onClick={() => setActiveView("price")}>查看</Button></div>
              <div><CheckCircleFilled /><span>施工收费与成本标准</span><Link href="/orders/pricing/construction-costs">维护</Link></div>
              <div><SafetyCertificateOutlined /><span>改价审批与保护</span><Button type="link" onClick={() => setActiveView("protection")}>查看</Button></div>
              <div><EyeOutlined /><span>试算并发布</span><Button type="link" onClick={() => setActiveView("versions")}>查看</Button></div>
            </section>
          </div>
        ) : null}

        {draftRuleSet && activeView === "price" ? (
          <div className="pricing-editor-layout">
            <section className="pricing-rule-editor">
              <div className="pricing-editor-section-head">
                <div>
                  <Typography.Title level={4}>规则组：产品建议价规则</Typography.Title>
                  <Typography.Text type="secondary">这里只调整产品建议价；施工收费、标准工时和内部施工成本请到“施工收费标准”维护。</Typography.Text>
                </div>
                <Tag color="processing">编辑中</Tag>
              </div>
              <Alert
                type="info"
                showIcon
                title="施工收费不在本页维护"
                description={<span>本页每条规则只会调整产品建议价。施工服务的主项目收费、追加项目收费、标准工时和班组成本，请前往 <Link href="/orders/pricing/construction-costs/standards">施工收费标准</Link> 配置。</span>}
                style={{ marginBottom: 16 }}
              />

              <div className="pricing-sentence-builder">
                <div className="pricing-sentence-row pricing-sentence-condition">
                <span>当</span>
                <Select
                  aria-label="选择业务条件"
                  value={activeRule.conditions[0]?.field}
                  options={CONDITION_FIELD_OPTIONS.map((item) => ({ ...item }))}
                  onChange={(field) => {
                    const dictionaryCode = dictionaryCodeForField(field);
                    const firstDictionaryValue = dictionaryCode ? getDictionaryOptions(dictionaries, dictionaryCode)[0]?.value : undefined;
                    updateRule(activeRuleIndex, { group: groupForField(field) });
                    updateCondition(activeRuleIndex, { field, operator: defaultConditionOperator(field), value: isNumericConditionField(field) ? 1 : firstDictionaryValue ?? "" });
                  }}
                />
                <Tooltip title={conditionOperatorHelp(activeRule.conditions[0]?.field)}>
                  <div className="pricing-condition-operator">
                    <Select
                      aria-label={`选择判断方式：${conditionOperatorHelp(activeRule.conditions[0]?.field)}`}
                      value={activeRule.conditions[0]?.operator}
                      options={conditionOperatorOptions(activeRule.conditions[0]?.field).map((item) => ({ ...item }))}
                      onChange={(operator) => {
                        const currentValue = activeRule.conditions[0]?.value;
                        const nextValue = operator === "BETWEEN"
                          ? [0, 0]
                          : operator === "IN"
                            ? (Array.isArray(currentValue) ? currentValue : currentValue === "" || currentValue == null ? [] : [currentValue])
                            : Array.isArray(currentValue) ? (currentValue[0] ?? (isNumericConditionField(activeRule.conditions[0]?.field) ? 0 : "")) : currentValue;
                        updateCondition(activeRuleIndex, { operator, value: nextValue });
                      }}
                    />
                  </div>
                </Tooltip>
                {isNumericConditionField(activeRule.conditions[0]?.field) ? (
                  activeRule.conditions[0]?.operator === "BETWEEN" ? (
                    <Space.Compact className="pricing-condition-value" block>
                      <InputNumber aria-label="填写数值下限" min={0} value={Array.isArray(activeRule.conditions[0]?.value) ? Number(activeRule.conditions[0]?.value[0] ?? 0) : 0} onChange={(value) => updateCondition(activeRuleIndex, { value: [value ?? 0, Array.isArray(activeRule.conditions[0]?.value) ? Number(activeRule.conditions[0]?.value[1] ?? 0) : 0] })} />
                      <InputNumber aria-label="填写数值上限" min={0} value={Array.isArray(activeRule.conditions[0]?.value) ? Number(activeRule.conditions[0]?.value[1] ?? 0) : 0} onChange={(value) => updateCondition(activeRuleIndex, { value: [Array.isArray(activeRule.conditions[0]?.value) ? Number(activeRule.conditions[0]?.value[0] ?? 0) : 0, value ?? 0] })} />
                    </Space.Compact>
                  ) : <InputNumber className="pricing-condition-value" aria-label="填写条件数值" min={0} value={Number(activeRule.conditions[0]?.value ?? 0)} onChange={(value) => updateCondition(activeRuleIndex, { value: value ?? 0 })} />
                ) : conditionOptions(activeRule).length > 0 ? (
                  <Select
                    className="pricing-condition-value"
                    aria-label="选择条件值"
                    showSearch
                    mode={activeRule.conditions[0]?.operator === "IN" ? "multiple" : undefined}
                    value={activeRule.conditions[0]?.value as string | string[]}
                    options={conditionOptions(activeRule)}
                    onChange={(value) => updateCondition(activeRuleIndex, { value })}
                  />
                ) : (
                  <Input
                    className="pricing-condition-value"
                    aria-label="填写条件值"
                    value={String(activeRule.conditions[0]?.value ?? "")}
                    placeholder={activeRule.conditions[0]?.operator === "BETWEEN" ? "例如 1, 5" : "填写业务条件"}
                    onChange={(event) => updateCondition(activeRuleIndex, { value: event.target.value })}
                  />
                )}
                <span>时</span>
                </div>
                <div className="pricing-sentence-row pricing-sentence-action">
                <span>将</span>
                <Select
                  aria-label="选择调整对象"
                  value={activeRule.target}
                  options={activeRule.target === "PRODUCT_LINE"
                    ? TARGET_OPTIONS.map((item) => ({ ...item }))
                    : [...TARGET_OPTIONS.map((item) => ({ ...item })), { value: activeRule.target, label: `历史规则：${activeRule.target === "LABOR" ? "施工人工费" : "订单总价"}（请改为产品建议价或删除）`, disabled: true }]}
                  onChange={(target) => updateRule(activeRuleIndex, { target })}
                />
                <Select
                  aria-label="选择调整方式"
                  value={activeRule.actionType}
                  options={ACTION_OPTIONS.map((item) => ({ ...item }))}
                  onChange={(actionType) => updateRule(activeRuleIndex, { actionType, actionValue: 0 })}
                />
                <InputNumber
                  aria-label="填写调整数值"
                  min={0}
                  value={isPercentAction(activeRule.actionType) ? formatPercent(activeRule.actionValue) : activeRule.actionValue / 100}
                  prefix={isPercentAction(activeRule.actionType) ? undefined : "¥"}
                  suffix={isPercentAction(activeRule.actionType) ? "%" : undefined}
                  onChange={(value) => updateRule(activeRuleIndex, { actionValue: Math.round((value ?? 0) * 100) })}
                />
                </div>
              </div>

              {conflictIndexes.has(activeRuleIndex) ? (
                <Alert
                  className="pricing-conflict-alert"
                  type="error"
                  showIcon
                  title="这条规则与已有规则的适用条件重复"
                  description="同一适用条件只能保留一条价格调整。请修改条件，或删除其中一条后再保存。"
                />
              ) : null}

              <div className="pricing-natural-preview">
                <EyeOutlined />
                <div>
                  <strong>规则预览（自然语言）</strong>
                  <p>{formatRuleSentence(activeRule, getRuleValueLabel(activeRule))}</p>
                </div>
              </div>

              <div className="pricing-rule-context">
                <div>
                  <strong>适用范围</strong>
                  <p>系统会根据所选条件自动匹配门店产品、车型和施工项目。</p>
                </div>
                <div className="pricing-base-price-lock">
                  <LockOutlined />
                  <span>产品建议价由产品档案统一维护</span>
                  <Link href="/products">前往产品档案修改</Link>
                </div>
              </div>

              <div className="pricing-rule-list">
                {rules.map((rule, index) => (
                  <button
                    type="button"
                    key={rule.id ?? `${rule.name}-${index}`}
                    className={`${index === activeRuleIndex ? "is-active" : ""}${conflictIndexes.has(index) ? " has-conflict" : ""}`}
                    onClick={() => setActiveRuleIndex(index)}
                  >
                    <span>
                      <strong>{rule.name || businessRuleName(rule)}</strong>
                      <small>{formatRuleSentence(rule, getRuleValueLabel(rule))}</small>
                    </span>
                    <Tag color={conflictIndexes.has(index) ? "error" : index === activeRuleIndex ? "processing" : "default"}>
                      {conflictIndexes.has(index) ? "条件冲突" : index === activeRuleIndex ? "编辑中" : "已配置"}
                    </Tag>
                  </button>
                ))}
              </div>

              <Space wrap>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const nextIndex = rules.length;
                    const nextRule = createAvailableRule();
                    setRules((current) => [...current, nextRule]);
                    setActiveRuleIndex(nextIndex);
                    markDirty();
                  }}
                >
                  添加规则
                </Button>
                {rules.length > 1 ? (
                  <Button
                    danger
                    onClick={() => {
                      setRules((current) => current.filter((_, index) => index !== activeRuleIndex));
                      setActiveRuleIndex((current) => Math.max(0, current - 1));
                      markDirty();
                    }}
                  >
                    删除当前规则
                  </Button>
                ) : null}
              </Space>
            </section>

            <aside className="pricing-preview-panel">
              <div className="pricing-preview-title">
                <Typography.Title level={4}>规则效果预览</Typography.Title>
                <Button type="link" onClick={() => router.push("/orders/pricing/simulator")}>打开完整试算</Button>
              </div>
              <div className="pricing-preview-example">
                <span>当前编辑规则</span>
                <strong>{formatRuleSentence(activeRule, getRuleValueLabel(activeRule))}</strong>
                <div>
                  <span>调整方式</span>
                  <b>{isPercentAction(activeRule.actionType) ? `${formatPercent(activeRule.actionValue)}%` : `¥${formatYuan(activeRule.actionValue)}`}</b>
                </div>
              </div>
              <div className="pricing-preview-block">
                <span>影响范围</span>
                <strong>{rules.length} 条价格规则</strong>
              </div>
              <div className="pricing-preview-block">
                <span>冲突检查</span>
                {conflictIndexes.size
                  ? <strong className="is-danger"><WarningFilled /> {conflictCount} 条冲突规则待处理</strong>
                  : validation?.valid
                    ? <strong className="is-success"><CheckCircleFilled /> 未发现规则冲突</strong>
                    : <strong className="is-success"><CheckCircleFilled /> 当前未发现冲突</strong>}
              </div>
              <div className="pricing-preview-block">
                <span>草稿信息</span>
                <strong>v{draftRuleSet.version} · {lastSavedAt ?? "等待首次保存"}</strong>
              </div>
            </aside>
          </div>
        ) : null}

        {draftRuleSet && activeView === "protection" ? (
          <div className="pricing-protection-layout">
            <section>
              <Typography.Title level={3}>改价审批与价格保护</Typography.Title>
              <Typography.Paragraph type="secondary">店长只需设置可理解的百分比和人民币金额，系统在报价时自动执行最严格的校验。</Typography.Paragraph>
              <div className="pricing-protection-grid">
                <label>
                  <span>允许销售直接调整</span>
                  <small>成交价与建议价偏差不超过此范围时可直接下单</small>
                  <InputNumber min={0} max={100} value={formatPercent(normalDeviationBps)} suffix="%" onChange={(value) => { setNormalDeviationBps(Math.round((value ?? 0) * 100)); markDirty(); }} />
                </label>
                <label>
                  <span>超过此偏差必须审批</span>
                  <small>低于该范围时进入报价审批，不直接生成订单</small>
                  <InputNumber min={0} max={100} value={formatPercent(approvalDeviationBps)} suffix="%" onChange={(value) => { setApprovalDeviationBps(Math.round((value ?? 0) * 100)); markDirty(); }} />
                </label>
                <label>
                  <span>最低预计毛利率</span>
                  <small>预计毛利低于底线时必须提交店长审批</small>
                  <InputNumber min={0} max={100} value={formatPercent(minimumMarginBps)} suffix="%" onChange={(value) => { setMinimumMarginBps(Math.round((value ?? 0) * 100)); markDirty(); }} />
                </label>
              </div>
            </section>
            <Alert
              type="info"
              showIcon
              title="施工成本已改为统一的标准成本口径"
              description={<span>此处不再维护“施工基础人工费”，以免与施工成本标准重复。施工成本由财务发布的岗位小时成本，结合店长维护的主项目、追加项目、班组和标准工时自动计算；请前往 <Link href="/orders/pricing/construction-costs/standards">施工收费标准</Link> 维护。</span>}
            />
          </div>
        ) : null}

        {draftRuleSet && activeView === "versions" ? (
          <div className="pricing-publish-layout">
            <section className="pricing-publish-main">
              <Typography.Title level={3}>试算并发布</Typography.Title>
              <Typography.Paragraph type="secondary">先检查规则冲突和生效时间，再将草稿发布为门店的新建议价方案。</Typography.Paragraph>
              <div className="pricing-publish-checks">
                <div><span>规则数量</span><strong>{rules.length} 条</strong></div>
                <div><span>生效时间</span><DatePicker value={effectiveFrom} showTime onChange={(value) => { if (value) { setEffectiveFrom(value); markDirty(); } }} /></div>
                <div><span>检查结果</span><strong className={validation?.valid ? "is-success" : ""}>{validation?.valid ? "已通过" : "尚未检查"}</strong></div>
              </div>
              {validation && !validation.valid ? <Alert type="error" showIcon title="存在需要处理的问题" description={validation.errors.join("；")} /> : null}
              <Space wrap size="middle">
                <Button loading={validateMutation.isPending} disabled={dirty || saveMutation.isPending || conflictIndexes.size > 0} onClick={() => validateMutation.mutate()}>
                  检查规则和冲突
                </Button>
                <Button onClick={() => router.push("/orders/pricing/simulator")}>打开典型订单试算</Button>
                <Button type="primary" loading={publishMutation.isPending} disabled={!validation?.valid || dirty || conflictIndexes.size > 0} onClick={() => publishMutation.mutate()}>
                  确认发布并生效
                </Button>
              </Space>
            </section>

            <section className="pricing-version-panel">
              <div className="pricing-editor-section-head">
                <Typography.Title level={4}>草稿及版本记录</Typography.Title>
                <Button icon={<ReloadOutlined />} onClick={() => rulesQuery.refetch()}>刷新</Button>
              </div>
              <Table<PricingRuleSetSummary>
                rowKey="id"
                dataSource={ruleSets}
                pagination={false}
                columns={[
                  { title: "版本", dataIndex: "version", width: 90, render: (value: number, row) => <Link href={`/orders/pricing/rule-sets/${row.id}`}>v{value}</Link> },
                  { title: "状态", dataIndex: "status", width: 100, render: (value: PricingRuleSetSummary["status"]) => <Tag color={value === "PUBLISHED" ? "success" : value === "DRAFT" ? "processing" : "default"}>{statusLabel(value)}</Tag> },
                  { title: "生效时间", dataIndex: "effectiveFrom", render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm") },
                  { title: "规则", render: (_, row) => `${row.rules?.length ?? 0} 条` },
                  { title: "操作", render: (_, row) => <Space>
                    {row.status === "PUBLISHED" ? <Button size="small" onClick={() => versionActionMutation.mutate({ id: row.id, action: "copy" })}>复制为草稿</Button> : null}
                    {row.status === "PUBLISHED" ? <Button size="small" danger onClick={() => versionActionMutation.mutate({ id: row.id, action: "retire" })}>停用</Button> : null}
                  </Space> }
                ]}
              />
            </section>

            <Collapse
              className="pricing-advanced-settings"
              items={[{
                key: "advanced",
                label: "高级设置",
                children: <div className="pricing-advanced-row">
                  <div>
                    <strong>建议价运行方式</strong>
                    <p>仅在灰度切换或故障回退时调整，日常维护无需修改。</p>
                  </div>
                  <Select
                    value={rolloutQuery.data?.pricingRolloutMode ?? "ACTIVE"}
                    loading={rolloutQuery.isLoading}
                    onChange={(mode: "LEGACY" | "SHADOW" | "ACTIVE") => rolloutMutation.mutate(mode)}
                    options={[
                      { value: "LEGACY", label: "沿用原价格" },
                      { value: "SHADOW", label: "观察试运行" },
                      { value: "ACTIVE", label: "正式启用" }
                    ]}
                  />
                  <Link href="/orders/pricing/construction-costs">维护施工收费与成本标准</Link>
                </div>
              }]}
            />
          </div>
        ) : null}
      </Card>

      {draftRuleSet ? (
        <div className="pricing-workspace-footer">
          <div className={conflictIndexes.size ? "is-danger" : ""}>
            {conflictIndexes.size ? <WarningFilled /> : <CheckCircleFilled />}
            <span>{conflictIndexes.size ? "存在冲突规则，草稿暂未保存" : dirty || saveMutation.isPending ? "正在保存草稿…" : `草稿已自动保存 ${lastSavedAt ?? ""}`}</span>
          </div>
          <Space>
            <Button disabled={conflictIndexes.size > 0} onClick={() => saveDraft(true)}>暂存退出</Button>
            {activeView !== "versions" ? <Button type="primary" disabled={conflictIndexes.size > 0} onClick={advance}>保存并继续</Button> : null}
          </Space>
        </div>
      ) : null}
    </div>
  );
}
