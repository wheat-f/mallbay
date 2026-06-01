"use client";

import type { WarrantySummary } from "@mallbay/shared";
import type { CreateWarrantyPayload } from "../../src/lib/api";
import { App, Button, Form, Input, Layout, Space, Table, Tag, Typography } from "antd";
import { FileProtectOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { warrantiesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

export default function WarrantiesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [form] = Form.useForm<CreateWarrantyPayload>();
  const [warrantyNo, setWarrantyNo] = useState("");

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
        <div className="mb-4">
          <Typography.Title level={3} className="!mb-1">质保管理</Typography.Title>
          <Typography.Text type="secondary">从已完工订单生成质保，并支持按质保编号查询状态</Typography.Text>
        </div>

        <Form form={form} layout="inline" className="mb-4" onFinish={(values) => createWarranty.mutate(values)}>
          <Form.Item name="orderId" rules={[{ required: true, message: "请输入订单 ID" }]}>
            <Input placeholder="已完工订单 ID" />
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
          {lookupQuery.data ? (
            <Typography.Text>
              {lookupQuery.data.warrantyNo} <Tag>{lookupQuery.data.status}</Tag>
            </Typography.Text>
          ) : null}
        </Space>

        <Table<WarrantySummary>
          rowKey="id"
          loading={warrantiesQuery.isLoading}
          dataSource={warrantiesQuery.data ?? []}
          columns={[
            { title: "质保编号", dataIndex: "warrantyNo" },
            { title: "订单", dataIndex: "orderId" },
            { title: "范围", dataIndex: "scope" },
            { title: "状态", render: (_, row) => <Tag>{row.status}</Tag> },
            { title: "开始", render: (_, row) => row.startDate?.slice(0, 10) },
            { title: "结束", render: (_, row) => row.endDate?.slice(0, 10) }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
