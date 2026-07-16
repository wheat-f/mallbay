"use client";

import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { Alert, App, Button, Card, Empty, InputNumber, Select, Space, Table, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { pricingApi, type PricingCalculationResponse } from "../../../../src/features/pricing/api";
import { productApi } from "../../../../src/features/products/api";
import { dictionaryApi, type DictionaryItem } from "../../../../src/features/settings/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { StorePageHeader } from "../../../../src/features/workbench/store-page-header";

type PricingProduct = {
  id: string;
  brand: string;
  name: string;
  model: string;
  category: string;
  salesUnit: string;
  basePriceCents: number;
};

type SimulationLine = { id: string; productId?: string; quantity: number };

const STAGE_LABELS: Record<string, string> = {
  BASE: "基础价格",
  PRODUCT: "产品规则",
  PRODUCT_RULE: "产品规则",
  VEHICLE: "车型规则",
  VEHICLE_RULE: "车型规则",
  CONSTRUCTION: "施工规则",
  CONSTRUCTION_RULE: "施工规则",
  ORDER: "整单规则",
  ORDER_RULE: "整单规则"
};

function dictionaryOptions(dictionaries: DictionaryItem[], code: string) {
  return (dictionaries.find((item) => item.code === code && item.status === "ACTIVE")?.dictionaryItems ?? [])
    .filter((item) => item.status === "ACTIVE")
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => ({ value: item.code, label: item.name }));
}

