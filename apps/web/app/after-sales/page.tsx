"use client";

import type { AfterSaleResponsibility, AfterSaleSummary } from "@mallbay/shared";
import type { CreateAfterSalePayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Select, Space, Table, Tag } from "antd";
import { CheckCircleOutlined, SendOutlined, ToolOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { afterSalesApi, constructionApi, orderApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  AFTER_SALE_RESPONSIBILITY_OPTIONS,
  getAfterSaleBusinessLabel,
  getAfterSaleOrderLabel,
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel,
  yuanToCents
} from "../../src/features/after-sales/display";
import { getConstructionWorkerLabel } from "../../src/features/construction/display";

export default function AfterSalesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [createForm] = Form.useForm<CreateAfterSalePayload>();
  const [assignForm] = Form.useForm<{ id: string; workerUserIds: string[] }>();
  const [judgeForm] = Form.useForm<{
    id: string;
    responsibility: AfterSaleResponsibility;
    penaltyWorkerUserId?: string;
    penaltyAmountYuan?: number;
    penaltyReason?: string;
  }>();

  type AfterSaleOrderOption = {
    id: string;
    orderNo?: string | null;
    customer?: { personalName?: string | null; companyName?: string | null } | null;
    vehicle?: { plateNo?: string | null } | null;
  };
  type AfterSaleWorkerOption = {
    userId: string;
    skillTags?: string[];
    isActive?: boolean;
    user?: { username?: string | null; nickname?: string | null } | null;
  };

  const listQuery = useQuery({
    queryKey: ["after-sales", storeId],
    queryFn: () => afterSalesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const ordersQuery = useQuery({
    queryKey: ["after-sales", "orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const workersQuery = useQuery({
    queryKey: ["after-sales", "workers", storeId],
    queryFn: () => constructionApi.workers(storeId!),
    enabled: Boolean(storeId)
  });
  const orderOptions = ((ordersQuery.data?.items ?? []) as AfterSaleOrderOption[]).map((order) => ({
    value: order.id,
    label: [
      order.orderNo ?? order.id,
      order.customer?.companyName ?? order.customer?.personalName,
      order.vehicle?.plateNo
    ].filter(Boolean).join(" / ")
  }));
  const afterSaleOptions = (listQuery.data ?? []).map((item) => ({
    value: item.id,
    label: getAfterSaleBusinessLabel(item)
  }));
  const workerOptions = ((workersQuery.data ?? []) as AfterSaleWorkerOption[])
    .filter((worker) => worker.isActive !== false)
    .map((worker) => ({
      value: worker.userId,
      label: getConstructionWorkerLabel(worker)
    }));

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
    mutationFn: (values: { id: string; workerUserIds: string[] }) =>
      afterSalesApi.assign(values.id, values.workerUserIds),
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
      penaltyAmountYuan?: number;
      penaltyReason?: string;
    }) => afterSalesApi.judge(values.id, {
      responsibility: values.responsibility,
      penaltyWorkerUserId: values.penaltyWorkerUserId,
      penaltyAmountCents: yuanToCents(values.penaltyAmountYuan),
      penaltyReason: values.penaltyReason
    }),
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
        <StorePageHeader title="售后管理" description="售后申请、派单、责任判断和处罚记录" />

        <Space className="mb-4" align="start" wrap>
          <Form form={createForm} layout="inline" onFinish={(values) => createMutation.mutate(values)}>
            <Form.Item name="orderId" rules={[{ required: true, message: "请选择订单" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={ordersQuery.isLoading}
                placeholder="选择订单"
                options={orderOptions}
                style={{ width: 280 }}
              />
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
            <Form.Item name="id" rules={[{ required: true, message: "请选择售后单" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={listQuery.isLoading}
                placeholder="选择售后单"
                options={afterSaleOptions}
                style={{ width: 260 }}
              />
            </Form.Item>
            <Form.Item name="workerUserIds" rules={[{ required: true, message: "请选择施工人员" }]}>
              <Select
                mode="multiple"
                optionFilterProp="label"
                loading={workersQuery.isLoading}
                placeholder="选择施工人员"
                options={workerOptions}
                style={{ width: 260 }}
              />
            </Form.Item>
            <Button htmlType="submit" icon={<SendOutlined />} loading={assignMutation.isPending}>
              派单
            </Button>
          </Form>

          <Form form={judgeForm} layout="inline" onFinish={(values) => judgeMutation.mutate(values)}>
            <Form.Item name="id" rules={[{ required: true, message: "请选择售后单" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={listQuery.isLoading}
                placeholder="选择售后单"
                options={afterSaleOptions}
                style={{ width: 260 }}
              />
            </Form.Item>
            <Form.Item name="responsibility" rules={[{ required: true, message: "请选择责任" }]}>
              <Select placeholder="责任" style={{ width: 140 }} options={AFTER_SALE_RESPONSIBILITY_OPTIONS} />
            </Form.Item>
            <Form.Item name="penaltyWorkerUserId">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                loading={workersQuery.isLoading}
                placeholder="选择处罚人员"
                options={workerOptions}
                style={{ width: 180 }}
              />
            </Form.Item>
            <Form.Item name="penaltyAmountYuan" label="处罚金额（元）">
              <InputNumber min={0} precision={2} placeholder="处罚金额（元）" />
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
            { title: "售后", render: (_, row) => getAfterSaleBusinessLabel(row) },
            { title: "订单", render: (_, row) => getAfterSaleOrderLabel(row) },
            { title: "问题", dataIndex: "description" },
            { title: "状态", render: (_, row) => <Tag>{getAfterSaleStatusLabel(row.status)}</Tag> },
            { title: "责任", render: (_, row) => <Tag>{getAfterSaleResponsibilityLabel(row.responsibility)}</Tag> }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
