"use client";

import { ArrowLeftOutlined, CheckCircleOutlined, DeleteOutlined, ExperimentOutlined, PlusOutlined, QuestionCircleOutlined, SaveOutlined, SettingOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Col, DatePicker, Divider, Empty, Form, Input, InputNumber, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import Link from "next/link";
import { useMemo } from "react";
import { pricingApi, type ConstructionStandard, type ConstructionStandardCrewRole, type PricingProtectionPolicy, type PricingRule, type PricingRuleSetSummary } from "../../../../src/features/pricing/api";
import { dictionaryApi, type DictionaryItem } from "../../../../src/features/settings/api";
import { useAuthStore } from "../../../../src/stores/auth-store";

type DictionaryOption = { value: string; label: string };
export type ConstructionCostPageSection = "hub" | "services" | "rates" | "standards";
type ServiceItemValues = { code: string; name: string; constructionTypeCode: string; serviceGroupCode: string; defaultProductCategoryCode?: string };
type RateValues = { effectiveFrom: Dayjs; effectiveTo?: Dayjs; rates: Array<{ positionTypeCode: string; hourlyCostYuan: number }> };
type StandardValues = {
  positionCostRateVersionId?: string;
  serviceItemId: string;
  vehiclePriceClassId?: string;
  constructionLocationCode: string;
  productCategoryCode?: string;
  salesUnitCode?: string;
  quantityFrom?: number;
  quantityTo?: number;
  baseConstructionChargeYuan: number;
  standardWorkMinutes: number;
  addonChargeYuan?: number;
  addonWorkMinutes?: number;
  standardCommissionYuan?: number;
  standardAllowanceYuan?: number;
  crewRoles: Array<{ positionTypeCode: string; workerCount: number; workMinutes: number }>;
};

const fallbackProtectionPolicy: PricingProtectionPolicy = {
  normalDeviationBps: 500,
  approvalDeviationBps: 1500,
  minimumMarginBps: 2000,
  blockBelowMarginBps: 0,
  softHoldHours: 24,
  allowSpecialApproval: false,
  internalLaborCostConfig: {}
};

function HelpLabel({ label, help }: { label: string; help: string }) {
  return <Space size={4}>{label}<Tooltip title={help}><QuestionCircleOutlined style={{ color: "#6b7a90", cursor: "help" }} /></Tooltip></Space>;
}

function SectionTitle({ title, help }: { title: string; help: string }) {
  return <HelpLabel label={title} help={help} />;
}

function ConstructionPageActions({ showHub }: { showHub: boolean }) {
  return <div className="construction-page-actions">
    {!showHub ? <Link href="/orders/pricing/construction-costs"><Button icon={<ArrowLeftOutlined />}>返回施工配置中心</Button></Link> : null}
    <Link href="/orders/pricing"><Button icon={<SettingOutlined />}>建议价设置</Button></Link>
    <Link href="/orders/pricing/simulator"><Button type="primary" ghost icon={<ExperimentOutlined />}>试算典型订单</Button></Link>
  </div>;
}

function optionsFromDictionary(dictionaries: DictionaryItem[], code: string): DictionaryOption[] {
  const dictionary = dictionaries.find((item) => item.code === code && item.status === "ACTIVE");
  return (dictionary?.dictionaryItems ?? [])
    .filter((item) => item.status === "ACTIVE")
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({ value: item.code, label: item.name }));
}

function labelForCode(options: DictionaryOption[], value?: string | null, fallback = "不限") {
  if (!value) return fallback;
  return options.find((item) => item.value === value)?.label ?? value;
}

function valuesOverlap(left?: string | null, right?: string | null) {
  return !left || !right || left === right;
}

function quantityRangesOverlap(leftFrom?: number | null, leftTo?: number | null, rightFrom?: number | null, rightTo?: number | null) {
  const fromLeft = leftFrom ?? Number.NEGATIVE_INFINITY;
  const toLeft = leftTo ?? Number.POSITIVE_INFINITY;
  const fromRight = rightFrom ?? Number.NEGATIVE_INFINITY;
  const toRight = rightTo ?? Number.POSITIVE_INFINITY;
  return fromLeft <= toRight && fromRight <= toLeft;
}

function standardsOverlap(left: Pick<ConstructionStandard, "vehiclePriceClassId" | "constructionLocationCode" | "productCategoryCode" | "salesUnitCode" | "quantityFrom" | "quantityTo">, right: Pick<StandardValues, "vehiclePriceClassId" | "constructionLocationCode" | "productCategoryCode" | "salesUnitCode" | "quantityFrom" | "quantityTo">) {
  return left.constructionLocationCode === right.constructionLocationCode &&
    valuesOverlap(left.vehiclePriceClassId, right.vehiclePriceClassId) &&
    valuesOverlap(left.productCategoryCode, right.productCategoryCode) &&
    valuesOverlap(left.salesUnitCode, right.salesUnitCode) &&
    quantityRangesOverlap(left.quantityFrom, left.quantityTo, right.quantityFrom, right.quantityTo);
}

