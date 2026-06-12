"use client";

import type { CommissionRuleType, SalesCommissionRuleSummary } from "@mallbay/shared";
import type { CreateSalesCommissionRulePayload } from "../../src/lib/api";
import { Alert, App, Button, Card, Form, Input, InputNumber, Layout, Select, Space, Table, Tag, Typography } from "antd";
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

        <Alert
          className="mb-4"
          type="info"
          showIcon
          message="规则配置与提成生成分离"
          description="规则只定义计算方式；销售订单和施工记录完成后再生成提成快照，避免后续规则调整影响历史结果。"
        />

        <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Card title="佣金规则配置" extra={<Tag>{rulesQuery.data?.length ?? 0} 条规则</Tag>}>
            <Form form={ruleForm} layout="vertical" onFinish={(values) => createRule.mutate(values)}>
              <div className="grid gap-3 md:grid-cols-2">
                <Form.Item name="name" label="规则名称" rules={[{ required: true, message: "请输入规则名称" }]}>
                  <Input placeholder="例如：漆面保护膜销售提成" />
                </Form.Item>
                <Form.Item name="ruleType" label="规则类型" rules={[{ required: true, message: "请选择规则类型" }]}>
                  <Select placeholder="类型" options={COMMISSION_RULE_TYPE_OPTIONS} />
                </Form.Item>
                <Form.Item name="rateBasisPoints" label="比例 BP">
                  <InputNumber className="w-full" min={0} max={10000} placeholder="1000 = 10%" />
                </Form.Item>
                <Form.Item name="fixedAmountYuan" label="固定金额（元）">
                  <InputNumber className="w-full" min={0} precision={2} placeholder="固定金额" />
                </Form.Item>
              </div>
              <Button type="primary" htmlType="submit" icon={<PercentageOutlined />} loading={createRule.isPending}>
                保存规则
              </Button>
            </Form>
          </Card>

          <Card title="提成生成">
            <Space direction="vertical" className="w-full" size="large">
              <div>
                <Typography.Text strong>销售提成</Typography.Text>
                <Form form={salesForm} layout="vertical" className="mt-3" onFinish={(values) => generateSales.mutate(values)}>
                  <Form.Item name="orderId" label="已完工订单" rules={[{ required: true, message: "请选择销售提成订单" }]}>
                    <Select
                      showSearch
                      optionFilterProp="label"
                      loading={commissionOrdersQuery.isLoading}
                      placeholder="选择销售提成订单"
                      options={commissionOrderOptions}
                    />
                  </Form.Item>
                  <Button htmlType="submit" icon={<CalculatorOutlined />} loading={generateSales.isPending}>
                    生成销售提成
                  </Button>
                </Form>
              </div>

              <div>
                <Typography.Text strong>师傅提成</Typography.Text>
                <Form form={workerForm} layout="vertical" className="mt-3" onFinish={(values) => generateWorkers.mutate(values)}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Form.Item name="recordId" label="施工记录" rules={[{ required: true, message: "请选择施工记录" }]}>
                      <Select
                        showSearch
                        optionFilterProp="label"
                        loading={constructionRecordsQuery.isLoading}
                        placeholder="选择施工记录"
                        options={constructionRecordOptions}
                      />
                    </Form.Item>
                    <Form.Item name="baseAmountYuan" label="基础提成（元）" rules={[{ required: true, message: "请输入基础提成" }]}>
                      <InputNumber className="w-full" min={0} precision={2} placeholder="基础提成" />
                    </Form.Item>
                    <Form.Item name="workerUserId" label="调整人员">
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        loading={workersQuery.isLoading}
                        placeholder="选择调整人员"
                        options={workerOptions}
                      />
                    </Form.Item>
                    <Form.Item name="adjustmentYuan" label="调整金额（元）">
                      <InputNumber className="w-full" precision={2} placeholder="可正可负" />
                    </Form.Item>
                  </div>
                  <Button htmlType="submit" loading={generateWorkers.isPending}>
                    生成师傅提成
                  </Button>
                </Form>
              </div>
            </Space>
          </Card>
        </div>

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
