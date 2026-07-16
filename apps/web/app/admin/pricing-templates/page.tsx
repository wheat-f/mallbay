"use client";

import { App, Button, Card, Input, Space, Table, Tag } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { pricingApi, type PricingTemplate } from "../../../src/features/pricing/api";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

export default function PricingTemplatesPage() {
  const { message } = App.useApp();
  const client = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const query = useQuery({ queryKey: ["pricing-templates"], queryFn: pricingApi.templates });
  const createMutation = useMutation({ mutationFn: () => pricingApi.createTemplate({ code, name }), onSuccess: () => { message.success("模板已创建"); setCode(""); setName(""); client.invalidateQueries({ queryKey: ["pricing-templates"] }); }, onError: (error: Error) => message.error(error.message) });
  const versionMutation = useMutation({ mutationFn: (templateId: string) => pricingApi.createTemplateVersion(templateId, { rules: [], protectionPolicy: { normalDeviationBps: 500, approvalDeviationBps: 1500, minimumMarginBps: 1000, softHoldHours: 24, allowSpecialApproval: false, internalLaborCostConfig: {} } }), onSuccess: () => { message.success("模板草稿版本已创建"); query.refetch(); }, onError: (error: Error) => message.error(error.message) });
  const publishMutation = useMutation({ mutationFn: ({ templateId, versionId }: { templateId: string; versionId: string }) => pricingApi.publishTemplateVersion(templateId, versionId), onSuccess: () => { message.success("模板版本已发布"); query.refetch(); }, onError: (error: Error) => message.error(error.message) });
  return <div className="management-page"><StorePageHeader title="总部建议价模板" description="总部模板只提供复制辅助，不会自动覆盖门店规则" /><Card title="新建模板"><Space wrap><Input placeholder="模板编码" value={code} onChange={(event) => setCode(event.target.value)} /><Input placeholder="模板名称" value={name} onChange={(event) => setName(event.target.value)} /><Button type="primary" disabled={!code.trim() || !name.trim()} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>创建模板</Button></Space></Card><Card className="mt-4" title="模板版本"><Table<PricingTemplate> rowKey="id" loading={query.isLoading} dataSource={query.data ?? []} pagination={false} columns={[{ title: "编码", dataIndex: "code" }, { title: "名称", dataIndex: "name" }, { title: "状态", dataIndex: "status", render: (value: string) => <Tag>{value}</Tag> }, { title: "版本", key: "versions", render: (_, row) => <Space wrap>{row.versions.map((version) => <span key={version.id}><Tag color={version.publishedAt ? "green" : "blue"}>v{version.version}</Tag>{version.publishedAt ? null : <Button size="small" onClick={() => publishMutation.mutate({ templateId: row.id, versionId: version.id })}>发布</Button>}</span>)}<Button size="small" onClick={() => versionMutation.mutate(row.id)}>创建空白版本</Button></Space> }]} /></Card></div>;
}
