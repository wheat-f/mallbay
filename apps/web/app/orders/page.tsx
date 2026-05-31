"use client";

import { Button, Input, Layout, Select, Space, Table, Tag, Typography } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { orderApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type OrderRow = {
  id: string;
  orderNo: string;
  status: string;
  constructionType: string;
  customer?: { name?: string | null; companyName?: string | null };
  amount?: { totalAmountCents: number; paidAmountCents: number; outstandingCents: number } | null;
  createdAt: string;
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_DISPATCH: "待派工",
  DISPATCHED: "已派工",
  IN_CONSTRUCTION: "施工中",
  COMPLETED: "已完成",
  WARRANTIED: "已质保",
  CANCELLED: "已取消"
};

export default function OrdersPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string | undefined>();

  const ordersQuery = useQuery({
    queryKey: ["orders", storeId, q, status],
    queryFn: () =>
      orderApi.list({ storeId: storeId!, q, status: status as never, page: 1, pageSize: 20 }),
    enabled: Boolean(storeId)
  });

  const rows = (ordersQuery.data?.items ?? []) as OrderRow[];

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Typography.Title level={3} className="!mb-1">订单管理</Typography.Title>
            <Typography.Text type="secondary">查看销售订单、施工类型和收款进度</Typography.Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/orders/create")}>
            新建订单
          </Button>
        </div>

        <Space className="mb-4" wrap>
          <Input.Search
            prefix={<SearchOutlined />}
            placeholder="订单号 / 客户 / 车牌"
            allowClear
            onSearch={setQ}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            placeholder="订单状态"
            style={{ width: 180 }}
            value={status}
            onChange={setStatus}
            options={Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Space>

        <Table<OrderRow>
          rowKey="id"
          loading={ordersQuery.isLoading}
          dataSource={rows}
          columns={[
            { title: "订单号", dataIndex: "orderNo" },
            {
              title: "客户",
              render: (_, row) => row.customer?.companyName ?? row.customer?.name ?? "-"
            },
            { title: "施工类型", dataIndex: "constructionType" },
            {
              title: "状态",
              render: (_, row) => <Tag>{STATUS_LABEL[row.status] ?? row.status}</Tag>
            },
            {
              title: "金额",
              render: (_, row) => row.amount ? `￥${(row.amount.totalAmountCents / 100).toFixed(2)}` : "-"
            },
            {
              title: "未收",
              render: (_, row) => row.amount ? `￥${(row.amount.outstandingCents / 100).toFixed(2)}` : "-"
            },
            {
              title: "操作",
              render: (_, row) => (
                <Button size="small" onClick={() => router.push(`/orders/${row.id}`)}>
                  详情
                </Button>
              )
            }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
