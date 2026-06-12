"use client";

import type { CommissionRuleType, SalesCommissionRuleSummary } from "@mallbay/shared";
import type { CreateSalesCommissionRulePayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Select, Space, Table, Tag } from "antd";
import { CalculatorOutlined, PercentageOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { commissionsApi, constructionApi, orderApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { COMMISSION_RULE_TYPE_OPTIONS, getCommissionRuleTypeLabel } from "../../src/features/commissions/display";
import { getConstructionStatusLabel, getConstructionWorkerLabel } from "../../src/features/construction/display";
import { formatCentsAsYuan, yuanToCents } from "../../src/features/finance/display";

type SalesCommissionRuleFormValues = Omit<CreateSalesCommissionRulePayload, "fixedAmountCents"> & {
  fixedAmountYuan?: number;
};

type WorkerCommissionFormValues = {
  recordId: string;
  baseAmountYuan: number;
  workerUserId?: string;
  adjustmentYuan?: number;
};

type CommissionOrderOption = {
  id: string;
  orderNo?: string | null;
  customer?: { personalName?: string | null; companyName?: string | null; name?: string | null } | null;
  vehicle?: { plateNo?: string | null } | null;
};

type ConstructionRecordOption = {
  id: string;
  orderId: string;
  status?: string | null;
  order?: { orderNo?: string | null } | null;
};

type CommissionWorkerOption = {
  userId: string;
  skillTags?: string[];
  isActive?: boolean;
  user?: { username?: string | null; nickname?: string | null } | null;
};

export default function CommissionsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [ruleForm] = Form.useForm<SalesCommissionRuleFormValues>();
  const [salesForm] = Form.useForm<{ orderId: string }>();
  const [workerForm] = Form.useForm<WorkerCommissionFormValues>();

  const rulesQuery = useQuery({
    queryKey: ["commission-rules", storeId],
    queryFn: () => commissionsApi.salesRules(storeId!),
    enabled: Boolean(storeId)
  });
  const commissionOrdersQuery = useQuery({
    queryKey: ["commissions", "orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "COMPLETED", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const constructionRecordsQuery = useQuery({
    queryKey: ["commissions", "construction-records", storeId],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const workersQuery = useQuery({
    queryKey: ["commissions", "workers", storeId],
    queryFn: () => constructionApi.workers(storeId!),
    enabled: Boolean(storeId)
  });
  const commissionOrderOptions = ((commissionOrdersQuery.data?.items ?? []) as CommissionOrderOption[]).map((order) => ({
    value: order.id,
    label: [
      order.orderNo ?? "订单未加载",
      order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name,
      order.vehicle?.plateNo
    ].filter(Boolean).join(" / ")
  }));
  const constructionRecordOptions = ((constructionRecordsQuery.data ?? []) as ConstructionRecordOption[]).map((record) => ({
    value: record.id,
    label: [record.order?.orderNo ?? "订单未加载", getConstructionStatusLabel(record.status)].filter(Boolean).join(" / ")
  }));
  const workerOptions = ((workersQuery.data ?? []) as CommissionWorkerOption[])
    .filter((worker) => worker.isActive !== false)
    .map((worker) => ({
      value: worker.userId,
      label: getConstructionWorkerLabel(worker)
    }));

  const createRule = useMutation({
    mutationFn: (values: SalesCommissionRuleFormValues) =>
      commissionsApi.createSalesRule({
        storeId: storeId!,
        name: values.name,
        ruleType: values.ruleType,
        rateBasisPoints: values.rateBasisPoints,
        fixedAmountCents: values.fixedAmountYuan === undefined ? undefined : yuanToCents(values.fixedAmountYuan)
      }),
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
    mutationFn: (values: WorkerCommissionFormValues) =>
      commissionsApi.generateWorkers(values.recordId, {
        baseAmountCents: yuanToCents(values.baseAmountYuan),
        adjustments: values.workerUserId
          ? [{ workerUserId: values.workerUserId, adjustmentCents: yuanToCents(values.adjustmentYuan ?? 0) }]
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
        <StorePageHeader title="提成管理" description="销售提成规则、订单提成快照和师傅提成人工调整" />

        <Form form={ruleForm} layout="inline" className="mb-4" onFinish={(values) => createRule.mutate(values)}>
          <Form.Item name="name" rules={[{ required: true, message: "请输入规则名称" }]}>
            <Input placeholder="规则名称" />
          </Form.Item>
          <Form.Item name="ruleType" rules={[{ required: true, message: "请选择规则类型" }]}>
            <Select placeholder="类型" style={{ width: 140 }} options={COMMISSION_RULE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="rateBasisPoints">
            <InputNumber min={0} max={10000} placeholder="BP" />
          </Form.Item>
          <Form.Item name="fixedAmountYuan">
            <InputNumber min={0} precision={2} placeholder="固定金额（元）" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PercentageOutlined />} loading={createRule.isPending}>
            保存规则
          </Button>
        </Form>

        <Space className="mb-4" wrap>
          <Form form={salesForm} layout="inline" onFinish={(values) => generateSales.mutate(values)}>
            <Form.Item name="orderId" rules={[{ required: true, message: "请选择销售提成订单" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={commissionOrdersQuery.isLoading}
                placeholder="选择销售提成订单"
                options={commissionOrderOptions}
                style={{ width: 300 }}
              />
            </Form.Item>
            <Button htmlType="submit" icon={<CalculatorOutlined />} loading={generateSales.isPending}>
              生成销售提成
            </Button>
          </Form>

          <Form form={workerForm} layout="inline" onFinish={(values) => generateWorkers.mutate(values)}>
            <Form.Item name="recordId" rules={[{ required: true, message: "请选择施工记录" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={constructionRecordsQuery.isLoading}
                placeholder="选择施工记录"
                options={constructionRecordOptions}
                style={{ width: 260 }}
              />
            </Form.Item>
            <Form.Item name="baseAmountYuan" rules={[{ required: true, message: "请输入基础提成" }]}>
              <InputNumber min={0} precision={2} placeholder="基础提成（元）" />
            </Form.Item>
            <Form.Item name="workerUserId">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                loading={workersQuery.isLoading}
                placeholder="选择调整人员"
                options={workerOptions}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item name="adjustmentYuan">
              <InputNumber precision={2} placeholder="调整金额（元）" />
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
            { title: "类型", render: (_, row) => getCommissionRuleTypeLabel(row.ruleType) },
            { title: "比例 BP", dataIndex: "rateBasisPoints" },
            { title: "固定金额", render: (_, row) => formatCentsAsYuan(row.fixedAmountCents) },
            { title: "状态", render: (_, row) => <Tag>{row.isActive ? "启用" : "停用"}</Tag> }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
