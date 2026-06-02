"use client";

import type { RebateStatus, RebateSummary } from "@mallbay/shared";
import type { ApplyRebatePayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Select, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, PayCircleOutlined, PercentageOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rebatesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

const REVIEW_OPTIONS: Array<{ value: RebateStatus; label: string }> = [
  { value: "APPROVED", label: "通过" },
  { value: "REJECTED", label: "拒绝" }
];

export default function RebatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [applyForm] = Form.useForm<ApplyRebatePayload>();
  const [reviewForm] = Form.useForm<{ id: string; status: RebateStatus; note?: string }>();
  const [payForm] = Form.useForm<{ id: string; note?: string }>();

  const rebatesQuery = useQuery({
    queryKey: ["rebates", storeId],
    queryFn: () => rebatesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rebates", storeId] });

  const applyRebate = useMutation({
    mutationFn: (values: ApplyRebatePayload) => rebatesApi.apply(values),
    onSuccess: async () => {
      message.success("返利申请已提交");
      applyForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const reviewRebate = useMutation({
    mutationFn: (values: { id: string; status: RebateStatus; note?: string }) =>
      rebatesApi.review(values.id, { status: values.status, note: values.note }),
    onSuccess: async () => {
      message.success("返利审核已更新");
      reviewForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const payRebate = useMutation({
    mutationFn: (values: { id: string; note?: string }) => rebatesApi.pay(values.id, values.note),
    onSuccess: async () => {
      message.success("返利已发放");
      payForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4">
          <Typography.Title level={3} className="!mb-1">返利管理</Typography.Title>
          <Typography.Text type="secondary">已完工且已收款订单的返利申请、审核、审批和发放</Typography.Text>
        </div>

        <Form form={applyForm} layout="inline" className="mb-4" onFinish={(values) => applyRebate.mutate(values)}>
          <Form.Item name="orderId" rules={[{ required: true, message: "请输入订单 ID" }]}>
            <Input placeholder="订单 ID" />
          </Form.Item>
          <Form.Item name="amountCents" rules={[{ required: true, message: "请输入金额" }]}>
            <InputNumber min={1} placeholder="金额分" />
          </Form.Item>
          <Form.Item name="reason" rules={[{ required: true, message: "请输入返利原因" }]}>
            <Input placeholder="返利原因" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PercentageOutlined />} loading={applyRebate.isPending}>
            申请
          </Button>
        </Form>

        <Form form={reviewForm} layout="inline" className="mb-4" onFinish={(values) => reviewRebate.mutate(values)}>
          <Form.Item name="id" rules={[{ required: true, message: "请输入返利 ID" }]}>
            <Input placeholder="返利 ID" />
          </Form.Item>
          <Form.Item name="status" rules={[{ required: true, message: "请选择结果" }]}>
            <Select placeholder="审核结果" style={{ width: 140 }} options={REVIEW_OPTIONS} />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="备注" />
          </Form.Item>
          <Button htmlType="submit" icon={<CheckCircleOutlined />} loading={reviewRebate.isPending}>
            审核
          </Button>
        </Form>

        <Form form={payForm} layout="inline" className="mb-4" onFinish={(values) => payRebate.mutate(values)}>
          <Form.Item name="id" rules={[{ required: true, message: "请输入返利 ID" }]}>
            <Input placeholder="返利 ID" />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="打款备注" />
          </Form.Item>
          <Button htmlType="submit" icon={<PayCircleOutlined />} loading={payRebate.isPending}>
            发放
          </Button>
        </Form>

        <Table<RebateSummary>
          rowKey="id"
          loading={rebatesQuery.isLoading}
          dataSource={rebatesQuery.data ?? []}
          columns={[
            { title: "返利 ID", dataIndex: "id" },
            { title: "订单", dataIndex: "orderId" },
            { title: "金额分", dataIndex: "amountCents" },
            { title: "原因", dataIndex: "reason" },
            { title: "状态", render: (_, row) => <Tag>{row.status}</Tag> }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