function toRulePayload(rule: PricingRule) {
  return {
    group: rule.group,
    target: rule.target,
    name: rule.name,
    conditions: rule.conditions,
    actionType: rule.actionType,
    actionValue: rule.actionValue,
    priority: rule.priority,
    sortOrder: rule.sortOrder,
    enabled: rule.enabled
  };
}

function toStandardPayload(standard: ConstructionStandard) {
  return {
    serviceItemId: standard.serviceItemId,
    ...(standard.vehiclePriceClassId ? { vehiclePriceClassId: standard.vehiclePriceClassId } : {}),
    constructionLocationCode: standard.constructionLocationCode,
    ...(standard.productCategoryCode ? { productCategoryCode: standard.productCategoryCode } : {}),
    ...(standard.salesUnitCode ? { salesUnitCode: standard.salesUnitCode } : {}),
    ...(standard.quantityFrom != null ? { quantityFrom: Number(standard.quantityFrom) } : {}),
    ...(standard.quantityTo != null ? { quantityTo: Number(standard.quantityTo) } : {}),
    baseConstructionChargeCents: standard.baseConstructionChargeCents,
    standardWorkMinutes: standard.standardWorkMinutes,
    addonChargeCents: standard.addonChargeCents ?? 0,
    addonWorkMinutes: standard.addonWorkMinutes ?? 0,
    standardCommissionCents: standard.standardCommissionCents ?? 0,
    standardAllowanceCents: standard.standardAllowanceCents ?? 0,
    priority: standard.priority ?? 0,
    enabled: standard.enabled !== false,
    crewRoles: standard.crewRoles.map((role) => ({ ...role }))
  };
}

function getDraftRuleSet(ruleSets: PricingRuleSetSummary[]) {
  return ruleSets.find((item) => item.status === "DRAFT") ?? null;
}

function toProtectionPayload(policy: PricingProtectionPolicy) {
  return {
    normalDeviationBps: policy.normalDeviationBps,
    approvalDeviationBps: policy.approvalDeviationBps,
    minimumMarginBps: policy.minimumMarginBps,
    ...(policy.blockBelowMarginBps != null ? { blockBelowMarginBps: policy.blockBelowMarginBps } : {}),
    softHoldHours: policy.softHoldHours,
    allowSpecialApproval: policy.allowSpecialApproval,
    // 成本统一由岗位小时成本版本和施工标准计算，不保留旧版“基础人工费”来源。
    internalLaborCostConfig: { constructionCostSource: "STRUCTURED_STANDARD" }
  };
}

