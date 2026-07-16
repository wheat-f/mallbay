"use client";

import { App, Button, Card, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { CheckOutlined, CloseOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { salesQuoteApi, type SalesQuoteRow } from "../../../src/features/sales-quotes/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

const STATUS_LABEL: Record<SalesQuoteRow["status"], string> = {
  DRAFT: "草稿", PENDING_APPROVAL: "待审批", APPROVED: "已批准", REJECTED: "已驳回", EXPIRED: "已过期", CONVERTED: "已转订单", WITHDRAWN: "已撤回"
};

export default function SalesQuotesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const query = useQuery({ queryKey: ["sales-quotes", storeId], queryFn: () => salesQuoteApi.list(storeId!), enabled: Boolean(storeId) });
  const reviewMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => approve ? salesQuoteApi.approve(id, storeId!) : salesQuoteApi.reject(id, storeId!),
    onSuccess: () => { message.success("报价状态已更新"); queryClient.invalidateQueries({ queryKey: ["sales-quotes", storeId] }); },
    onError: (error: Error) => message.error(error.message)
  });
  const convertMutation = useMutation({
    mutationFn: (id: string) => salesQuoteApi.convertToOrder(id),
    onSuccess: (result) => { message.success("报价已转为正式订单"); window.location.href = `/orders/${result.orderId}`; },
    onError: (error: Error) => message.error(error.message)
  });
  const withdrawMutation = useMutation({
    mutationFn: (id: string) => salesQuoteApi.withdraw(id, storeId!),
    onSuccess: () => { message.success("报价已撤回，容量占位已释放"); queryClient.invalidateQueries({ queryKey: ["sales-quotes", storeId] }); },
    onError: (error: Error) => message.error(error.message)
  });
  return (
    <div className="management-page">
      <StorePageHeader title="报价审批" description="查看超出建议价阈值的报价并完成批准、驳回或转订单" />
      <Card title="报价单" extra={<Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>刷新</Button>}>
        <Table<SalesQuoteRow>
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data ?? []}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: "报价单号", dataIndex: "quoteNo" },
            { title: "客户", key: "customer", render: (_, row) => row.customer?.companyName ?? row.customer?.name ?? row.customer?.contactPerson ?? row.customerId },
            { title: "建议总价", dataIndex: "suggestedTotalCents", render: (value: number) => `¥${(value / 100).toFixed(2)}` },
            { title: "成交总价", dataIndex: "finalTotalCents", render: (value: number) => `¥${(value / 100).toFixed(2)}` },
            { title: "预计毛利", dataIndex: "estimatedMarginBps", render: (value: number | null | undefined) => value === null || value === undefined ? "-" : `${(value / 100).toFixed(2)}%` },
            { title: "状态", dataIndex: "status", render: (value: SalesQuoteRow["status"]) => <Tag color={value === "PENDING_APPROVAL" ? "orange" : value === "APPROVED" ? "green" : "default"}>{STATUS_LABEL[value]}</Tag> },
            { title: "操作", key: "actions", render: (_, row) => <Space>
              <Button size="small" href={`/orders/quotes/${row.id}`}>详情</Button>
              {row.status === "PENDING_APPROVAL" ? <>
                <Popconfirm title="批准该报价？" onConfirm={() => reviewMutation.mutate({ id: row.id, approve: true })}><Button size="small" icon={<CheckOutlined />} loading={reviewMutation.isPending}>批准</Button></Popconfirm>
                <Popconfirm title="驳回该报价？" onConfirm={() => reviewMutation.mutate({ id: row.id, approve: false })}><Button size="small" danger icon={<CloseOutlined />} loading={reviewMutation.isPending}>驳回</Button></Popconfirm>
              </> : null}
              {row.status === "APPROVED" ? <Button size="small" type="primary" loading={convertMutation.isPending} onClick={() => convertMutation.mutate(row.id)}>转正式订单</Button> : null}
              {row.status === "PENDING_APPROVAL" ? <Popconfirm title="撤回该报价并释放预约占位？" onConfirm={() => withdrawMutation.mutate(row.id)}><Button size="small" loading={withdrawMutation.isPending}>撤回</Button></Popconfirm> : null}
            </Space> }
          ]}
        />
        <Typography.Paragraph type="secondary" className="mt-3 mb-0">销售人员只能查看本人报价；店长可查看本门店全部报价。报价有效期过后会释放容量占位。</Typography.Paragraph>
      </Card>
    </div>
  );
}
