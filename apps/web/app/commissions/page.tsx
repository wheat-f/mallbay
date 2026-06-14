"use client";

import type { SalesCommissionRuleSummary } from "@mallbay/shared";
import type { CreateSalesCommissionRulePayload } from "../../src/lib/api";
import { App, Button, Card, Form, Input, InputNumber, Select, Table, Tag } from "antd";
import {
  CalculatorOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  PercentageOutlined,
  SaveOutlined,
  SyncOutlined,
  TeamOutlined,
  TrophyOutlined,
  WalletOutlined
} from "@ant-design/icons";
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
  const settlementRows = [
    {
      id: "rules",
      stage: "规则配置",
      subject: `${rulesQuery.data?.length ?? 0} 条规则`,
      status: "已维护",
      owner: "财务 / 店长",
      note: "规则只影响后续生成，不回写历史提成快照"
    },
    {
      id: "sales",
      stage: "销售提成",
      subject: `${commissionOrderOptions.length} 个已完工订单`,
      status: commissionOrderOptions.length > 0 ? "待生成" : "暂无来源",
      owner: "财务",
      note: "按已完工订单生成销售提成快照"
    },
    {
      id: "workers",
      stage: "师傅提成",
      subject: `${constructionRecordOptions.length} 条施工记录`,
      status: constructionRecordOptions.length > 0 ? "待生成" : "暂无来源",
      owner: "施工主管 / 财务",
      note: "基于施工记录和人工调整生成师傅提成"
    }
  ];

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
    <div className="management-page">
      <StorePageHeader title="佣金规则配置" description="设置销售团队与施工人员的激励方案与结算标准" />

      <div className="commission-page-actions">
        <Button href="/commissions/settlements" icon={<HistoryOutlined />}>
          提成结算
        </Button>
        <Button icon={<HistoryOutlined />} onClick={() => message.info("操作日志将在审计中心统一展示")}>
          操作日志
        </Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={() => ruleForm.submit()}>
          保存所有配置
        </Button>
      </div>

      <div className="commission-rule-tabs" role="tablist" aria-label="佣金规则类型">
        <button className="is-active" type="button">
          销售佣金规则
        </button>
        <button type="button">施工员佣金规则</button>
      </div>

      <section className="commission-workspace">
        <div className="commission-main-column">
          <div className="commission-global-card">
            <div className="commission-card-icon">
              <SyncOutlined />
            </div>
            <div>
              <h2>全局规则应用</h2>
              <p>一键同步配置到当前门店销售组、施工组和财务结算流程。</p>
            </div>
            <Button onClick={() => message.info("规则同步将在多门店配置批次中实现")}>立即全量应用</Button>
          </div>

          <div className="commission-rule-bento">
            <div className="commission-bento-card commission-sales-panel">
              <div className="commission-bento-head">
                <PercentageOutlined />
                <div>
                  <h3>固定比例模式</h3>
                  <p>基于订单实付金额或固定金额生成销售佣金规则。</p>
                </div>
              </div>
              <Form form={ruleForm} layout="vertical" onFinish={(values) => createRule.mutate(values)}>
                <div className="commission-rule-form-grid">
                  <Form.Item name="name" label="规则名称" rules={[{ required: true, message: "请输入规则名称" }]}>
                    <Input placeholder="例如：漆面保护膜销售提成" />
                  </Form.Item>
                  <Form.Item name="ruleType" label="规则类型" rules={[{ required: true, message: "请选择规则类型" }]}>
                    <Select placeholder="类型" options={COMMISSION_RULE_TYPE_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="rateBasisPoints" label="佣金比例 BP">
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
            </div>

            <div className="commission-bento-card commission-type-card">
              <div className="commission-bento-head">
                <TrophyOutlined />
                <div>
                  <h3>按施工类型配置</h3>
                  <p>将规则绑定漆面保护膜、玻璃膜、复检等履约类型。</p>
                </div>
              </div>
              <div className="commission-type-grid">
                {[
                  ["全车隐形车衣", "8.5%"],
                  ["窗膜施工", "12.0%"],
                  ["内饰保护", "15.0%"]
                ].map(([name, rate]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <strong>{rate}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="commission-bento-card commission-tier-panel">
              <div className="commission-bento-head">
                <WalletOutlined />
                <div>
                  <h3>销售额阶梯奖励</h3>
                  <p>按月度销售额区间维护额外奖金和阶梯提成。</p>
                </div>
              </div>
              <div className="commission-rule-mobile-cards">
                {(rulesQuery.data ?? []).length > 0 ? (
                  (rulesQuery.data ?? []).map((rule) => (
                    <article key={rule.id} className="commission-rule-mobile-card">
                      <div className="commission-rule-mobile-card-head">
                        <div>
                          <strong>{rule.name}</strong>
                          <span>{getCommissionRuleTypeLabel(rule.ruleType)}</span>
                        </div>
                        <Tag>{rule.isActive ? "启用" : "停用"}</Tag>
                      </div>
                      <dl className="commission-rule-mobile-card-fields">
                        <div>
                          <dt>比例 BP</dt>
                          <dd>{rule.rateBasisPoints ?? "-"}</dd>
                        </div>
                        <div>
                          <dt>固定金额</dt>
                          <dd>{formatCentsAsYuan(rule.fixedAmountCents)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))
                ) : (
                  <div className="commission-rule-mobile-empty">暂无佣金规则</div>
                )}
              </div>
              <Table<SalesCommissionRuleSummary>
                className="commission-rule-desktop-table"
                rowKey="id"
                loading={rulesQuery.isLoading}
                dataSource={rulesQuery.data ?? []}
                pagination={false}
                columns={[
                  { title: "规则", dataIndex: "name" },
                  { title: "类型", render: (_, row) => getCommissionRuleTypeLabel(row.ruleType) },
                  { title: "比例 BP", dataIndex: "rateBasisPoints" },
                  { title: "固定金额", render: (_, row) => formatCentsAsYuan(row.fixedAmountCents) },
                  { title: "状态", render: (_, row) => <Tag>{row.isActive ? "启用" : "停用"}</Tag> }
                ]}
              />
            </div>
          </div>
        </div>

        <aside className="commission-side-column">
          <Card className="commission-worker-panel" title="施工员佣金规则">
            <div className="commission-worker-rules">
              {[
                ["首席技师 P3", "权重 1.5x", "¥200"],
                ["高级技师 P2", "权重 1.2x", "¥150"],
                ["初级技师 P1", "权重 1.0x", "¥100"]
              ].map(([level, desc, amount]) => (
                <div key={level}>
                  <TeamOutlined />
                  <span>
                    <strong>{level}</strong>
                    <small>{desc}</small>
                  </span>
                  <b>{amount}</b>
                </div>
              ))}
            </div>
          </Card>

          <Card className="commission-generation-panel" title="提成生成">
            <Form form={salesForm} layout="vertical" onFinish={(values) => generateSales.mutate(values)}>
              <Form.Item name="orderId" label="销售提成订单" rules={[{ required: true, message: "请选择销售提成订单" }]}>
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

            <div className="commission-panel-divider" />

            <Form form={workerForm} layout="vertical" onFinish={(values) => generateWorkers.mutate(values)}>
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
              <div className="commission-adjustment-grid">
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
          </Card>

          <Card
            className="commission-settlement-panel"
            title="结算日志明细"
            extra={<span className="commission-muted-text">当前版本展示可结算来源，不伪造已结算流水</span>}
          >
            <div className="commission-settlement-mobile-cards">
              {settlementRows.map((row) => (
                <article key={row.id} className="commission-settlement-mobile-card">
                  <div className="commission-settlement-mobile-card-head">
                    <div>
                      <strong>{row.stage}</strong>
                      <span>{row.subject}</span>
                    </div>
                    <Tag>{row.status}</Tag>
                  </div>
                  <dl className="commission-settlement-mobile-card-fields">
                    <div>
                      <dt>负责人</dt>
                      <dd>{row.owner}</dd>
                    </div>
                    <div>
                      <dt>说明</dt>
                      <dd>{row.note}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <Table
              className="commission-settlement-desktop-table"
              rowKey="id"
              pagination={false}
              dataSource={settlementRows}
              columns={[
                { title: "结算环节", dataIndex: "stage" },
                { title: "状态", render: (_, row) => <Tag>{row.status}</Tag> },
                { title: "说明", dataIndex: "note" }
              ]}
            />
            <Button className="mt-3" icon={<FileSearchOutlined />} onClick={() => message.info("提成结算导出将在后续财务批次中实现")}>
              导出报表
            </Button>
          </Card>
        </aside>
      </section>

      <footer className="commission-sync-footer">
        <span>
          <i />
          规则只影响后续生成，不回写历史提成快照
        </span>
        <span>规则已同步至当前门店</span>
      </footer>
    </div>
  );
}