function yuan(cents: number) {
  return `¥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function newLine(index: number): SimulationLine {
  return { id: `line-${Date.now()}-${index}`, quantity: 1 };
}

export default function PricingSimulatorPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const [constructionType, setConstructionType] = useState<string>();
  const [constructionLocation, setConstructionLocation] = useState<string>();
  const [vehicleClassCode, setVehicleClassCode] = useState<string>();
  const [baseLaborYuan, setBaseLaborYuan] = useState(0);
  const [lines, setLines] = useState<SimulationLine[]>([newLine(0)]);
  const [result, setResult] = useState<PricingCalculationResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const rulesQuery = useQuery({
    queryKey: ["pricing-rule-sets", storeId],
    queryFn: () => pricingApi.ruleSets(storeId!),
    enabled: Boolean(storeId)
  });
  const productsQuery = useQuery({
    queryKey: ["pricing-simulator-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, status: "ACTIVE", page: 1, pageSize: 200 }),
    enabled: Boolean(storeId)
  });
  const dictionariesQuery = useQuery({
    queryKey: ["store-dictionaries", storeId],
    queryFn: () => dictionaryApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const classesQuery = useQuery({
    queryKey: ["vehicle-price-classes", storeId],
    queryFn: () => pricingApi.vehicleClasses(storeId!),
    enabled: Boolean(storeId)
  });

  const products = useMemo(() => (productsQuery.data?.items ?? []) as PricingProduct[], [productsQuery.data]);
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const dictionaries = useMemo(() => dictionariesQuery.data ?? [], [dictionariesQuery.data]);
  const constructionTypes = useMemo(() => dictionaryOptions(dictionaries, "CONSTRUCTION_TYPE"), [dictionaries]);
  const constructionLocations = useMemo(() => dictionaryOptions(dictionaries, "CONSTRUCTION_LOCATION"), [dictionaries]);
  const unitLabels = useMemo(() => new Map(dictionaryOptions(dictionaries, "PRODUCT_UNIT").map((item) => [item.value, item.label])), [dictionaries]);
  const publishedRuleSet = useMemo(
    () => (rulesQuery.data ?? []).find((item) => item.status === "PUBLISHED") ?? null,
    [rulesQuery.data]
  );

  useEffect(() => {
    if (!constructionType && constructionTypes[0]) setConstructionType(constructionTypes[0].value);
    if (!constructionLocation && constructionLocations[0]) setConstructionLocation(constructionLocations[0].value);
  }, [constructionLocation, constructionLocations, constructionType, constructionTypes]);

  const updateLine = (id: string, patch: Partial<SimulationLine>) => {
    setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
    setResult(null);
  };

  const simulate = async () => {
    if (!storeId) return message.error("当前账号尚未加入门店");
    if (!publishedRuleSet) return message.error("当前门店还没有已发布的建议价方案");
    if (!constructionType || !constructionLocation) return message.error("请先选择施工项目和施工地点");
    if (lines.some((line) => !line.productId || line.quantity <= 0)) return message.error("请完整选择试算产品并填写数量");
    try {
      setLoading(true);
      const next = await pricingApi.calculate({
        storeId,
        ruleSetId: publishedRuleSet.id,
        input: {
          ruleSetVersion: publishedRuleSet.version,
          constructionType,
          constructionLocation,
          vehicleClassCode,
          baseLaborCostCents: Math.round(baseLaborYuan * 100),
          lines: lines.map((line) => {
            const product = productMap.get(line.productId!)!;
            return {
              id: line.id,
              productId: product.id,
              category: product.category,
              brand: product.brand,
              model: product.model,
              salesUnit: product.salesUnit,
              quantity: line.quantity,
              baseUnitPriceCents: product.basePriceCents
            };
          })
        }
      });
      setResult(next);
      message.success("试算完成");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "试算失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="management-page pricing-simulator-page">
      <StorePageHeader
        title="建议价试算"
        description="按门店当前已发布方案模拟一笔订单，不会生成真实订单。"
        actions={<Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/orders/pricing?view=price")}>返回建议价设置</Button>}
      />

      <Alert
        className="pricing-simulator-notice"
        type="info"
        showIcon
        title={publishedRuleSet ? `本次使用当前生效方案 v${publishedRuleSet.version}` : "当前门店还没有已发布的建议价方案"}
        description="产品基础价、产品单位和规则参数均由系统读取，店长只需按实际订单选择业务条件。"
      />

      <Card className="pricing-simulator-card" title="1. 选择订单条件">
        <div className="pricing-simulator-condition-grid">
          <label>施工项目<Select value={constructionType} onChange={(value) => { setConstructionType(value); setResult(null); }} options={constructionTypes} placeholder="选择施工项目" /></label>
          <label>施工地点<Select value={constructionLocation} onChange={(value) => { setConstructionLocation(value); setResult(null); }} options={constructionLocations} placeholder="选择施工地点" /></label>
          <label>车型级别（选填）<Select allowClear value={vehicleClassCode} onChange={(value) => { setVehicleClassCode(value); setResult(null); }} options={(classesQuery.data ?? []).map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` }))} placeholder="未选择时不套用车型规则" /></label>
          <label>基础人工费<InputNumber min={0} precision={2} prefix="¥" value={baseLaborYuan} onChange={(value) => { setBaseLaborYuan(value ?? 0); setResult(null); }} /></label>
        </div>
      </Card>

      <Card
        className="pricing-simulator-card"
        title="2. 添加试算产品"
        extra={<Button icon={<PlusOutlined />} onClick={() => setLines((current) => [...current, newLine(current.length)])}>添加产品</Button>}
      >
        <div className="pricing-simulator-lines">
          {lines.map((line, index) => {
            const product = line.productId ? productMap.get(line.productId) : undefined;
            return (
              <div className="pricing-simulator-line" key={line.id}>
                <span className="pricing-simulator-line-number">{index + 1}</span>
                <label>产品<Select showSearch optionFilterProp="label" value={line.productId} onChange={(value) => updateLine(line.id, { productId: value })} options={products.map((item) => ({ value: item.id, label: `${item.brand} / ${item.name} / ${item.model}` }))} placeholder="选择产品" /></label>
                <label>数量<InputNumber min={0.001} value={line.quantity} onChange={(value) => updateLine(line.id, { quantity: value ?? 1 })} /></label>
                <div className="pricing-simulator-unit"><span>单位</span><strong>{product ? unitLabels.get(product.salesUnit) ?? product.salesUnit : "—"}</strong></div>
                <div className="pricing-simulator-base"><span>产品基础价</span><strong>{product ? yuan(product.basePriceCents) : "—"}</strong></div>
                <Button aria-label={`删除第 ${index + 1} 个产品`} icon={<DeleteOutlined />} danger disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} />
              </div>
            );
          })}
        </div>
        <div className="pricing-simulator-submit">
          <Typography.Text type="secondary">系统会依次套用产品、车型、施工和整单规则。</Typography.Text>
          <Button type="primary" size="large" loading={loading} disabled={!publishedRuleSet} onClick={simulate}>开始试算</Button>
        </div>
      </Card>

      {result ? (
        <Card className="pricing-simulator-result" title="3. 试算结果" extra={<Tag color={result.guard?.decision === "BLOCKED" ? "error" : result.guard?.decision === "APPROVAL_REQUIRED" ? "warning" : "success"}><SafetyCertificateOutlined /> {result.guard?.decision === "BLOCKED" ? "低于保护价" : result.guard?.decision === "APPROVAL_REQUIRED" ? "需要审批" : "价格正常"}</Tag>}>
          <div className="pricing-simulator-totals">
            <div><span>产品合计</span><strong>{yuan(result.calculation.suggestedProductAmountCents)}</strong></div>
            <div><span>建议人工费</span><strong>{yuan(result.calculation.suggestedLaborCostCents)}</strong></div>
            <div className="is-total"><span>建议总价</span><strong>{yuan(result.calculation.suggestedTotalCents)}</strong></div>
          </div>
          <Typography.Title level={5}>逐产品建议价</Typography.Title>
          <Table
            rowKey="id"
            pagination={false}
            dataSource={result.calculation.lines}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无试算结果" /> }}
            columns={[
              { title: "产品", render: (_, row) => { const product = productMap.get(row.productId); return product ? `${product.brand} / ${product.name} / ${product.model}` : row.productId; } },
              { title: "数量", dataIndex: "quantity" },
              { title: "建议单价", dataIndex: "suggestedUnitPriceCents", render: yuan },
              { title: "建议金额", dataIndex: "suggestedAmountCents", render: yuan }
            ]}
          />
          <Typography.Title className="pricing-simulator-step-title" level={5}>价格调整明细</Typography.Title>
          <Table
            rowKey={(row) => `${row.ruleId}-${row.lineId ?? "order"}-${row.stage}`}
            pagination={false}
            dataSource={result.calculation.calculationSteps ?? []}
            locale={{ emptyText: "本次没有命中额外价格规则" }}
            columns={[
              { title: "调整阶段", dataIndex: "stage", render: (value: string) => STAGE_LABELS[value] ?? "价格调整" },
              { title: "命中规则", dataIndex: "ruleName", render: (value: string) => value || "系统基础价格" },
              { title: "调整前", dataIndex: "beforeCents", render: yuan },
              { title: "调整后", dataIndex: "afterCents", render: yuan }
            ]}
          />
        </Card>
      ) : null}
    </div>
  );
}
