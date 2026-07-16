"use client";

import { Alert, App, Button, Card, Input, Space, Table, Typography } from "antd";
import { useState } from "react";
import { pricingApi, type PricingCalculationResponse } from "../../../../src/features/pricing/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { StorePageHeader } from "../../../../src/features/workbench/store-page-header";

const DEFAULT_INPUT = JSON.stringify({
  ruleSetVersion: 1,
  constructionType: "PPF",
  constructionLocation: "IN_STORE",
  vehicleClassCode: "",
  baseLaborCostCents: 0,
  lines: [{ id: "line-1", productId: "请替换为产品ID", category: "", brand: "", model: "", salesUnit: "ROLL", quantity: 1, baseUnitPriceCents: 0 }]
}, null, 2);

export default function PricingSimulatorPage() {
  const { message } = App.useApp();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const [ruleSetId, setRuleSetId] = useState("");
  const [inputText, setInputText] = useState(DEFAULT_INPUT);
  const [result, setResult] = useState<PricingCalculationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const simulate = async () => {
    if (!storeId) return message.error("当前账号尚未加入门店");
    try {
      setLoading(true);
      const input = JSON.parse(inputText);
      const next = await pricingApi.calculate({ storeId, ruleSetId: ruleSetId.trim() || undefined, input });
      setResult(next);
    } catch (error) {
      message.error(error instanceof Error ? error.message : "试算失败");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="management-page">
      <StorePageHeader title="建议价试算明细" description="使用门店当前已发布规则进行服务端试算，产品基础价由服务端读取。" />
      <Alert className="mb-4" type="info" showIcon title="仅用于模拟，不会创建订单；正式订单必须复用服务端计算快照。" />
      <Card title="试算输入" extra={<Button type="primary" loading={loading} onClick={simulate}>开始试算</Button>}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input placeholder="可选：规则集 ID；为空时使用当前已发布版本" value={ruleSetId} onChange={(event) => setRuleSetId(event.target.value)} />
          <Input.TextArea rows={16} value={inputText} onChange={(event) => setInputText(event.target.value)} />
        </Space>
      </Card>
      {result ? (
        <Card className="mt-4" title="试算结果">
          <Typography.Paragraph>建议产品合计：¥{(result.calculation.suggestedProductAmountCents / 100).toFixed(2)}；建议人工费：¥{(result.calculation.suggestedLaborCostCents / 100).toFixed(2)}；建议总价：¥{(result.calculation.suggestedTotalCents / 100).toFixed(2)}</Typography.Paragraph>
          <Table rowKey={(row) => row.ruleId + (row.lineId ?? "")} pagination={false} dataSource={result.calculation.calculationSteps ?? []} columns={[
            { title: "阶段", dataIndex: "stage" },
            { title: "规则", dataIndex: "ruleName" },
            { title: "调整前", dataIndex: "beforeCents", render: (value: number) => "¥" + (value / 100).toFixed(2) },
            { title: "调整后", dataIndex: "afterCents", render: (value: number) => "¥" + (value / 100).toFixed(2) }
          ]} />
        </Card>
      ) : null}
    </div>
  );
}
