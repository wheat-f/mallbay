"use client";

import { App, Button, Card, Descriptions, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { salesQuoteApi, type SalesQuoteRow } from "../../../../src/features/sales-quotes/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { StorePageHeader } from "../../../../src/features/workbench/store-page-header";

const STATUS_LABEL: Record<SalesQuoteRow["status"], string> = {
  DRAFT: "草稿", PENDING_APPROVAL: "待审批", APPROVED: "已批准", REJECTED: "已驳回", EXPIRED: "已过期", CONVERTED: "已转订单", WITHDRAWN: "已撤回"
};
const money = (value?: number | null) => value === undefined || value === null ? "-" : `¥${(value / 100).toFixed(2)}`;

export default function SalesQuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const { message } = App.useApp();
  const query = useQuery({ queryKey: ["sales-quote", id, storeId], queryFn: () => salesQuoteApi.get(id, storeId!), enabled: Boolean(id && storeId) });
  const actionMutation = useMutation({
    mutationFn: async (action: "submit" | "approve" | "reject" | "withdraw" | "convert") => {
      if (action === "submit") return salesQuoteApi.submit(id, storeId!);
      if (action === "approve") return salesQuoteApi.approve(id, storeId!);
      if (action === "reject") return salesQuoteApi.reject(id, storeId!);
      if (action === "withdraw") return salesQuoteApi.withdraw(id, storeId!);
      return salesQuoteApi.convertToOrder(id);
    },
    onSuccess: (result, action) => {
      message.success("报价状态已更新");
      if (action === "convert" && "orderId" in result) window.location.href = `/orders/${result.orderId}`;
      else query.refetch();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const quote = query.data;
  return <div className="management-page">
    <StorePageHeader title="报价单详情" description="查看价格快照、审批记录、容量占位和转单结果" />
    <Card loading={query.isLoading} extra={quote ? <Space>
      {quote.status === "DRAFT" ? <Button type="primary" onClick={() => actionMutation.mutate("submit")}>提交审批</Button> : null}
      {quote.status === "PENDING_APPROVAL" ? <>
        <Popconfirm title="批准该报价？" onConfirm={() => actionMutation.mutate("approve")}><Button type="primary">批准</Button></Popconfirm>
        <Popconfirm title="驳回该报价？" onConfirm={() => actionMutation.mutate("reject")}><Button danger>驳回</Button></Popconfirm>
        <Popconfirm title="撤回并释放容量？" onConfirm={() => actionMutation.mutate("withdraw")}><Button>撤回</Button></Popconfirm>
      </> : null}
      {quote.status === "APPROVED" ? <Button type="primary" onClick={() => actionMutation.mutate("convert")}>转正式订单</Button> : null}
    </Space> : null}>
      {quote ? <Descriptions column={3}>
        <Descriptions.Item label="报价单号">{quote.quoteNo}</Descriptions.Item>
        <Descriptions.Item label="状态"><Tag>{STATUS_LABEL[quote.status]}</Tag></Descriptions.Item>
        <Descriptions.Item label="有效期">{dayjs(quote.validUntil).format("YYYY-MM-DD HH:mm")}</Descriptions.Item>
        <Descriptions.Item label="客户">{quote.customer?.companyName ?? quote.customer?.name ?? quote.customerId}</Descriptions.Item>
        <Descriptions.Item label="车辆">{quote.vehicle ? [quote.vehicle.carPlate, quote.vehicle.carModel, quote.vehicle.color].filter(Boolean).join(" / ") : "-"}</Descriptions.Item>
        <Descriptions.Item label="规则版本">{quote.pricingCalculation ? `v${quote.pricingCalculation.ruleSetVersion}` : "-"}</Descriptions.Item>
        <Descriptions.Item label="建议总价">{money(quote.suggestedTotalCents)}</Descriptions.Item>
        <Descriptions.Item label="成交总价">{money(quote.finalTotalCents)}</Descriptions.Item>
        <Descriptions.Item label="预计毛利">{quote.estimatedMarginBps === null || quote.estimatedMarginBps === undefined ? "-" : (quote.estimatedMarginBps / 100).toFixed(2) + "%"}</Descriptions.Item>
        <Descriptions.Item label="关联订单">{quote.convertedOrder?.orderNo ?? "-"}</Descriptions.Item>
        <Descriptions.Item label="计算哈希" span={2}>{quote.pricingCalculation?.inputHash ?? "-"}</Descriptions.Item>
      </Descriptions> : null}
    </Card>
    <Card className="mt-4" title="产品明细">
      <Table rowKey={(row) => row.id ?? row.productId} pagination={false} dataSource={quote?.items ?? []} columns={[
        { title: "产品", render: (_, row) => [row.productSnapshot?.brand, row.productSnapshot?.name, row.productSnapshot?.model].filter(Boolean).join(" / ") || row.productId },
        { title: "数量", dataIndex: "quantity" },
        { title: "单位", dataIndex: "salesUnit" },
        { title: "建议单价", dataIndex: "suggestedUnitPriceCents", render: money },
        { title: "成交单价", dataIndex: "finalUnitPriceCents", render: money },
        { title: "成交小计", dataIndex: "finalAmountCents", render: money }
      ]} />
    </Card>
    <Card className="mt-4" title="审批记录">
      <Table rowKey="id" pagination={false} dataSource={quote?.approvals ?? []} columns={[
        { title: "审批类型", dataIndex: "approvalType" },
        { title: "状态", dataIndex: "status" },
        { title: "提交时间", dataIndex: "submittedAt", render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm") },
        { title: "审批意见", dataIndex: "reviewNote", render: (value?: string | null) => value || "-" }
      ]} />
      <Typography.Paragraph type="secondary" className="mt-3 mb-0">草稿提交后才创建审批记录和容量软占位；正式订单生成后价格快照永久冻结。</Typography.Paragraph>
    </Card>
  </div>;
}
