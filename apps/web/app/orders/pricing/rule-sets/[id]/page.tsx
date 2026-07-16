"use client";

import { Alert, App, Button, Card, Descriptions, Input, Space, Table, Tag, Typography } from "antd";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { pricingApi, type PricingRule, type PricingRuleSetPayload } from "../../../../../src/features/pricing/api";
import { useAuthStore } from "../../../../../src/stores/auth-store";
import { StorePageHeader } from "../../../../../src/features/workbench/store-page-header";

export default function PricingRuleSetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const { message } = App.useApp();
  const [editor, setEditor] = useState("");
  const query = useQuery({ queryKey: ["pricing-rule-set", id, storeId], queryFn: () => pricingApi.ruleSet(id, storeId!), enabled: Boolean(id && storeId) });
  useEffect(() => {
    if (!query.data || !storeId) return;
    setEditor(JSON.stringify({
      storeId,
      effectiveFrom: query.data.effectiveFrom,
      ...(query.data.effectiveTo ? { effectiveTo: query.data.effectiveTo } : {}),
      rules: (query.data.rules ?? []).map((rule) => ({ group: rule.group, target: rule.target, name: rule.name, conditions: rule.conditions, actionType: rule.actionType, actionValue: rule.actionValue, priority: rule.priority, sortOrder: rule.sortOrder, enabled: rule.enabled })),
      protectionPolicy: query.data.protectionPolicy
    }, null, 2));
  }, [query.data, storeId]);
  const updateMutation = useMutation({
    mutationFn: () => {
      const payload = JSON.parse(editor) as PricingRuleSetPayload;
      return pricingApi.updateRuleSet(id, { ...payload, storeId: storeId! });
    },
    onSuccess: () => { message.success("规则草稿已保存"); query.refetch(); },
    onError: (error: Error) => message.error(error.message)
  });
  const ruleSet = query.data;
  return <div className="management-page">
    <StorePageHeader title="规则版本详情" description="查看不可变版本快照；仅草稿允许完整替换后重新校验发布" />
    {ruleSet ? <>
      <Card loading={query.isLoading}>
        <Descriptions column={4}>
          <Descriptions.Item label="版本">v{ruleSet.version}</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag>{ruleSet.status}</Tag></Descriptions.Item>
          <Descriptions.Item label="生效时间">{dayjs(ruleSet.effectiveFrom).format("YYYY-MM-DD HH:mm")}</Descriptions.Item>
          <Descriptions.Item label="结束时间">{ruleSet.effectiveTo ? dayjs(ruleSet.effectiveTo).format("YYYY-MM-DD HH:mm") : "长期"}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card className="mt-4" title="结构化规则">
        <Table<PricingRule> rowKey={(row) => row.id ?? row.name} pagination={false} dataSource={ruleSet.rules ?? []} columns={[
          { title: "规则", dataIndex: "name" },
          { title: "组", dataIndex: "group" },
          { title: "目标", dataIndex: "target" },
          { title: "条件", dataIndex: "conditions", render: (value: PricingRule["conditions"]) => JSON.stringify(value) },
          { title: "动作", render: (_, row) => row.actionType + " " + row.actionValue },
          { title: "优先级", dataIndex: "priority" }
        ]} />
      </Card>
      <Card className="mt-4" title="草稿 JSON 编辑器" extra={<Button type="primary" disabled={ruleSet.status !== "DRAFT"} loading={updateMutation.isPending} onClick={() => updateMutation.mutate()}>保存草稿</Button>}>
        {ruleSet.status !== "DRAFT" ? <Alert className="mb-4" type="info" showIcon title="已发布或已停用版本不可原地修改，请先复制为新草稿。" /> : null}
        <Input.TextArea rows={24} value={editor} disabled={ruleSet.status !== "DRAFT"} onChange={(event) => setEditor(event.target.value)} />
        <Typography.Paragraph type="secondary" className="mt-3 mb-0">金额使用分，比例使用基点；保存后仍需校验并发布才会生效。</Typography.Paragraph>
      </Card>
    </> : <Card loading={query.isLoading}><Space>正在加载规则版本…</Space></Card>}
  </div>;
}
