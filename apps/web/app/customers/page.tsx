"use client";

import { Button, Empty, Input, Layout, Space, Table, Typography } from "antd";
import { FileTextOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { customerApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type CustomerRow = {
  id: string;
  customerType: string;
  name?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  wechat?: string | null;
  vehicles?: { id: string; carPlate?: string | null; carModel?: string | null }[];
};

export default function CustomersPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [search, setSearch] = useState("");

  const customersQuery = useQuery({
    queryKey: ["customers", storeId, search],
    queryFn: () => customerApi.list({ storeId: storeId!, page: 1, pageSize: 20, q: search }),
    enabled: Boolean(storeId),
    staleTime: 10_000
  });

  const rows = (customersQuery.data?.items ?? []) as CustomerRow[];

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <Typography.Title level={3} className="!mb-1">
              客户管理
            </Typography.Title>
            <Typography.Text type="secondary">检索客户、车辆并快速进入订单创建</Typography.Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!storeId}
            onClick={() => router.push("/orders/create")}
          >
            新建订单
          </Button>
        </div>

        <Space.Compact className="mb-4 w-full">
          <Input.Search
            prefix={<SearchOutlined />}
            placeholder="手机号 / 姓名 / 企业 / 车牌 / VIN"
            allowClear
            onSearch={setSearch}
          />
        </Space.Compact>

        {!storeId ? (
          <Empty description="当前账号尚未加入门店" />
        ) : (
          <Table<CustomerRow>
            rowKey="id"
            loading={customersQuery.isLoading}
            dataSource={rows}
            columns={[
              {
                title: "客户",
                render: (_, row) => (
                  <div>
                    <div className="font-medium">
                      {row.customerType === "COMPANY" ? row.companyName : row.name}
                    </div>
                    <div className="text-xs text-slate-500">{row.contactPerson ?? row.wechat ?? "-"}</div>
                  </div>
                )
              },
              {
                title: "车辆",
                render: (_, row) => row.vehicles?.[0]?.carPlate ?? row.vehicles?.[0]?.carModel ?? "-"
              },
              {
                title: "车辆数",
                render: (_, row) => row.vehicles?.length ?? 0
              },
              {
                title: "操作",
                width: 190,
                render: (_, row) => (
                  <Space>
                    <Button size="small" onClick={() => router.push(`/customers/${row.id}`)}>
                      详情
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      icon={<FileTextOutlined />}
                      onClick={() => router.push(`/orders/create?customerId=${row.id}`)}
                    >
                      下单
                    </Button>
                  </Space>
                )
              }
            ]}
          />
        )}
      </Layout.Content>
    </Layout>
  );
}
