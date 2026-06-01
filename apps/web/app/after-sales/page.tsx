"use client";

import type { AfterSaleResponsibility, AfterSaleSummary } from "@mallbay/shared";
import type { CreateAfterSalePayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Select, Space, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, SendOutlined, ToolOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { afterSalesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

const RESPONSIBILITY_OPTIONS: Array<{ value: AfterSaleResponsibility; label: string }> = [
  { value: "CUSTOMER", label: "客户原因" },
  { value: "CONSTRUCTION", label: "施工责任" },
  { value: "MATERIAL", label: "材料问题" },
  { value: "STORE", label: "门店责任" }
];

export default function AfterSalesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [createForm] = Form.useForm<CreateAfterSalePayload>();
  const [assignForm] = Form.useForm<{ id: string; workerUserIds: string }>();
  const [judgeForm] = Form.useForm<{
    id: string;
    responsibility: AfterSaleResponsibility;
    penaltyWorkerUserId?: string;
    penaltyAmountCents?: number;
    penaltyReason?: string;
  }>();

  const listQuery = useQuery({
    queryKey: ["after-sales", storeId],
    queryFn: () => afterSalesApi.list(storeId!),
    enabled: Boolean(storeId)
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["after-sales", storeId] });
  const createMutation = useMutation({
    mutationFn: (values: CreateAfterSalePayload) => afterSalesApi.create(values),
    onSuccess: async () => {
      message.success("售后单已创建");
      createForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const assignMutation = useMutation({
    mutationFn: (values: { id: string; workerUserIds: string }) =>
      afterSalesApi.assign(values.id, splitIds(values.workerUserIds)),
    onSuccess: async () => {
      message.success("售后已派单");
      assignForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const judgeMutation = useMutation({
    mutationFn: (values: {
      id: string;
      responsibility: AfterSaleResponsibility;
      penaltyWorkerUserId?: string;
      penaltyAmountCents?: number;
      penaltyReason?: string;
    }) => afterSalesApi.judge(values.id, values),
    onSuccess: async () => {
      message.success("责任结果已记录");
      judgeForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4">
          <Typography.Title level={3} className="!mb-1">售后管理</Typography.Title>
          <Typography.Text type="secondary">售后申请、派单、责任判断和处罚记录</Typography.Text>
        </div>

        <Space className="mb-4" align="start" wrap>
          <Form form={createForm} layout="inline" onFinish={(values) => createMutation.mutate(values)}>
            <Form.Item name="orderId" rules={[{ required: true, message: "请输入订单 ID" }]}>
              <Input placeholder="订单 ID" />
            </Form.Item>
            <Form.Item name="description" rules={[{ required: true, message: "请输入售后问题" }]}>
              <Input placeholder="售后问题" />
            </Form.Item>
            <Button htmlType="submit" type="primary" icon={<ToolOutlined />} loading={createMutation.isPending}>
              创建
            </Button>
          </Form>
        </Space>

        <Space className="mb-4" align="start" wrap>
          <Form form={assignForm} layout="inline" onFinish={(values) => assignMutation.mutate(values)}>
            <Form.Item name="id" rules={[{ required: true, message: "请输入售后 ID" }]}>
              <Input placeholder="售后 ID" />
            </Form.Item>
            <Form.Item name="workerUserIds" rules={[{ required: true, message: "请输入施工人员 ID" }]}>
              <Input placeholder="施工人员 ID，逗号分隔" style={{ width: 220 }} />
            </Form.Item>
            <Button htmlType="submit" icon={<SendOutlined />} loading={assignMutation.isPending}>
              派单
            </Button>
          </Form>

          <Form form={judgeForm} layout="inline" onFinish={(values) => judgeMutation.mutate(values)}>
            <Form.Item name="id" rules={[{ required: true, message: "请输入售后 ID" }]}>
              <Input placeholder="售后 ID" />
            </Form.Item>
            <Form.Item name="responsibility" rules={[{ required: true, message: "请选择责任" }]}>
              <Select placeholder="责任" style={{ width: 140 }} options={RESPONSIBILITY_OPTIONS} />
            </Form.Item>
            <Form.Item name="penaltyWorkerUserId">
              <Input placeholder="处罚人员 ID" />
            </Form.Item>
            <Form.Item name="penaltyAmountCents">
              <InputNumber min={0} placeholder="处罚分" />
            </Form.Item>
            <Button htmlType="submit" icon={<CheckCircleOutlined />} loading={judgeMutation.isPending}>
              记录
            </Button>
          </Form>
        </Space>

        <Table<AfterSaleSummary>
          rowKey="id"
          loading={listQuery.isLoading}
          dataSource={listQuery.data ?? []}
          columns={[
            { title: "售后 ID", dataIndex: "id" },
            { title: "订单", dataIndex: "orderId" },
            { title: "问题", dataIndex: "description" },
            { title: "状态", render: (_, row) => <Tag>{row.status}</Tag> },
            { title: "责任", render: (_, row) => <Tag>{row.responsibility}</Tag> }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}

function splitIds(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
