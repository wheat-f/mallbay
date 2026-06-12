"use client";

import type { RebateStatus, RebateSummary } from "@mallbay/shared";
import type { ApplyRebatePayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Select, Table, Tag } from "antd";
import { CheckCircleOutlined, PayCircleOutlined, PercentageOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orderApi, rebatesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { formatCentsAsYuan, yuanToCents } from "../../src/features/finance/display";
import {
  getRebateBusinessLabel,
  getRebateOrderLabel,
  getRebateReviewOptionsForRole,
  getRebateStatusLabel
} from "../../src/features/rebates/display";

type ApplyRebateFormValues = Omit<ApplyRebatePayload, "amountCents"> & {
  amountYuan: number;
};

type RebateOrderOption = {
  id: string;
  orderNo?: string | null;
  customer?: { personalName?: string | null; companyName?: string | null; name?: string | null } | null;
  vehicle?: { plateNo?: string | null } | null;
};

export default function RebatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [applyForm] = Form.useForm<ApplyRebateFormValues>();
  const [reviewForm] = Form.useForm<{ id: string; status: RebateStatus; note?: string }>();
  const [payForm] = Form.useForm<{ id: string; note?: string }>();

  const rebatesQuery = useQuery({
    queryKey: ["rebates", storeId],
    queryFn: () => rebatesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const rebateOrdersQuery = useQuery({
    queryKey: ["rebates", "orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "COMPLETED", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const rebateOrderOptions = ((rebateOrdersQuery.data?.items ?? []) as RebateOrderOption[]).map((order) => ({
    value: order.id,
    label: [
      order.orderNo ?? order.id,
      order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name,
      order.vehicle?.plateNo
    ].filter(Boolean).join(" / ")
  }));
  const rebateOptions = (rebatesQuery.data ?? []).map((rebate) => ({
    value: rebate.id,
    label: getRebateBusinessLabel(rebate)
  }));
  const rebateReviewOptions = getRebateReviewOptionsForRole(user?.storeMember?.position, user?.isAuditor);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rebates", storeId] });

  const applyRebate = useMutation({
    mutationFn: (values: ApplyRebateFormValues) =>
      rebatesApi.apply({
        orderId: values.orderId,
        amountCents: yuanToCents(values.amountYuan),
        reason: values.reason
      }),
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
        <StorePageHeader title="返利管理" description="已完工且已收款订单的返利申请、审核、审批和发放" />

        <Form form={applyForm} layout="inline" className="mb-4" onFinish={(values) => applyRebate.mutate(values)}>
          <Form.Item name="orderId" rules={[{ required: true, message: "请选择返利订单" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={rebateOrdersQuery.isLoading}
              placeholder="选择返利订单"
              options={rebateOrderOptions}
              style={{ width: 300 }}
            />
          </Form.Item>
          <Form.Item name="amountYuan" rules={[{ required: true, message: "请输入金额" }]}>
            <InputNumber min={0.01} precision={2} placeholder="金额（元）" />
          </Form.Item>
          <Form.Item name="reason" rules={[{ required: true, message: "请输入返利原因" }]}>
            <Input placeholder="返利原因" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PercentageOutlined />} loading={applyRebate.isPending}>
            申请
          </Button>
        </Form>

        <Form form={reviewForm} layout="inline" className="mb-4" onFinish={(values) => reviewRebate.mutate(values)}>
          <Form.Item name="id" rules={[{ required: true, message: "请选择返利申请" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={rebatesQuery.isLoading}
              placeholder="选择返利申请"
              options={rebateOptions}
              style={{ width: 260 }}
            />
          </Form.Item>
          <Form.Item name="status" rules={[{ required: true, message: "请选择结果" }]}>
            <Select placeholder="审核结果" style={{ width: 140 }} options={rebateReviewOptions} />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="备注" />
          </Form.Item>
          <Button htmlType="submit" icon={<CheckCircleOutlined />} loading={reviewRebate.isPending}>
            审核
          </Button>
        </Form>

        <Form form={payForm} layout="inline" className="mb-4" onFinish={(values) => payRebate.mutate(values)}>
          <Form.Item name="id" rules={[{ required: true, message: "请选择返利申请" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={rebatesQuery.isLoading}
              placeholder="选择返利申请"
              options={rebateOptions}
              style={{ width: 260 }}
            />
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
            { title: "返利", render: (_, row) => getRebateBusinessLabel(row) },
            { title: "订单", render: (_, row) => getRebateOrderLabel(row) },
            { title: "金额", render: (_, row) => formatCentsAsYuan(row.amountCents) },
            { title: "原因", dataIndex: "reason" },
            { title: "状态", render: (_, row) => <Tag>{getRebateStatusLabel(row.status)}</Tag> }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
