"use client";

import {
  BarChartOutlined,
  BulbOutlined,
  DownloadOutlined,
  FilterOutlined,
  PayCircleOutlined,
  RiseOutlined,
  ToolOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { Button, Card, Empty, Select, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import type { ReportSummary } from "@mallbay/shared";
import type { ReactNode } from "react";
import { reportsApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { yuanCurrency } from "../../src/features/orders/order-display";
import {
  buildAfterSaleTrendRows,
  buildCommissionTrendRows,
  buildConstructionTrendRows,
  buildFinanceTrendRows,
  buildInventoryTrendRows,
  buildInvoiceTrendRows,
  buildRebateTrendRows,
  buildReportInsightRows,
  buildReportRows,
  buildSalesPerformanceInsightRows,
  buildSalesPerformanceRows,
  buildSalesTrendRows,
  type AfterSaleTrendDisplayRow,
  type CommissionTrendDisplayRow,
  type ConstructionTrendDisplayRow,
  type FinanceTrendDisplayRow,
  type InventoryTrendDisplayRow,
  type InvoiceTrendDisplayRow,
  type RebateTrendDisplayRow,
  type ReportDisplayRow,
  type ReportInsightRow,
  type SalesTrendDisplayRow
} from "../../src/features/reports/display";

type ReportTab = {
  key: string;
  label: string;
};

const STORE_REPORT_TABS: ReportTab[] = [
  { key: "sales", label: "销售报表" },
  { key: "payments", label: "收款报表" },
  { key: "construction", label: "施工人员施工情况" },
  { key: "workerCommission", label: "施工人员提成" },
  { key: "afterSales", label: "施工人员售后情况" },
  { key: "salesCommission", label: "销售人员提成统计" },
  { key: "delivery", label: "施工报表" },
  { key: "finance", label: "财务报表" }
];

const SALES_REPORT_TABS: ReportTab[] = [
  { key: "performance", label: "我的业绩" },
  { key: "collection", label: "我的回款" },
  { key: "commission", label: "我的销售提成" },
  { key: "invoice", label: "我的发票" },
  { key: "rebate", label: "我的返利" }
];

function ReportSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="reports-section-title">
      <Typography.Title level={4}>{title}</Typography.Title>
      <Typography.Text type="secondary">{description}</Typography.Text>
    </div>
  );
}

function ReportsPageHeader({ isSalesReport }: { isSalesReport: boolean }) {
  return (
    <StorePageHeader
      title={isSalesReport ? "我的业绩" : "分析报表中心"}
      description={isSalesReport ? "查看自己的订单、回款、发票、返利和销售提成" : "销售、收款、施工、售后、发票和返利的门店经营分析"}
    />
  );
}

function ReportDataView<T extends object>({
  rowKey,
  loading,
  dataSource,
  columns
}: {
  rowKey: keyof T & string;
  loading: boolean;
  dataSource: T[];
  columns: ColumnType<T>[];
}) {
  const rows = dataSource ?? [];
  const primaryColumn = columns[0];
  const detailColumns = columns.slice(1);

  return (
    <>
      <div className="reports-data-mobile-cards">
        {loading ? (
          <div className="reports-data-mobile-empty">数据加载中</div>
        ) : rows.length > 0 ? (
          rows.map((row, index) => (
            <article className="reports-data-mobile-card" key={getReportRowKey(row, rowKey, index)}>
              <div className="reports-data-mobile-card-head">
                <div>
                  <strong>{primaryColumn ? renderReportCell(primaryColumn, row, index) : "-"}</strong>
                  <span>{primaryColumn ? renderReportColumnTitle(primaryColumn.title) : "指标"}</span>
                </div>
              </div>
              <dl className="reports-data-mobile-fields">
                {detailColumns.map((column, columnIndex) => (
                  <div key={`${getReportRowKey(row, rowKey, index)}-${columnIndex}`}>
                    <dt>{renderReportColumnTitle(column.title)}</dt>
                    <dd>{renderReportCell(column, row, index)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))
        ) : (
          <div className="reports-data-mobile-empty">暂无数据</div>
        )}
      </div>
      <Table<T>
        className="reports-data-desktop-table"
        rowKey={rowKey}
        loading={loading}
        dataSource={rows}
        pagination={false}
        columns={columns}
      />
    </>
  );
}

function metricValue(rows: ReportDisplayRow[], key: ReportDisplayRow["key"]) {
  return rows.find((row) => row.key === key)?.value ?? "0";
}

function percentNumber(value: string) {
  const parsed = Number(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildInsightSentences(insightRows: ReportInsightRow[], isSalesReport: boolean) {
  const collectionRate = percentNumber(insightRows.find((row) => row.key === "collectionRate")?.value ?? "0%");
  const afterSalesRate = percentNumber(insightRows.find((row) => row.key === "afterSalesRate")?.value ?? "0%");
  const outstandingAmount = insightRows.find((row) => row.key === "outstandingAmount")?.value ?? yuanCurrency(0);

  const sentences = [
    {
      key: "collection",
      icon: <WarningOutlined />,
      tone: collectionRate >= 80 ? "success" : "warning",
      text: isSalesReport
        ? `当前个人回款率为 ${collectionRate.toFixed(1)}%，待收金额 ${outstandingAmount}，优先跟进临近交付订单尾款。`
        : `当前门店回款率为 ${collectionRate.toFixed(1)}%，待收金额 ${outstandingAmount}，建议财务与销售同步跟进未结清订单。`
    },
    {
      key: "quality",
      icon: <ToolOutlined />,
      tone: afterSalesRate > 10 ? "danger" : "info",
      text: `售后率为 ${afterSalesRate.toFixed(1)}%，持续关注施工返工与售后责任归因，避免高频问题重复出现。`
    },
    {
      key: "growth",
      icon: <RiseOutlined />,
      tone: "success",
      text: isSalesReport ? "优先推进高客单价客户复购和转介绍，保持销售提成与现金回款同步增长。" : "建议把高毛利施工类型、施工产能和库存采购放在同一节奏内联动分析。"
    }
  ];

  return isSalesReport ? sentences.filter((item) => item.key !== "quality") : sentences;
}

function trendBars(summary?: ReportSummary) {
  const salesTrend = summary?.salesTrend ?? [];
  const max = Math.max(...salesTrend.map((row) => row.totalAmountCents), 1);

  if (salesTrend.length === 0) {
    return [];
  }

  return salesTrend.slice(-8).map((row) => ({
    label: row.month,
    amount: yuanCurrency(row.totalAmountCents),
    height: Math.max(18, Math.round((row.totalAmountCents / max) * 100))
  }));
}

function constructionTypeStats(summary?: ReportSummary) {
  const orders = summary?.orders ?? 0;
  const constructionRecords = summary?.constructionRecords ?? 0;
  const afterSales = summary?.afterSales ?? 0;
  const invoices = summary?.invoices ?? 0;
  const total = Math.max(orders + constructionRecords + afterSales + invoices, 1);

  return [
    { label: "漆面保护膜", value: Math.round((orders / total) * 100), tone: "primary" },
    { label: "施工履约", value: Math.round((constructionRecords / total) * 100), tone: "info" },
    { label: "售后处理", value: Math.round((afterSales / total) * 100), tone: "warning" },
    { label: "发票开具", value: Math.round((invoices / total) * 100), tone: "success" }
  ];
}

function getReportRowKey<T extends object>(row: T, rowKey: keyof T & string, index: number) {
  const value = row[rowKey];
  return value === undefined || value === null ? String(index) : String(value);
}

function renderReportColumnTitle<T extends object>(title: ColumnType<T>["title"]) {
  if (typeof title === "function") {
    return "指标";
  }
  return title ?? "指标";
}

function renderReportCell<T extends object>(column: ColumnType<T>, row: T, index: number): ReactNode {
  const value = readReportCellValue(column.dataIndex, row);
  const rendered = column.render ? column.render(value, row, index) : value;
  if (rendered === undefined || rendered === null || rendered === "") {
    return "-";
  }
  return rendered as ReactNode;
}

function readReportCellValue<T extends object>(dataIndex: ColumnType<T>["dataIndex"], row: T) {
  if (!dataIndex) return undefined;
  const path = Array.isArray(dataIndex) ? dataIndex.map(String) : [String(dataIndex)];
  return path.reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, row);
}

export default function ReportsPage() {
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const isSalesReport = user?.storeMember?.position === "SALES";
  const summaryQuery = useQuery({
    queryKey: ["reports-summary", storeId ?? "all"],
    queryFn: () => reportsApi.summary(storeId),
    enabled: Boolean(storeId) || Boolean(user?.isAuditor)
  });
  const summary = summaryQuery.data;
  const rows = isSalesReport ? buildSalesPerformanceRows(summary) : buildReportRows(summary);
  const insightRows = isSalesReport ? buildSalesPerformanceInsightRows(summary) : buildReportInsightRows(summary);
  const salesTrendRows = buildSalesTrendRows(summary);
  const constructionTrendRows = buildConstructionTrendRows(summary);
  const afterSaleTrendRows = buildAfterSaleTrendRows(summary);
  const commissionTrendRows = buildCommissionTrendRows(summary);
  const inventoryTrendRows = buildInventoryTrendRows(summary);
  const invoiceTrendRows = buildInvoiceTrendRows(summary);
  const rebateTrendRows = buildRebateTrendRows(summary);
  const financeTrendRows = buildFinanceTrendRows(summary);
  const bars = trendBars(summary);
  const tabs = isSalesReport ? SALES_REPORT_TABS : STORE_REPORT_TABS;

  return (
    <div className="management-page reports-page">
      <ReportsPageHeader isSalesReport={isSalesReport} />

      <Card className="reports-filter-card">
        <div className="reports-filter-title">
          <FilterOutlined />
          <span>全局数据筛选</span>
        </div>
        <div className="reports-filter-grid">
          <label>
            <span>日期范围</span>
            <Select defaultValue="本月" options={[{ value: "本月" }, { value: "上个月" }, { value: "本季度" }, { value: "本年度" }]} />
          </label>
          <label>
            <span>销售人员</span>
            <Select defaultValue="全部销售" options={[{ value: "全部销售" }, { value: "当前登录用户" }]} />
          </label>
          <label>
            <span>施工人员</span>
            <Select defaultValue="全部技师" options={[{ value: "全部技师" }, { value: "已派工技师" }]} />
          </label>
          <label>
            <span>施工类型</span>
            <Select defaultValue="全部类型" options={[{ value: "全部类型" }, { value: "漆面保护膜" }, { value: "玻璃膜" }, { value: "复检" }]} />
          </label>
          <label>
            <span>产品型号</span>
            <Select defaultValue="全部型号" options={[{ value: "全部型号" }, { value: "PPF" }, { value: "隔热膜" }]} />
          </label>
          <label>
            <span>订单状态</span>
            <Select defaultValue="全部状态" options={[{ value: "全部状态" }, { value: "待派单" }, { value: "施工中" }, { value: "已完工" }]} />
          </label>
        </div>
      </Card>

      <div className="reports-tabs" role="tablist" aria-label="报表类型">
        {tabs.map((tabItem, index) => (
          <button key={tabItem.key} className={index === 0 ? "is-active" : ""} type="button" role="tab" aria-selected={index === 0}>
            {tabItem.label}
          </button>
        ))}
      </div>

      <Card className="reports-ai-card">
        <div className="reports-ai-icon">
          <BulbOutlined />
        </div>
        <div>
          <Typography.Title level={4}>分析与建议 (AI 洞察)</Typography.Title>
          <Typography.Text type="secondary">基于当前筛选条件下的数据，系统为您生成以下管理建议：</Typography.Text>
          <div className="reports-ai-list">
            {buildInsightSentences(insightRows, isSalesReport).map((item) => (
              <div key={item.key} className={`reports-ai-item reports-ai-item-${item.tone}`}>
                {item.icon}
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <section className="reports-bento-grid">
        <Card className="reports-metric-card">
          <PayCircleOutlined className="reports-metric-icon" />
          <Statistic title={isSalesReport ? "我的订单额" : "订单总额 (元)"} value={metricValue(rows, "totalAmountCents")} loading={summaryQuery.isLoading} />
          <span className="reports-metric-foot">按当前筛选口径汇总</span>
        </Card>
        <Card className="reports-metric-card">
          <BarChartOutlined className="reports-metric-icon" />
          <Statistic title={isSalesReport ? "我的订单数" : "施工单量 (单)"} value={isSalesReport ? metricValue(rows, "orders") : metricValue(rows, "constructionRecords")} loading={summaryQuery.isLoading} />
          <span className="reports-metric-foot">来自订单与施工记录</span>
        </Card>
        <Card className="reports-chart-card reports-sales-trend-card">
          <div className="reports-card-head">
            <Typography.Title level={4}>销售趋势分析</Typography.Title>
            <Tag color="blue">月度</Tag>
          </div>
          {bars.length > 0 ? (
            <div className="reports-bar-chart">
              {bars.map((bar) => (
                <div key={bar.label} className="reports-bar-cell">
                  <div className="reports-bar-value">{bar.amount}</div>
                  <div className="reports-bar" style={{ height: `${bar.height}%` }} />
                  <span>{bar.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无销售趋势数据" />
          )}
        </Card>
        <Card className="reports-chart-card">
          <Typography.Title level={4}>按施工类型统计</Typography.Title>
          <div className="reports-progress-list">
            {constructionTypeStats(summary).map((item) => (
              <div key={item.label}>
                <div className="reports-progress-meta">
                  <span>{item.label}</span>
                  <b>{item.value}%</b>
                </div>
                <div className="reports-progress-track">
                  <div className={`reports-progress-fill reports-progress-${item.tone}`} style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="reports-chart-card">
          <Typography.Title level={4}>{isSalesReport ? "业绩分析" : "经营分析"}</Typography.Title>
          <ReportDataView<ReportInsightRow>
            rowKey="key"
            loading={summaryQuery.isLoading}
            dataSource={insightRows}
            columns={[
              { title: "分析指标", dataIndex: "label" },
              { title: "数值", dataIndex: "value" },
              { title: "计算口径", dataIndex: "description" }
            ]}
          />
        </Card>
      </section>

      <Card
        className="reports-detail-card"
        title={isSalesReport ? "我的业绩指标明细" : "经营指标明细"}
        extra={
          <Button icon={<DownloadOutlined />} type="default">
            导出数据
          </Button>
        }
      >
        <ReportDataView<ReportDisplayRow>
          rowKey="key"
          loading={summaryQuery.isLoading}
          dataSource={rows}
          columns={[
            { title: "指标", dataIndex: "label" },
            { title: "数值", dataIndex: "value" }
          ]}
        />
      </Card>

      <section className="reports-trend-grid">
        <div className="report-section">
          <ReportSectionHeader title="销售趋势" description={isSalesReport ? "按月查看本人订单数、订单额、已收款和回款率" : "按月查看订单数、订单额、已收款和回款率"} />
          <ReportDataView<SalesTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={salesTrendRows}
            columns={[
              { title: "月份", dataIndex: "month" },
              { title: "订单数", dataIndex: "orders" },
              { title: "订单额", dataIndex: "totalAmount" },
              { title: "已收款", dataIndex: "paidAmount" },
              { title: "回款率", dataIndex: "collectionRate" }
            ]}
          />
        </div>

        <div className="report-section">
          <ReportSectionHeader title={isSalesReport ? "我的销售提成" : "提成趋势"} description={isSalesReport ? "按月查看本人销售提成单和销售提成金额" : "按月查看销售提成、师傅提成、调整金额和提成合计"} />
          <ReportDataView<CommissionTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={commissionTrendRows}
            columns={[
              { title: "月份", dataIndex: "month" },
              { title: "销售提成单", dataIndex: "salesLogs" },
              ...(isSalesReport
                ? [{ title: "销售提成金额", dataIndex: "salesCommission" }]
                : [
                    { title: "师傅提成单", dataIndex: "workerCommissions" },
                    { title: "销售提成", dataIndex: "salesCommission" },
                    { title: "师傅提成", dataIndex: "workerCommission" },
                    { title: "调整", dataIndex: "workerAdjustment" },
                    { title: "提成合计", dataIndex: "totalCommission" }
                  ])
            ]}
          />
        </div>

        {isSalesReport ? (
          <>
            <div className="report-section">
              <ReportSectionHeader title="我的发票趋势" description="按月查看本人订单对应发票申请、开具和金额" />
              <ReportDataView<InvoiceTrendDisplayRow>
                rowKey="month"
                loading={summaryQuery.isLoading}
                dataSource={invoiceTrendRows}
                columns={[
                  { title: "月份", dataIndex: "month" },
                  { title: "发票", dataIndex: "invoices" },
                  { title: "已开具", dataIndex: "issued" },
                  { title: "金额", dataIndex: "amount" },
                  { title: "开票率", dataIndex: "issueRate" }
                ]}
              />
            </div>

            <div className="report-section">
              <ReportSectionHeader title="我的返利趋势" description="按月查看本人订单对应返利申请、发放和金额" />
              <ReportDataView<RebateTrendDisplayRow>
                rowKey="month"
                loading={summaryQuery.isLoading}
                dataSource={rebateTrendRows}
                columns={[
                  { title: "月份", dataIndex: "month" },
                  { title: "返利", dataIndex: "rebates" },
                  { title: "已发放", dataIndex: "paid" },
                  { title: "金额", dataIndex: "amount" },
                  { title: "发放率", dataIndex: "payRate" }
                ]}
              />
            </div>
          </>
        ) : (
          <>
            <div className="report-section">
              <ReportSectionHeader title="施工趋势" description="按月查看施工记录、完工、质检通过、返工和完工率" />
              <ReportDataView<ConstructionTrendDisplayRow>
                rowKey="month"
                loading={summaryQuery.isLoading}
                dataSource={constructionTrendRows}
                columns={[
                  { title: "月份", dataIndex: "month" },
                  { title: "施工记录", dataIndex: "records" },
                  { title: "已完工", dataIndex: "completed" },
                  { title: "质检通过", dataIndex: "qualityPassed" },
                  { title: "返工", dataIndex: "reworkRequired" },
                  { title: "完工率", dataIndex: "completionRate" }
                ]}
              />
            </div>

            <div className="report-section">
              <ReportSectionHeader title="售后趋势" description="按月查看售后单、解决率、施工责任和售后率" />
              <ReportDataView<AfterSaleTrendDisplayRow>
                rowKey="month"
                loading={summaryQuery.isLoading}
                dataSource={afterSaleTrendRows}
                columns={[
                  { title: "月份", dataIndex: "month" },
                  { title: "售后单", dataIndex: "cases" },
                  { title: "已解决", dataIndex: "resolved" },
                  { title: "施工责任", dataIndex: "constructionResponsibility" },
                  { title: "解决率", dataIndex: "resolveRate" },
                  { title: "售后率", dataIndex: "afterSalesRate" }
                ]}
              />
            </div>

            <div className="report-section">
              <ReportSectionHeader title="库存趋势" description="按月查看库存流水、入库、出库、锁定、释放和调整数量" />
              <ReportDataView<InventoryTrendDisplayRow>
                rowKey="month"
                loading={summaryQuery.isLoading}
                dataSource={inventoryTrendRows}
                columns={[
                  { title: "月份", dataIndex: "month" },
                  { title: "流水", dataIndex: "movements" },
                  { title: "入库", dataIndex: "inbound" },
                  { title: "出库", dataIndex: "outbound" },
                  { title: "锁定", dataIndex: "locked" },
                  { title: "释放", dataIndex: "released" },
                  { title: "调整", dataIndex: "adjustments" }
                ]}
              />
            </div>

            <div className="report-section">
              <ReportSectionHeader title="发票趋势" description="按月查看发票申请、开具、作废、重开、金额和开票率" />
              <ReportDataView<InvoiceTrendDisplayRow>
                rowKey="month"
                loading={summaryQuery.isLoading}
                dataSource={invoiceTrendRows}
                columns={[
                  { title: "月份", dataIndex: "month" },
                  { title: "发票", dataIndex: "invoices" },
                  { title: "已开具", dataIndex: "issued" },
                  { title: "已作废", dataIndex: "voided" },
                  { title: "已重开", dataIndex: "reissued" },
                  { title: "金额", dataIndex: "amount" },
                  { title: "开票率", dataIndex: "issueRate" }
                ]}
              />
            </div>

            <div className="report-section">
              <ReportSectionHeader title="返利趋势" description="按月查看返利申请、审批、发放、驳回、金额和发放率" />
              <ReportDataView<RebateTrendDisplayRow>
                rowKey="month"
                loading={summaryQuery.isLoading}
                dataSource={rebateTrendRows}
                columns={[
                  { title: "月份", dataIndex: "month" },
                  { title: "返利", dataIndex: "rebates" },
                  { title: "已审批", dataIndex: "approved" },
                  { title: "已发放", dataIndex: "paid" },
                  { title: "已驳回", dataIndex: "rejected" },
                  { title: "金额", dataIndex: "amount" },
                  { title: "发放率", dataIndex: "payRate" }
                ]}
              />
            </div>

            <div className="report-section">
              <ReportSectionHeader title="财务趋势" description="按月查看收款、费用、报销、返利和净现金流" />
              <ReportDataView<FinanceTrendDisplayRow>
                rowKey="month"
                loading={summaryQuery.isLoading}
                dataSource={financeTrendRows}
                columns={[
                  { title: "月份", dataIndex: "month" },
                  { title: "收款", dataIndex: "income" },
                  { title: "费用", dataIndex: "expense" },
                  { title: "报销", dataIndex: "reimbursement" },
                  { title: "返利", dataIndex: "rebate" },
                  { title: "净现金流", dataIndex: "netCashflow" }
                ]}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
