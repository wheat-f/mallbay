"use client";

import { ArrowLeftOutlined, CheckCircleFilled, ClockCircleOutlined, StopOutlined } from "@ant-design/icons";
import { Button, Card, Descriptions, Empty, Space, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { pricingApi, type PricingRule } from "../../../../../src/features/pricing/api";
import {
  formatPercent,
  formatRuleSentence
} from "../../../../../src/features/pricing/pricing-workspace";
import { dictionaryApi, type DictionaryItem } from "../../../../../src/features/settings/api";
import { useAuthStore } from "../../../../../src/stores/auth-store";
import { StorePageHeader } from "../../../../../src/features/workbench/store-page-header";

function statusDisplay(status: "DRAFT" | "PUBLISHED" | "RETIRED") {
  if (status === "PUBLISHED") return { color: "success", label: "当前生效", icon: <CheckCircleFilled /> };
  if (status === "DRAFT") return { color: "processing", label: "编辑中的草稿", icon: <ClockCircleOutlined /> };
  return { color: "default", label: "已停用", icon: <StopOutlined /> };
}

function dictionaryCodeForField(field?: string) {
  if (field === "productCategory") return "PRODUCT_CATEGORY";
  if (field === "constructionType") return "CONSTRUCTION_TYPE";
  if (field === "constructionLocation") return "CONSTRUCTION_LOCATION";
  if (field === "salesUnit") return "PRODUCT_UNIT";
  return null;
}

function buildDictionaryLabelMap(dictionaries: DictionaryItem[]) {
  const map = new Map<string, string>();
  for (const dictionary of dictionaries) {
    for (const item of dictionary.dictionaryItems ?? []) {
      map.set(`${dictionary.code}:${item.code}`, item.name);
    }
  }
  return map;
}

export default function PricingRuleSetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const query = useQuery({
    queryKey: ["pricing-rule-set", id, storeId],
    queryFn: () => pricingApi.ruleSet(id, storeId!),
    enabled: Boolean(id && storeId)
  });
  const dictionariesQuery = useQuery({
    queryKey: ["store-dictionaries", storeId],
    queryFn: () => dictionaryApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const labelMap = useMemo(() => buildDictionaryLabelMap(dictionariesQuery.data ?? []), [dictionariesQuery.data]);
  const ruleSet = query.data;
  const status = ruleSet ? statusDisplay(ruleSet.status) : null;
  const policy = ruleSet?.protectionPolicy;

  const valueLabel = (rule: PricingRule) => {
    const condition = rule.conditions[0];
    const dictionaryCode = dictionaryCodeForField(condition?.field);
    const rawValue = Array.isArray(condition?.value) ? condition.value.join("、") : String(condition?.value ?? "");
    return dictionaryCode ? labelMap.get(`${dictionaryCode}:${rawValue}`) ?? rawValue : rawValue;
  };

  return (
    <div className="management-page pricing-workspace-page">
      <StorePageHeader
        title="建议价方案详情"
        description="用业务语言查看本版本的价格规则和保护条件。已发布版本会永久保留，不能原地修改。"
        actions={(
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/orders/pricing?view=versions")}>
            返回设置中心
          </Button>
        )}
      />

      {ruleSet ? (
        <>
          <Card loading={query.isLoading} className="pricing-version-summary-card">
            <div className="pricing-version-summary-head">
              <div>
                <Tag color={status?.color} icon={status?.icon}>{status?.label}</Tag>
                <Typography.Title level={3}>建议价方案 v{ruleSet.version}</Typography.Title>
              </div>
              {ruleSet.status === "DRAFT" ? (
                <Button type="primary" onClick={() => router.push("/orders/pricing?view=price")}>继续编辑草稿</Button>
              ) : null}
            </div>
            <Descriptions column={{ xs: 1, sm: 2, lg: 3 }}>
              <Descriptions.Item label="开始生效">{dayjs(ruleSet.effectiveFrom).format("YYYY-MM-DD HH:mm")}</Descriptions.Item>
              <Descriptions.Item label="结束时间">{ruleSet.effectiveTo ? dayjs(ruleSet.effectiveTo).format("YYYY-MM-DD HH:mm") : "长期有效"}</Descriptions.Item>
              <Descriptions.Item label="业务规则">{ruleSet.rules?.length ?? 0} 条</Descriptions.Item>
            </Descriptions>
          </Card>

          <div className="pricing-version-detail-grid">
            <Card title="价格调整规则" className="pricing-version-rules-card">
              {ruleSet.rules?.length ? (
                <div className="pricing-version-rule-list">
                  {ruleSet.rules.map((rule, index) => (
                    <article key={rule.id ?? `${rule.name}-${index}`}>
                      <div className="pricing-version-rule-number">{index + 1}</div>
                      <div>
                        <strong>{rule.name || `价格规则 ${index + 1}`}</strong>
                        <p>{formatRuleSentence(rule, valueLabel(rule))}</p>
                      </div>
                      <Tag color={rule.enabled ? "success" : "default"}>{rule.enabled ? "已启用" : "已停用"}</Tag>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本版本没有价格调整规则" />
              )}
            </Card>

            <Card title="审批与价格保护" className="pricing-version-policy-card">
              {policy ? (
                <div className="pricing-policy-summary-list">
                  <div><span>普通改价范围</span><strong>建议价上下 {formatPercent(policy.normalDeviationBps)}%</strong></div>
                  <div><span>需要审批的偏差</span><strong>超过 {formatPercent(policy.approvalDeviationBps)}%</strong></div>
                  <div><span>预计毛利底线</span><strong>{formatPercent(policy.minimumMarginBps)}%</strong></div>
                  <div><span>草稿价格占位</span><strong>{policy.softHoldHours} 小时</strong></div>
                </div>
              ) : (
                <Typography.Text type="secondary">本版本未配置价格保护条件</Typography.Text>
              )}
              {(policy?.internalLaborCostConfig as { constructionCostSource?: string } | undefined)?.constructionCostSource === "STRUCTURED_STANDARD" ? (
                <Typography.Paragraph type="secondary" className="pricing-policy-note">
                  施工成本按岗位小时成本版本与施工收费标准自动计算；本版本不会使用旧的施工基础人工费。
                </Typography.Paragraph>
              ) : null}
            </Card>
          </div>

          <Card className="pricing-version-freeze-note">
            <Space align="start">
              <CheckCircleFilled />
              <div>
                <strong>版本快照已保留</strong>
                <Typography.Paragraph type="secondary">
                  正式订单始终使用创建时冻结的建议价版本；后续修改不会回写历史订单。
                </Typography.Paragraph>
              </div>
            </Space>
          </Card>
        </>
      ) : (
        <Card loading={query.isLoading}><Space>正在加载建议价方案…</Space></Card>
      )}
    </div>
  );
}
