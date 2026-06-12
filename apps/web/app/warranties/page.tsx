"use client";

import type { WarrantySummary } from "@mallbay/shared";
import type { CreateWarrantyPayload } from "../../src/lib/api";
import { App, Button, Card, Descriptions, Form, Input, Layout, Select, Space, Table, Tag } from "antd";
import { FileProtectOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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

        <Form form={form} layout="inline" className="mb-4" onFinish={(values) => createWarranty.mutate(values)}>
          <Form.Item name="orderId" rules={[{ required: true, message: "请选择已完工订单" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={completedOrdersQuery.isLoading}
              placeholder="选择已完工订单"
              options={completedOrderOptions}
              style={{ width: 300 }}
            />
          </Form.Item>
          <Form.Item name="scope" rules={[{ required: true, message: "请输入质保范围" }]}>
            <Input placeholder="质保范围" />
          </Form.Item>
          <Form.Item name="startDate">
            <Input placeholder="起始日期 YYYY-MM-DD" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<FileProtectOutlined />} loading={createWarranty.isPending}>
            生成质保
          </Button>
        </Form>

        <Space className="mb-4" wrap>
          <Input.Search
            prefix={<SearchOutlined />}
            placeholder="输入质保编号查询"
            allowClear
            enterButton="查询"
            onSearch={setWarrantyNo}
            style={{ width: 320 }}
          />
        </Space>

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
          dataSource={warrantiesQuery.data ?? []}
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