export function ConstructionCostConfigPage({ section = "hub" }: { section?: ConstructionCostPageSection }) {
  const { message } = App.useApp();
  const client = useQueryClient();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const showHub = section === "hub";
  const showServices = section === "services";
  const showRates = section === "rates";
  const showStandards = section === "standards";

  const dictionariesQuery = useQuery({ queryKey: ["store-dictionaries", storeId], queryFn: () => dictionaryApi.list(storeId!), enabled: Boolean(storeId) });
  const serviceItemsQuery = useQuery({ queryKey: ["construction-service-items", storeId], queryFn: () => pricingApi.constructionServiceItems(storeId!), enabled: Boolean(storeId) });
  const rateVersionsQuery = useQuery({ queryKey: ["position-cost-rate-versions", storeId], queryFn: () => pricingApi.positionCostRateVersions(storeId!), enabled: Boolean(storeId) });
  const ruleSetsQuery = useQuery({ queryKey: ["pricing-rule-sets", storeId], queryFn: () => pricingApi.ruleSets(storeId!), enabled: Boolean(storeId) });
  const vehicleClassesQuery = useQuery({ queryKey: ["vehicle-price-classes", storeId], queryFn: () => pricingApi.vehicleClasses(storeId!), enabled: Boolean(storeId) });

  const dictionaries = dictionariesQuery.data ?? [];
  const constructionTypeOptions = useMemo(() => optionsFromDictionary(dictionaries, "CONSTRUCTION_TYPE"), [dictionaries]);
  const locationOptions = useMemo(() => optionsFromDictionary(dictionaries, "CONSTRUCTION_LOCATION"), [dictionaries]);
  const positionOptions = useMemo(() => optionsFromDictionary(dictionaries, "CONSTRUCTION_POSITION_TYPE"), [dictionaries]);
  const categoryOptions = useMemo(() => optionsFromDictionary(dictionaries, "PRODUCT_CATEGORY"), [dictionaries]);
  const unitOptions = useMemo(() => optionsFromDictionary(dictionaries, "PRODUCT_UNIT"), [dictionaries]);
  const constructionTypeLabel = (value?: string | null) => labelForCode(constructionTypeOptions, value);
  const locationLabel = (value?: string | null) => labelForCode(locationOptions, value);
  const positionLabel = (value?: string | null) => labelForCode(positionOptions, value);
  const categoryLabel = (value?: string | null) => labelForCode(categoryOptions, value);
  const unitLabel = (value?: string | null) => labelForCode(unitOptions, value);
  const serviceItems = serviceItemsQuery.data ?? [];
  const rateVersions = rateVersionsQuery.data ?? [];
  const publishedRateVersions = rateVersions.filter((item) => item.status === "PUBLISHED");
  const draft = getDraftRuleSet(ruleSetsQuery.data ?? []);
  const serviceGroupById = useMemo(() => new Map(serviceItems.map((item) => [item.id, item.serviceGroupCode])), [serviceItems]);
  const pageTitle = showServices ? "店长：施工服务项目" : showRates ? "财务：岗位小时成本" : showStandards ? "店长：施工收费与标准工时" : "施工收费标准";
  const pageDescription = showServices
    ? "店长维护可销售、可施工的服务项目及其施工组。服务项目是后续收费标准的基础档案。"
    : showRates
      ? "财务维护岗位内部小时成本。已发布版本只影响其生效后创建的新订单，历史订单不会被改写。"
      : showStandards
        ? "店长为施工组维护一套主项目收费、标准工时和追加量规则，并绑定财务已发布的岗位成本版本。"
        : "这是施工收费标准首页。按岗位职责进入服务项目、岗位成本和施工标准维护，发布动作仍在建议价设置中完成。";

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["construction-service-items", storeId] }),
      client.invalidateQueries({ queryKey: ["position-cost-rate-versions", storeId] }),
      client.invalidateQueries({ queryKey: ["pricing-rule-sets", storeId] })
    ]);
  };

  const createServiceItem = useMutation({
    mutationFn: (values: ServiceItemValues) => pricingApi.createConstructionServiceItem({
      storeId: storeId!,
      ...values,
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
      serviceGroupCode: values.serviceGroupCode.trim()
    }),
    onSuccess: async () => { await invalidate(); message.success("施工服务项目已添加"); },
    onError: (error: Error) => message.error(error.message)
  });

  const createRateVersion = useMutation({
    mutationFn: (values: RateValues) => pricingApi.createPositionCostRateVersion({
      storeId: storeId!,
      effectiveFrom: values.effectiveFrom.toISOString(),
      ...(values.effectiveTo ? { effectiveTo: values.effectiveTo.toISOString() } : {}),
      rates: values.rates.map((rate) => ({ positionTypeCode: rate.positionTypeCode, hourlyCostCents: Math.round(rate.hourlyCostYuan * 100) }))
    }),
    onSuccess: async () => { await invalidate(); message.success("岗位小时成本草稿已创建，请核对后发布"); },
    onError: (error: Error) => message.error(error.message)
  });

  const publishRateVersion = useMutation({
    mutationFn: (id: string) => pricingApi.publishPositionCostRateVersion(id, storeId!),
    onSuccess: async () => { await invalidate(); message.success("岗位小时成本版本已发布"); },
    onError: (error: Error) => message.error(error.message)
  });

  const saveStandards = useMutation({
    mutationFn: async (values: StandardValues & { standards: ConstructionStandard[] }) => {
      if (!draft || !storeId) throw new Error("请先在建议价设置中创建一份草稿");
      const serviceGroupCode = serviceGroupById.get(values.serviceItemId);
      if (!serviceGroupCode) throw new Error("未找到主施工项目，请刷新后重新选择");
      const conflictingStandard = values.standards.find((standard) => serviceGroupById.get(standard.serviceItemId) === serviceGroupCode && standardsOverlap(standard, values));
      if (conflictingStandard) {
        throw new Error("该施工组在相同适用范围已有主标准。请保留一条作为主项目，在本条中填写“每个追加项目收费/工时”；若确需分段，请设置互不重叠的数量区间。");
      }
      const newStandard = {
        serviceItemId: values.serviceItemId,
        ...(values.vehiclePriceClassId ? { vehiclePriceClassId: values.vehiclePriceClassId } : {}),
        constructionLocationCode: values.constructionLocationCode,
        ...(values.productCategoryCode ? { productCategoryCode: values.productCategoryCode } : {}),
        ...(values.salesUnitCode ? { salesUnitCode: values.salesUnitCode } : {}),
        ...(values.quantityFrom != null ? { quantityFrom: values.quantityFrom } : {}),
        ...(values.quantityTo != null ? { quantityTo: values.quantityTo } : {}),
        baseConstructionChargeCents: Math.round(values.baseConstructionChargeYuan * 100),
        standardWorkMinutes: values.standardWorkMinutes,
        addonChargeCents: Math.round((values.addonChargeYuan ?? 0) * 100),
        addonWorkMinutes: values.addonWorkMinutes ?? 0,
        standardCommissionCents: Math.round((values.standardCommissionYuan ?? 0) * 100),
        standardAllowanceCents: Math.round((values.standardAllowanceYuan ?? 0) * 100),
        priority: 0,
        enabled: true,
        crewRoles: values.crewRoles.map((role): ConstructionStandardCrewRole => ({ ...role }))
      };
      return pricingApi.updateRuleSet(draft.id, {
        storeId,
        effectiveFrom: draft.effectiveFrom,
        ...(draft.effectiveTo ? { effectiveTo: draft.effectiveTo } : {}),
        positionCostRateVersionId: values.positionCostRateVersionId,
        rules: (draft.rules ?? []).map(toRulePayload),
        constructionStandards: [...values.standards.map(toStandardPayload), newStandard],
        protectionPolicy: toProtectionPayload(draft.protectionPolicy ?? fallbackProtectionPolicy)
      });
    },
    onSuccess: async () => { await invalidate(); message.success("施工收费与标准工时已写入建议价草稿"); },
    onError: (error: Error) => message.error(error.message)
  });

  const removeStandard = useMutation({
    mutationFn: async (standardId: string) => {
      if (!draft || !storeId) throw new Error("当前没有可编辑的建议价草稿");
      return pricingApi.updateRuleSet(draft.id, {
        storeId,
        effectiveFrom: draft.effectiveFrom,
        ...(draft.effectiveTo ? { effectiveTo: draft.effectiveTo } : {}),
        ...(draft.positionCostRateVersionId ? { positionCostRateVersionId: draft.positionCostRateVersionId } : {}),
        rules: (draft.rules ?? []).map(toRulePayload),
        constructionStandards: (draft.constructionStandards ?? []).filter((standard) => standard.id !== standardId).map(toStandardPayload),
        protectionPolicy: toProtectionPayload(draft.protectionPolicy ?? fallbackProtectionPolicy)
      });
    },
    onSuccess: async () => { await invalidate(); message.success("施工标准已从草稿移除"); },
    onError: (error: Error) => message.error(error.message)
  });

  if (!storeId) return <Alert type="warning" showIcon title="请先选择门店后再维护施工收费与成本标准" />;

  return <div className="management-page">
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div>
        <Typography.Title level={2}>{pageTitle}</Typography.Title>
        <Typography.Paragraph type="secondary">{pageDescription}</Typography.Paragraph>
        <ConstructionPageActions showHub={showHub} />
      </div>

      {showHub ? <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={8}><Card className="construction-hub-card" title={<SectionTitle title="店长：施工服务项目" help="定义门店可销售和施工的服务项目，并为同类施工指定同一施工组。" />} extra={<Tag color="blue">基础档案</Tag>}><Typography.Paragraph type="secondary">先维护服务项目和施工组。收费标准不在这里设置。</Typography.Paragraph><Link href="/orders/pricing/construction-costs/services"><Button type="primary" icon={<PlusOutlined />}>维护服务项目</Button></Link></Card></Col>
        <Col xs={24} md={12} xl={8}><Card className="construction-hub-card" title={<SectionTitle title="财务：岗位小时成本" help="维护施工岗位的内部小时成本；该成本不向客户或销售展示。" />} extra={<Tag color="gold">财务维护</Tag>}><Typography.Paragraph type="secondary">独立新建、核对并发布成本版本，供店长选择。</Typography.Paragraph><Link href="/orders/pricing/construction-costs/rates"><Button type="primary" icon={<SettingOutlined />}>维护岗位成本</Button></Link></Card></Col>
        <Col xs={24} md={12} xl={8}><Card className="construction-hub-card" title={<SectionTitle title="店长：施工收费与标准工时" help="将主项目收费、追加量和班组工时写入建议价草稿。" />} extra={<Tag color="purple">随建议价发布</Tag>}><Typography.Paragraph type="secondary">一组只维护一套主标准，附加产品按追加收费和追加工时计算。</Typography.Paragraph><Link href="/orders/pricing/construction-costs/standards"><Button type="primary" icon={<SaveOutlined />}>维护施工标准</Button></Link></Card></Col>
        <Col xs={24}><Alert type="info" showIcon title="推荐配置顺序：服务项目 → 岗位小时成本 → 施工收费与标准工时 → 建议价发布与试运行" description="岗位、施工类型、地点、产品分类和单位均来自系统字典。店长和财务只进入各自职责页面，建议价发布仍由店长在“建议价设置”中操作。" /></Col>
      </Row> : null}

      {showServices ? <Card title={<SectionTitle title="店长：维护施工服务项目" help="先定义门店可销售和施工的服务项目；后续施工收费与标准工时均从这里选择。" />} extra={<Tag color="blue">基础档案</Tag>}>
        <Form<ServiceItemValues> layout="vertical" onFinish={(values) => createServiceItem.mutate(values)} initialValues={{ constructionTypeCode: constructionTypeOptions[0]?.value, defaultProductCategoryCode: categoryOptions[0]?.value }}>
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12} lg={5}><Form.Item label={<HelpLabel label="项目编码" help="门店内部唯一编码，仅用于系统识别；建议使用易读的英文缩写，例如 PPF_FULL。" />} name="code" rules={[{ required: true, message: "请输入编码，例如 PPF_FULL" }]}><Input placeholder="例如 PPF_FULL" /></Form.Item></Col>
            <Col xs={24} sm={12} lg={5}><Form.Item label={<HelpLabel label="项目名称" help="页面和报价中展示的中文服务名称，例如“全车漆面保护膜”。" />} name="name" rules={[{ required: true, message: "请输入项目名称" }]}><Input placeholder="例如 全车漆面保护膜" /></Form.Item></Col>
            <Col xs={24} sm={12} lg={4}><Form.Item label={<HelpLabel label="施工类型" help="从系统字典选择，用于将服务项目归入漆面保护膜、改色膜等业务类型。" />} name="constructionTypeCode" rules={[{ required: true }]}><Select options={constructionTypeOptions} /></Form.Item></Col>
            <Col xs={24} sm={12} lg={4}><Form.Item label={<HelpLabel label="施工组名称" help="同一施工流程的服务项目归入同一组。请使用业务名称，例如“全车漆面保护膜”；同组只能维护一条相同适用范围的主标准，额外产品通过追加收费和追加工时处理。" />} name="serviceGroupCode" rules={[{ required: true, message: "请输入施工组名称" }]}><Input placeholder="例如 全车漆面保护膜" /></Form.Item></Col>
            <Col xs={24} sm={12} lg={4}><Form.Item label={<HelpLabel label="默认产品分类" help="可选。用于缩小施工标准的适用范围；不填表示该服务可搭配任意产品分类。" />} name="defaultProductCategoryCode"><Select allowClear options={categoryOptions} /></Form.Item></Col>
            <Col xs={24} sm={12} lg={2}><Form.Item label={<HelpLabel label="操作" help="保存后项目会出现在下方施工标准的“施工服务项目”下拉框中。" />}><Button className="construction-primary-action" type="primary" htmlType="submit" loading={createServiceItem.isPending} icon={<PlusOutlined />}>添加服务项目</Button></Form.Item></Col>
          </Row>
        </Form>
        <Table rowKey="id" size="small" loading={serviceItemsQuery.isLoading} dataSource={serviceItems} pagination={false} columns={[
          { title: <HelpLabel label="编码" help="项目的系统识别码，不在对客报价中显示。" />, dataIndex: "code" }, { title: <HelpLabel label="项目" help="门店业务人员看到的服务名称。" />, dataIndex: "name" }, { title: <HelpLabel label="施工类型" help="系统字典中的业务类型。" />, dataIndex: "constructionTypeCode", render: constructionTypeLabel }, { title: <HelpLabel label="施工组" help="同组标准按“主项目加追加量”计算；建议使用中文业务名称。" />, dataIndex: "serviceGroupCode" }, { title: <HelpLabel label="默认产品分类" help="未填写时表示不限产品分类。" />, dataIndex: "defaultProductCategoryCode", render: categoryLabel }, { title: <HelpLabel label="状态" help="只有启用的服务项目能用于新的施工标准。" />, dataIndex: "status", render: (value) => <Tag color={value === "ACTIVE" ? "success" : "default"}>{value === "ACTIVE" ? "启用" : "停用"}</Tag> }
        ]} locale={{ emptyText: <Empty description="先添加门店常用施工服务项目" /> }} />
      </Card> : null}

      {showRates ? <Card title={<SectionTitle title="财务：维护并发布岗位小时成本" help="这是施工岗位的内部标准小时成本。财务发布后，店长才能把它绑定到施工标准；销售和客户不可见。" />} extra={<Tag color="gold">内部成本</Tag>}>
        <Typography.Paragraph type="secondary">金额是岗位的标准小时成本，不是对客施工收费，也不会展示给销售。已发布版本不可修改，如调薪请新建版本。</Typography.Paragraph>
        <Form<RateValues> layout="vertical" onFinish={(values) => createRateVersion.mutate(values)} initialValues={{ effectiveFrom: dayjs(), rates: positionOptions.slice(0, 1).map((item) => ({ positionTypeCode: item.value, hourlyCostYuan: 0 })) }}>
          <Row gutter={[16, 0]}>
            <Col xs={24} sm={12} lg={5}><Form.Item label={<HelpLabel label="生效日期" help="该成本版本从此日期开始用于新订单的预计施工成本。" />} name="effectiveFrom" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={24} sm={12} lg={5}><Form.Item label={<HelpLabel label="结束日期（可选）" help="留空表示持续有效；填写后该版本只在这段日期内可用。" />} name="effectiveTo"><DatePicker style={{ width: "100%" }} /></Form.Item></Col>
          </Row>
          <Form.List name="rates">
            {(fields, { add, remove }) => <Card size="small" title={<SectionTitle title="岗位小时成本明细" help="为该成本版本逐一设置岗位的内部每小时成本。后续施工标准里出现的岗位，必须在这里配置。" />}>
              <Space direction="vertical" style={{ width: "100%" }}>
                {fields.map((field) => <Space key={field.key} wrap align="start">
                  <Form.Item {...field} label={<HelpLabel label="岗位" help="从系统字典选择施工岗位；必须覆盖后续施工标准班组中使用的岗位。" />} name={[field.name, "positionTypeCode"]} rules={[{ required: true }]}><Select style={{ minWidth: 180 }} options={positionOptions} /></Form.Item>
                  <Form.Item {...field} label={<HelpLabel label="小时成本（元）" help="该岗位每小时的内部成本，包含门店确定的标准人工成本口径，不是对客收费。" />} name={[field.name, "hourlyCostYuan"]} rules={[{ required: true }]}><InputNumber min={0} precision={2} prefix="¥" /></Form.Item>
                  <Button danger type="text" icon={<DeleteOutlined />} disabled={fields.length === 1} onClick={() => remove(field.name)}>移除</Button>
                </Space>)}
                <div className="construction-form-actions"><Button type="dashed" onClick={() => add({ positionTypeCode: positionOptions[0]?.value, hourlyCostYuan: 0 })} icon={<PlusOutlined />}>添加岗位</Button><Button className="construction-primary-action" type="primary" htmlType="submit" loading={createRateVersion.isPending} icon={<SaveOutlined />}>保存成本草稿</Button></div>
              </Space>
            </Card>}
          </Form.List>
        </Form>
        <Divider />
        <Table rowKey="id" size="small" loading={rateVersionsQuery.isLoading} dataSource={rateVersions} pagination={false} columns={[
          { title: <HelpLabel label="版本" help="每次成本调整新建一个版本，已发布版本不可修改。" />, dataIndex: "version", render: (value) => `v${value}` }, { title: <HelpLabel label="状态" help="只有“已发布”版本可绑定到施工标准。" />, dataIndex: "status", render: (value) => <Tag color={value === "PUBLISHED" ? "success" : value === "DRAFT" ? "processing" : "default"}>{value === "PUBLISHED" ? "已发布" : value === "DRAFT" ? "草稿" : "已停用"}</Tag> }, { title: <HelpLabel label="生效" help="成本版本开始适用新订单的日期。" />, dataIndex: "effectiveFrom", render: (value) => dayjs(value).format("YYYY-MM-DD") }, { title: <HelpLabel label="岗位小时成本" help="以中文岗位名展示的内部成本，不向销售和客户公开。" />, render: (_, row) => row.rates.map((rate) => `${positionLabel(rate.positionTypeCode)} ¥${(rate.hourlyCostCents / 100).toFixed(2)}/小时`).join("；") }, { title: <HelpLabel label="操作" help="发布前请确认金额和生效日期；发布后不能原地修改。" />, render: (_, row) => row.status === "DRAFT" ? <Button className="construction-primary-action" size="small" type="primary" loading={publishRateVersion.isPending} onClick={() => publishRateVersion.mutate(row.id)}>核对后发布</Button> : "—" }
        ]} />
        {rateVersionsQuery.isError ? <Alert style={{ marginTop: 16 }} type="warning" showIcon title="只有财务、店长或管理员可以查看和维护岗位小时成本" /> : null}
      </Card> : null}

      {showStandards ? <Card title={<SectionTitle title="施工标准配置" help="由店长为一个施工组定义对客主项目收费、追加量、标准用时和班组构成；这些业务标准与建议价草稿一同发布。" />} extra={<Tag color="purple">店长维护 · 随建议价版本发布</Tag>}>
        {!draft ? <Alert type="warning" showIcon title="尚无可编辑草稿" description={<span>请先到 <Link href="/orders/pricing">建议价设置</Link> 点击“开始设置建议价”或“编辑当前建议价”，再返回本页维护施工标准。</span>} /> : <>
          <Alert type="info" showIcon style={{ marginBottom: 16 }} title="同一施工组只保存一条主标准，追加量不再新增标准" description="选择一个主施工项目后，填写一次主项目收费和主项目标准工时；订单中同组的第 2 个及之后产品，自动按“每个追加项目收费/工时”累加。不要再为追加产品新建相同适用范围的标准。只有收费确实随单个产品数量分段变化时，才新增下一条且数量区间必须不重叠，例如 1–2 与 3–5。" />
          <Typography.Paragraph type="secondary">选择已发布岗位小时成本版本，维护一条主项目及其追加量的对客收费、标准工时和班组配置。系统会在保存前和服务端再次按施工组检查冲突。</Typography.Paragraph>
          <Form<StandardValues> layout="vertical" onFinish={(values) => saveStandards.mutate({ ...values, standards: draft.constructionStandards ?? [] })} initialValues={{ positionCostRateVersionId: draft.positionCostRateVersionId ?? publishedRateVersions[0]?.id, constructionLocationCode: locationOptions[0]?.value, crewRoles: positionOptions.slice(0, 1).map((item) => ({ positionTypeCode: item.value, workerCount: 1, workMinutes: 60 })) }}>
            <Row gutter={[16, 0]}>
              <Col xs={24} sm={12} lg={6}><Form.Item label={<HelpLabel label="岗位小时成本版本" help="选择财务已发布的内部成本版本。系统按该版本和下方班组工时计算预计施工成本。" />} name="positionCostRateVersionId" rules={[{ required: true, message: "请选择已发布版本" }]}><Select placeholder="请选择已发布版本" options={publishedRateVersions.map((item) => ({ value: item.id, label: `v${item.version}（${dayjs(item.effectiveFrom).format("YYYY-MM-DD")}）` }))} /></Form.Item></Col>
              <Col xs={24} sm={12} lg={6}><Form.Item label={<HelpLabel label="主施工项目" help="选择该施工组唯一的主项目。相同施工组、相同适用范围不能再添加另一条主标准；同组额外产品请使用下方“每个追加项目”字段。" />} name="serviceItemId" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={serviceItems.filter((item) => item.status === "ACTIVE").map((item) => ({ value: item.id, label: item.name }))} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="施工地点" help="区分到店和外出；不同地点可维护不同收费和工时。" />} name="constructionLocationCode" rules={[{ required: true }]}><Select options={locationOptions} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="车型级别（可选）" help="不填则适用于所有车型；填写后仅适用于该价格级别。" />} name="vehiclePriceClassId"><Select allowClear options={(vehicleClassesQuery.data ?? []).filter((item) => item.status === "ACTIVE").map((item) => ({ value: item.id, label: item.name }))} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="产品分类（可选）" help="不填则不限产品分类；可用于区分不同膜类或改装类的标准。" />} name="productCategoryCode"><Select allowClear options={categoryOptions} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="销售单位（可选）" help="不填则适用于所有销售单位；例如按米销售与按卷销售可以使用不同标准。" />} name="salesUnitCode"><Select allowClear options={unitOptions} /></Form.Item></Col>
            </Row>
            <Row gutter={[16, 0]}>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="数量下限（可选）" help="从此数量开始适用本规则；与数量上限配合实现分段收费。" />} name="quantityFrom"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="数量上限（可选）" help="到此数量结束适用本规则；同一合并组内不得与其他规则重叠。" />} name="quantityTo"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="主项目收费（元）" help="只对同组的第一个产品收取一次的对客施工服务费，是建议施工收费的一部分，不是内部成本。" />} name="baseConstructionChargeYuan" rules={[{ required: true }]}><InputNumber min={0} precision={2} prefix="¥" style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="主项目标准工时（分钟）" help="同组第一个产品的标准总施工时长，用于排班和预计成本计算。" />} name="standardWorkMinutes" rules={[{ required: true }]}><InputNumber min={1} style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="每个追加项目收费（元）" help="同组第 2 个及之后每个产品增加的对客施工收费。不要为追加产品新增同范围标准；无追加量可填 0。" />} name="addonChargeYuan"><InputNumber min={0} precision={2} prefix="¥" style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="每个追加项目工时（分钟）" help="同组第 2 个及之后每个产品增加的标准工时。无追加量可填 0。" />} name="addonWorkMinutes"><InputNumber min={0} style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="标准提成（元）" help="该标准服务对应的个人提成基准；实际提成仍以完工后结算记录为准。" />} name="standardCommissionYuan"><InputNumber min={0} precision={2} prefix="¥" style={{ width: "100%" }} /></Form.Item></Col>
              <Col xs={12} sm={8} lg={3}><Form.Item label={<HelpLabel label="标准补贴（元）" help="该标准服务的固定补贴基准，例如外出或特殊工况补贴。" />} name="standardAllowanceYuan"><InputNumber min={0} precision={2} prefix="¥" style={{ width: "100%" }} /></Form.Item></Col>
            </Row>
            <Form.List name="crewRoles">
              {(fields, { add, remove }) => <Card size="small" title={<SectionTitle title="施工班组与岗位工时" help="定义完成这项服务需要哪些岗位、各几人以及每人标准工时；系统据此结合岗位小时成本预估内部施工成本。" />}>
                {fields.map((field) => <Space key={field.key} wrap align="start">
                  <Form.Item {...field} label={<HelpLabel label="岗位" help="从系统字典选择实际参与施工的岗位。" />} name={[field.name, "positionTypeCode"]} rules={[{ required: true }]}><Select style={{ minWidth: 180 }} options={positionOptions} /></Form.Item>
                  <Form.Item {...field} label={<HelpLabel label="人数" help="该岗位参与本项施工的标准人数。" />} name={[field.name, "workerCount"]} rules={[{ required: true }]}><InputNumber min={1} /></Form.Item>
                  <Form.Item {...field} label={<HelpLabel label="每人标准工时（分钟）" help="单个该岗位人员的标准作业分钟数；用于按岗位小时成本计算预计施工成本。" />} name={[field.name, "workMinutes"]} rules={[{ required: true }]}><InputNumber min={1} /></Form.Item>
                  <Button danger type="text" icon={<DeleteOutlined />} disabled={fields.length === 1} onClick={() => remove(field.name)}>移除</Button>
                </Space>)}
                <Button type="dashed" onClick={() => add({ positionTypeCode: positionOptions[0]?.value, workerCount: 1, workMinutes: 60 })} icon={<PlusOutlined />}>添加岗位</Button>
              </Card>}
            </Form.List>
            <div className="construction-form-actions construction-form-actions-spaced"><Button className="construction-primary-action" type="primary" htmlType="submit" loading={saveStandards.isPending} icon={<SaveOutlined />}>保存施工标准到草稿</Button></div>
          </Form>
          <Divider />
          <Table rowKey={(row) => row.id ?? `${row.serviceItemId}-${row.constructionLocationCode}-${row.baseConstructionChargeCents}`} size="small" dataSource={draft.constructionStandards ?? []} pagination={false} columns={[
            { title: <HelpLabel label="主施工项目" help="该施工组唯一的主项目。额外同组产品不另建标准，而是使用追加规则。" />, render: (_, row) => row.serviceItem?.name ?? "未找到服务项目" }, { title: <HelpLabel label="适用范围" help="以中文展示车型、地点、产品分类和销售单位；“不限”表示不限制该条件。" />, render: (_, row) => [row.vehiclePriceClass?.name ?? "全部车型", locationLabel(row.constructionLocationCode), categoryLabel(row.productCategoryCode), unitLabel(row.salesUnitCode)].join(" / ") }, { title: <HelpLabel label="主项目收费" help="同组第一个产品收取一次的对客施工服务费。" />, render: (_, row) => `¥${(row.baseConstructionChargeCents / 100).toFixed(2)}` }, { title: <HelpLabel label="追加规则" help="同组第 2 个及之后每个产品，按此金额与工时累加；不需要另建施工标准。" />, render: (_, row) => `每个追加 ¥${((row.addonChargeCents ?? 0) / 100).toFixed(2)} / ${row.addonWorkMinutes ?? 0} 分钟` }, { title: <HelpLabel label="主项目工时" help="用于排班和预计成本计算的主项目标准时长。" />, dataIndex: "standardWorkMinutes", render: (value) => `${value} 分钟` }, { title: <HelpLabel label="班组" help="以中文岗位名展示标准班组人数和每人作业时长。" />, render: (_, row) => row.crewRoles.map((role) => `${positionLabel(role.positionTypeCode)} ×${role.workerCount}（${role.workMinutes}分）`).join("；") }, { title: <HelpLabel label="操作" help="仅草稿标准可以移除；已发布版本不会被原地修改。" />, render: (_, row) => row.id ? <Popconfirm title="移除这条草稿施工标准？" onConfirm={() => removeStandard.mutate(row.id!)}><Button danger size="small">移除</Button></Popconfirm> : "—" }
          ]} locale={{ emptyText: <Empty description="尚未配置施工收费与标准工时" /> }} />
        </>}
      </Card> : null}

      {showStandards ? <Card size="small" title={<SectionTitle title="发布与启用检查" help="施工标准随建议价草稿一同检查、发布和启用；请先在试运行中核对建议价、收费与成本。" />}>
        <Typography.Paragraph>返回“建议价设置”执行“检查规则和冲突”及“确认发布并生效”。随后先选择“观察试运行”，核对典型订单的建议价、施工收费和预计成本；预检无误后才选择“正式启用”。</Typography.Paragraph>
        <div className="construction-form-actions"><Link href="/orders/pricing?view=versions"><Button type="primary" icon={<CheckCircleOutlined />}>进入发布与试运行</Button></Link><Link href="/orders/pricing/simulator"><Button icon={<ExperimentOutlined />}>试算典型订单</Button></Link></div>
      </Card> : null}
    </Space>
  </div>;
}

export default ConstructionCostConfigPage;
