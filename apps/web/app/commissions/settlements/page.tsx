"use client";

import { App, Button, Card, Input, Select, Table, Tag } from "antd";
import {
  AuditOutlined,
  CalculatorOutlined,
  DownloadOutlined,
  FileSearchOutlined,
  FilterOutlined,
  ProfileOutlined,
  ReloadOutlined,
  RiseOutlined,
  WalletOutlined
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { commissionsApi, constructionApi, orderApi, reportsApi } from "../../../src/lib/api";
import { formatCentsAsYuan } from "../../../src/features/finance/display";
import { getConstructionStatusLabel } from "../../../src/features/construction/display";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

type CommissionOrderSource = {
  id: string;
  orderNo?: string | null;
  customer?: { personalName?: string | null; companyName?: string | null; name?: string | null } | null;
  vehicle?: { plateNo?: string | null } | null;
};

type ConstructionRecordSource = {
  id: string;
  orderId: string;
  status?: string | null;
  order?: { orderNo?: string | null } | null;
};

type SettlementSourceRow = {
  id: string;
  source: string;
  role: string;
  period: string;
  relatedCount: number;
  baseAmount: string;
  rewardAmount: string;
  penaltyAmount: string;
  payableAmount: string;
  status: string;
  note: string;
};

function currentMonthValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCustomerLabel(order: CommissionOrderSource) {
  return order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name ?? "客户未加载";
}

function getOrderLabel(order: CommissionOrderSource) {
  return [order.orderNo ?? "订单未加载", getCustomerLabel(order), order.vehicle?.plateNo].filter(Boolean).join(" / ");
}

export default function CommissionSettlementsPage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const settlementMonth = currentMonthValue();

  const rulesQuery = useQuery({
    queryKey: ["commission-settlement", "rules", storeId],
    queryFn: () => commissionsApi.salesRules(storeId!),
    enabled: Boolean(storeId)
  });
  const ordersQuery = useQuery({
    queryKey: ["commission-settlement", "orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "COMPLETED", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const constructionRecordsQuery = useQuery({
    queryKey: ["commission-settlement", "construction-records", storeId],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const summaryQuery = useQuery({
    queryKey: ["commission-settlement", "summary", storeId],
    queryFn: () => reportsApi.summary(storeId),
    enabled: Boolean(storeId)
  });

  const orderRows = ((ordersQuery.data?.items ?? []) as CommissionOrderSource[]).slice(0, 3);
  const constructionRecordRows = ((constructionRecordsQuery.data ?? []) as ConstructionRecordSource[]).slice(0, 3);
  const settlementRows: SettlementSourceRow[] = [
    ...orderRows.map((order) => ({
      id: `sales-${order.id}`,
      source: "销售提成",
      role: "销售顾问",
      period: settlementMonth,
      relatedCount: 1,
      baseAmount: "-",
      rewardAmount: "按规则生成",
      penaltyAmount: "-",
      payableAmount: "待生成",
      status: "待结算",
      note: getOrderLabel(order)
    })),
    ...constructionRecordRows.map((record) => ({
      id: `worker-${record.id}`,
      source: "师傅提成",
      role: "施工师傅",
      period: settlementMonth,
      relatedCount: 1,
      baseAmount: "需录入",
      rewardAmount: "按施工记录生成",
      penaltyAmount: "售后扣减待接入",
      payableAmount: "待生成",
      status: "待结算",
      note: [record.order?.orderNo ?? "订单未加载", getConstructionStatusLabel(record.status)].filter(Boolean).join(" / ")
    }))
  ];
  const availableSourceCount = (ordersQuery.data?.items?.length ?? 0) + (constructionRecordsQuery.data?.length ?? 0);
  const totalCommissionCents =
    (summaryQuery.data?.salesCommissionAmountCents ?? 0) + (summaryQuery.data?.workerCommissionAmountCents ?? 0);
  const latestTrend = summaryQuery.data?.commissionTrend?.at(-1);
  const isSettlementLoading = ordersQuery.isLoading || constructionRecordsQuery.isLoading || rulesQuery.isLoading;

  return (
    <div className="management-page commission-settlement-page">
      <StorePageHeader title="提成结算" description="按原型整理销售和施工提成的生成、审核与发放工作台" />

      <div className="commission-settlement-tabs" role="tablist" aria-label="提成结算视图">
        <button className="is-active" type="button">
          提成结算日志
        </button>
        <button type="button">待结算提成</button>
        <Button href="/commissions" icon={<ProfileOutlined />}>
          佣金规则配置
        </Button>
      </div>

      <section className="commission-settlement-kpi-grid">
        <Card className="commission-settlement-kpi-card">
          <span className="commission-settlement-kpi-icon">
            <WalletOutlined />
          </span>
          <p>本月应发提成总额 (CNY)</p>
          <strong>{formatCentsAsYuan(totalCommissionCents)}</strong>
          <small>
            <RiseOutlined /> 报表已生成提成快照
          </small>
        </Card>
        <Card className="commission-settlement-kpi-card is-warning">
          <span className="commission-settlement-kpi-icon">
            <AuditOutlined />
          </span>
          <p>待审核总额</p>
          <strong>{availableSourceCount} 项</strong>
          <small>来自已完工订单和施工记录</small>
        </Card>
        <Card className="commission-settlement-kpi-card is-success">
          <span className="commission-settlement-kpi-icon">
            <CalculatorOutlined />
          </span>
          <p>已发放总额</p>
          <strong>{formatCentsAsYuan(latestTrend?.totalCommissionCents ?? 0)}</strong>
          <small>最近月度提成趋势</small>
        </Card>
      </section>

      <section className="commission-settlement-filter">
        <div className="commission-settlement-filter-grid">
          <label>
            <span>角色类型</span>
            <Select
              defaultValue="ALL"
              options={[
                { label: "全部角色", value: "ALL" },
                { label: "销售顾问", value: "SALES" },
                { label: "施工师傅", value: "CONSTRUCTION" }
              ]}
            />
          </label>
          <label>
            <span>姓名</span>
            <Input placeholder="输入姓名关键词" />
          </label>
          <label>
            <span>结算月份</span>
            <Input type="month" defaultValue={settlementMonth} />
          </label>
          <label>
            <span>单据状态</span>
            <Select
              defaultValue="ALL"
              options={[
                { label: "全部状态", value: "ALL" },
                { label: "待结算", value: "PENDING" },
                { label: "已生成", value: "GENERATED" },
                { label: "已审核", value: "APPROVED" },
                { label: "已发放", value: "PAID" }
              ]}
            />
          </label>
          <div className="commission-settlement-filter-actions">
            <Button type="primary" icon={<FilterOutlined />}>
              查询
            </Button>
            <Button icon={<ReloadOutlined />}>重置</Button>
          </div>
        </div>
      </section>

      <section className="commission-settlement-table">
        <div className="commission-settlement-table-head">
          <div>
            <h2>结算日志明细</h2>
            <p>当前版本展示可结算来源，不伪造已结算流水</p>
          </div>
          <div>
            <Button icon={<DownloadOutlined />} onClick={() => message.info("提成报表导出将在结算流水接口完成后接入")}>
              导出报表
            </Button>
            <Button type="primary" icon={<CalculatorOutlined />} onClick={() => message.info("请先在佣金规则配置页按订单或施工记录生成提成")}>
              生成本月结算单
            </Button>
          </div>
        </div>
        <div className="commission-settlement-log-mobile-cards">
          {settlementRows.length > 0 ? (
            settlementRows.map((row) => (
              <article className="commission-settlement-log-mobile-card" key={row.id}>
                <div className="commission-settlement-log-mobile-card-head">
                  <div>
                    <strong>{row.source}</strong>
                    <span>{row.note}</span>
                  </div>
                  <Tag color="processing">{row.status}</Tag>
                </div>
                <dl className="commission-settlement-log-mobile-card-fields">
                  <div>
                    <dt>姓名/岗位</dt>
                    <dd>{row.role}</dd>
                  </div>
                  <div>
                    <dt>结算周期</dt>
                    <dd>{row.period}</dd>
                  </div>
                  <div>
                    <dt>关联订单</dt>
                    <dd>{row.relatedCount} 单</dd>
                  </div>
                  <div>
                    <dt>提成底薪</dt>
                    <dd>{row.baseAmount}</dd>
                  </div>
                  <div>
                    <dt>绩效奖励</dt>
                    <dd>{row.rewardAmount}</dd>
                  </div>
                  <div>
                    <dt>售后罚款</dt>
                    <dd>{row.penaltyAmount}</dd>
                  </div>
                  <div>
                    <dt>实发金额</dt>
                    <dd>{row.payableAmount}</dd>
                  </div>
                </dl>
                <Button type="link" href="/commissions">
                  去生成
                </Button>
              </article>
            ))
          ) : (
            <div className="commission-settlement-log-mobile-empty">
              {isSettlementLoading ? "正在加载结算来源..." : "暂无结算日志"}
            </div>
          )}
        </div>
        <Table<SettlementSourceRow>
          className="commission-settlement-log-desktop-table"
          rowKey="id"
          loading={isSettlementLoading}
          dataSource={settlementRows}
          pagination={false}
          columns={[
            { title: "结算来源", dataIndex: "source" },
            { title: "姓名/岗位", dataIndex: "role" },
            { title: "结算周期", dataIndex: "period" },
            { title: "关联订单", dataIndex: "relatedCount", render: (count) => `${count} 单` },
            { title: "提成底薪", dataIndex: "baseAmount" },
            { title: "绩效奖励", dataIndex: "rewardAmount" },
            { title: "售后罚款", dataIndex: "penaltyAmount" },
            { title: "实发金额", dataIndex: "payableAmount" },
            { title: "状态", dataIndex: "status", render: (status) => <Tag color="processing">{status}</Tag> },
            {
              title: "操作",
              render: () => (
                <Button type="link" href="/commissions">
                  去生成
                </Button>
              )
            }
          ]}
        />
      </section>

      <section className="commission-settlement-queue">
        <div>
          <FileSearchOutlined />
          <span>可结算来源</span>
          <strong>{availableSourceCount}</strong>
        </div>
        <div>
          <ProfileOutlined />
          <span>已配置规则</span>
          <strong>{rulesQuery.data?.length ?? 0}</strong>
        </div>
        <div>
          <AuditOutlined />
          <span>审核/发放流水</span>
          <strong>待后端接入</strong>
        </div>
      </section>
    </div>
  );
}
