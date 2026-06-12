"use client";

import type { WarrantySummary } from "@mallbay/shared";
import type { CreateWarrantyPayload } from "../../src/lib/api";
import { App, Button, Card, Descriptions, Form, Input, Layout, Select, Space, Table, Tag, Typography } from "antd";
import { FileProtectOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { orderApi, warrantiesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  getWarrantyCardRows,
  getWarrantyExpiryReminder,
  getWarrantyOrderLabel,
  getWarrantyStatusLabel
} from "../../src/features/warranties/display";

export default function WarrantiesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [form] = Form.useForm<CreateWarrantyPayload>();
  const [warrantyNo, setWarrantyNo] = useState("");

  type CompletedOrderOption = {
    id: string;
    orderNo?: string | null;
    customer?: { personalName?: string | null; companyName?: string | null; name?: string | null } | null;
    vehicle?: { plateNo?: string | null } | null;
  };

  const warrantiesQuery = useQuery({
    queryKey: ["warranties", storeId],
    queryFn: () => warrantiesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const lookupQuery = useQuery({
    queryKey: ["warranty-lookup", warrantyNo],
    queryFn: () => warrantiesApi.lookup(warrantyNo),
    enabled: Boolean(warrantyNo)
  });
  const completedOrdersQuery = useQuery({
    queryKey: ["warranties", "completed-orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "COMPLETED", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const completedOrderOptions = ((completedOrdersQuery.data?.items ?? []) as CompletedOrderOption[]).map((order) => ({
    value: order.id,
    label: [
      order.orderNo ?? order.id,
      order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name,
      order.vehicle?.plateNo
    ].filter(Boolean).join(" / ")
  }));
  const warrantyRows = (warrantiesQuery.data ?? []) as WarrantySummary[];
  const warrantySummary = useMemo(() => {
    const now = Date.now();
    const expiringSoon = warrantyRows.filter((row) => {
      if (!row.endDate) return false;
      const days = (new Date(row.endDate).getTime() - now) / 86_400_000;
      return days >= 0 && days <= 30;
    }).length;
    return {
      total: warrantyRows.length,
      active: warrantyRows.filter((row) => row.status === "ACTIVE").length,
      expiringSoon,
      completedOrders: completedOrderOptions.length
    };
  }, [completedOrderOptions.length, warrantyRows]);

  const createWarranty = useMutation({
    mutationFn: (values: CreateWarrantyPayload) => warrantiesApi.createFromOrder(values),
    onSuccess: async () => {
      message.success("质保记录已生成");
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["warranties", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title="质保管理" description="从已完工订单生成质保，并支持按质保编号查询状态" />

        <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["质保记录", warrantySummary.total, "全部电子质保"],
            ["有效质保", warrantySummary.active, "可用于售后追溯"],
            ["即将到期", warrantySummary.expiringSoon, "30 天内需关注"],
            ["待登记订单", warrantySummary.completedOrders, "已完工可生成"]
          ].map(([label, value, description]) => (
            <Card key={label} size="small">
              <Typography.Text type="secondary">{label}</Typography.Text>
              <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
              <Typography.Text type="secondary" className="text-xs">
                {description}
              </Typography.Text>
            </Card>
          ))}
        </div>

        <div className="mb-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card title="生成电子质保" extra={<Typography.Text type="secondary">从已完工订单提取客户、车辆和施工信息</Typography.Text>}>
            <Form form={form} layout="vertical" onFinish={(values) => createWarranty.mutate(values)}>
              <div className="grid gap-3 md:grid-cols-3">
                <Form.Item name="orderId" label="已完工订单" rules={[{ required: true, message: "请选择已完工订单" }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    loading={completedOrdersQuery.isLoading}
                    placeholder="选择已完工订单"
                    options={completedOrderOptions}
                  />
                </Form.Item>
                <Form.Item name="scope" label="质保范围" rules={[{ required: true, message: "请输入质保范围" }]}>
                  <Input placeholder="黄变 / 开裂 / 脱胶 / 起泡" />
                </Form.Item>
                <Form.Item name="startDate" label="起始日期">
                  <Input placeholder="默认使用施工完工日期" />
                </Form.Item>
              </div>
              <Button type="primary" htmlType="submit" icon={<FileProtectOutlined />} loading={createWarranty.isPending}>
                生成质保
              </Button>
            </Form>
          </Card>

          <Card title="质保编号查询">
            <Space direction="vertical" className="w-full">
              <Input.Search
                prefix={<SearchOutlined />}
                placeholder="输入质保编号查询"
                allowClear
                enterButton="查询"
                onSearch={setWarrantyNo}
              />
              <Typography.Text type="secondary">
                用于客户到店售后、电话咨询或销售回访时快速核验质保状态。
              </Typography.Text>
            </Space>
          </Card>
        </div>

        {lookupQuery.data ? (
          <Card className="mb-4" title="电子质保卡">
            <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }}>
              {getWarrantyCardRows(lookupQuery.data).map((row) => (
                <Descriptions.Item key={row.label} label={row.label}>
                  {row.label === "状态" ? <Tag>{row.value}</Tag> : row.value}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>
        ) : null}

        <Table<WarrantySummary>
          rowKey="id"
          loading={warrantiesQuery.isLoading}
          dataSource={warrantyRows}
          columns={[
            { title: "质保编号", dataIndex: "warrantyNo" },
            { title: "订单", render: (_, row) => getWarrantyOrderLabel(row) },
            { title: "范围", dataIndex: "scope" },
            { title: "状态", render: (_, row) => <Tag>{getWarrantyStatusLabel(row.status)}</Tag> },
            {
              title: "到期提醒",
              render: (_, row) => {
                const reminder = getWarrantyExpiryReminder(row);
                return <Tag color={reminder.color}>{reminder.label}</Tag>;
              }
            },
            { title: "开始", render: (_, row) => row.startDate?.slice(0, 10) },
            { title: "结束", render: (_, row) => row.endDate?.slice(0, 10) }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
