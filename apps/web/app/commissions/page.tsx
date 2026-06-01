"use client";

import type { CommissionRuleType, SalesCommissionRuleSummary } from "@mallbay/shared";
import type { CreateSalesCommissionRulePayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Select, Space, Table, Tag, Typography } from "antd";
import { CalculatorOutlined, PercentageOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commissionsApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

const RULE_OPTIONS: Array<{ value: CommissionRuleType; label: string }> = [
  { value: "FIXED_RATE", label: "固定比例" },
  { value: "FIXED_AMOUNT", label: "固定金额" },
  { value: "SALES_TIER", label: "销售阶梯" },
  { value: "CONSTRUCTION_TYPE", label: "施工类型" }
];

export default function CommissionsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [ruleForm] = Form.useForm<CreateSalesCommissionRulePayload>();
  const [salesForm] = Form.useForm<{ orderId: string }>();
  const [workerForm] = Form.useForm<{ recordId: string; baseAmountCents: number; workerUserId?: string; adjustmentCents?: number }>();

  const rulesQuery = useQuery({
    queryKey: ["commission-rules", storeId],
    queryFn: () => commissionsApi.salesRules(storeId!),
    enabled: Boolean(storeId)
  });

  const createRule = useMutation({
    mutationFn: (values: CreateSalesCommissionRulePayload) => commissionsApi.createSalesRule({ ...values, storeId: storeId! }),
    onSuccess: async () => {
      message.success("销售提成规则已保存");
      ruleForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["commission-rules", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const generateSales = useMutation({
    mutationFn: (values: { orderId: string }) => commissionsApi.generateSales(values.orderId),
    onSuccess: () => {
      message.success("销售提成已生成");
      salesForm.resetFields();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const generateWorkers = useMutation({
    mutationFn: (values: { recordId: string; baseAmountCents: number; workerUserId?: string; adjustmentCents?: number }) =>
      commissionsApi.generateWorkers(values.recordId, {
        baseAmountCents: values.baseAmountCents,
        adjustments: values.workerUserId
          ? [{ workerUserId: values.workerUserId, adjustmentCents: values.adjustmentCents ?? 0 }]
          : []
      }),
    onSuccess: () => {
      message.success("师傅提成已生成");
      workerForm.resetFields();
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4">
          <Typography.Title level={3} className="!mb-1">提成管理</Typography.Title>
          <Typography.Text type="secondary">销售提成规则、订单提成快照和师傅提成人工调整</Typography.Text>
        </div>

        <Form form={ruleForm} layout="inline" className="mb-4" onFinish={(values) => createRule.mutate(values)}>
          <Form.Item name="name" rules={[{ required: true, message: "请输入规则名称" }]}>
            <Input placeholder="规则名称" />
          </Form.Item>
          <Form.Item name="ruleType" rules={[{ required: true, message: "请选择规则类型" }]}>
            <Select placeholder="类型" style={{ width: 140 }} options={RULE_OPTIONS} />
          </Form.Item>
          <Form.Item name="rateBasisPoints">
            <InputNumber min={0} max={10000} placeholder="BP" />
          </Form.Item>
          <Form.Item name="fixedAmountCents">
            <InputNumber min={0} placeholder="固定金额分" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PercentageOutlined />} loading={createRule.isPending}>
            保存规则
          </Button>
        </Form>

        <Space className="mb-4" wrap>
          <Form form={salesForm} layout="inline" onFinish={(values) => generateSales.mutate(values)}>
            <Form.Item name="orderId" rules={[{ required: true, message: "请输入订单 ID" }]}>
              <Input placeholder="订单 ID" />
            </Form.Item>
            <Button htmlType="submit" icon={<CalculatorOutlined />} loading={generateSales.isPending}>
              生成销售提成
            </Button>
          </Form>

          <Form form={workerForm} layout="inline" onFinish={(values) => generateWorkers.mutate(values)}>
            <Form.Item name="recordId" rules={[{ required: true, message: "请输入施工记录 ID" }]}>
              <Input placeholder="施工记录 ID" />
            </Form.Item>
            <Form.Item name="baseAmountCents" rules={[{ required: true, message: "请输入基础提成" }]}>
              <InputNumber min={0} placeholder="基础提成分" />
            </Form.Item>
            <Form.Item name="workerUserId">
              <Input placeholder="调整人员 ID" />
            </Form.Item>
            <Form.Item name="adjustmentCents">
              <InputNumber placeholder="调整分" />
            </Form.Item>
            <Button htmlType="submit" loading={generateWorkers.isPending}>
              生成师傅提成
            </Button>
          </Form>
        </Space>

        <Table<SalesCommissionRuleSummary>
          rowKey="id"
          loading={rulesQuery.isLoading}
          dataSource={rulesQuery.data ?? []}
          columns={[
            { title: "规则", dataIndex: "name" },
            { title: "类型", dataIndex: "ruleType" },
            { title: "比例 BP", dataIndex: "rateBasisPoints" },
            { title: "固定金额", dataIndex: "fixedAmountCents" },
            { title: "状态", render: (_, row) => <Tag>{row.isActive ? "启用" : "停用"}</Tag> }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
