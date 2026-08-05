"use client";

import dayjs from "dayjs";
import { DownloadOutlined, FilterOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, DatePicker, Empty, Select, Space, Statistic, Table, Tabs, Tag, Typography, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { OperationalReport, OperationalReportFilters } from "@mallbay/shared";
import { useMemo, useState } from "react";
import { reportsApi } from "../../src/lib/api";
import { yuanCurrency } from "../../src/features/orders/order-display";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { exportWorkbookToExcel } from "../../src/lib/export-excel";
import { useAuthStore } from "../../src/stores/auth-store";

type ReportView = "sales" | "construction" | "finance" | "project" | "afterSalesWorker" | "afterSalesBreakdown";
type TrendMetric = "amountCents" | "receivedCents" | "outstandingCents" | "grossProfitCents";

const reportViews: Array<{ key: ReportView; label: string }> = [
  { key: "sales", label: "销售业绩" },
  { key: "construction", label: "施工绩效" },
  { key: "finance", label: "财务订单利润" },
  { key: "project", label: "项目经营分析" },
  { key: "afterSalesWorker", label: "售后人员分析" },
  { key: "afterSalesBreakdown", label: "售后结构分析" }
];

const dateBasisOptions = [
  { value: "DEFAULT", label: "按业务默认日期" },
  { value: "ORDER", label: "按订单创建日期" },
  { value: "APPOINTMENT", label: "按预约日期" },
  { value: "CONSTRUCTION_COMPLETED", label: "按施工完工日期" },
  { value: "SETTLEMENT", label: "按成本结算日期" }
];

function currentMonthRange() { const now = dayjs(); return { dateFrom: now.startOf("month").format("YYYY-MM-DD"), dateTo: now.endOf("month").format("YYYY-MM-DD") }; }

function money(value: number | null | undefined) { return value == null ? "待补齐" : yuanCurrency(value); }

function comparisonLabel(item: OperationalReport["comparison"]["amount"]) { if (item.status === "new") return "新增"; if (item.status === "unchanged") return "无变化"; if (item.status === "unavailable" || item.changeBps == null) return "暂无可比"; return (item.changeBps >= 0 ? "+" : "") + (item.changeBps / 100).toFixed(1) + "%"; }

function dateRangeDays(dateFrom?: string, dateTo?: string) { if (!dateFrom || !dateTo) return 0; return dayjs(dateTo).diff(dayjs(dateFrom), "day") + 1; }

function trendMetricLabel(metric: TrendMetric) { return ({ amountCents: "订单金额", receivedCents: "实际收款", outstandingCents: "待收金额", grossProfitCents: "毛利" } as const)[metric]; }

function dateText(value?: { format: (pattern: string) => string } | null) {
  return value?.format("YYYY-MM-DD");
}

function bps(value: number) {
  return `${(value / 100).toFixed(1)}%`;
}

export default function ReportsPage() {
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const isSales = user?.storeMember?.position === "SALES";
  const [view, setView] = useState<ReportView>(isSales ? "sales" : "sales");
  const [filters, setFilters] = useState<OperationalReportFilters>({ storeId, dateBasis: "DEFAULT", ...currentMonthRange() });
  const dateRangeTooLarge = dateRangeDays(filters.dateFrom, filters.dateTo) > 366;
  const dateRangeInvalid = Boolean(filters.dateFrom && filters.dateTo && dateRangeDays(filters.dateFrom, filters.dateTo) <= 0);
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("amountCents");
  const [drilldownApplied, setDrilldownApplied] = useState(false);
  const filterOptionsQuery = useQuery({
    queryKey: ["report-filter-options", storeId],
    queryFn: () => reportsApi.filterOptions(storeId),
    enabled: (Boolean(storeId) || Boolean(user?.isAuditor)) && !dateRangeTooLarge && !dateRangeInvalid
  });
  const query = useMemo(() => ({ ...filters, storeId }), [filters, storeId]);
  const reportQuery = useQuery({
    queryKey: ["operational-reports", query],
    queryFn: () => reportsApi.operational(query),
    enabled: (Boolean(storeId) || Boolean(user?.isAuditor)) && !dateRangeTooLarge && !dateRangeInvalid
  });
  const report = reportQuery.data;
  const filterSummary = [filters.dateFrom && filters.dateTo ? `${filters.dateFrom} 至 ${filters.dateTo}` : "全部日期", `订单日期口径：${dateBasisOptions.find((item) => item.value === (filters.dateBasis ?? "DEFAULT"))?.label ?? "按业务默认日期"}`].join("；");
  const options = filterOptionsQuery.data;
  const availableViews = isSales ? reportViews.filter((item) => item.key === "sales") : reportViews;
  const currentView = availableViews.some((item) => item.key === view) ? view : "sales";
  const exportCurrentView = async () => {
    if (!report) {
      message.warning("报表数据尚未加载完成");
      return;
    }
    const rows = buildExportRows(currentView, report);
    const summaryRows = buildExportSummaryRows(report, filterSummary);
    try {
      await exportWorkbookToExcel("经营分析报表.xlsx", [{ sheetName: "分析摘要", title: "经营分析摘要", subtitle: filterSummary, rows: summaryRows }, { sheetName: currentView, title: reportViews.find((item) => item.key === currentView)?.label ?? "经营分析", subtitle: filterSummary, rows }]);
      message.success("当前报表已导出");
    } catch {
      message.error("导出失败，请重试");
    }
  };

  return (
    <div className="management-page reports-page">
      <StorePageHeader title={isSales ? "我的销售业绩" : "分析报表中心"} description="按真实人员、业务日期与订单明细分析经营数据" />
      <div className="reports-context-strip"><Tag color="blue">{filterSummary}</Tag><Tag>按指标业务日期统计</Tag>{report && <Typography.Text type="secondary">数据更新时间：{dayjs(report.generatedAt).format("YYYY-MM-DD HH:mm:ss")}</Typography.Text>}</div>

      <Card className="reports-filter-card">
        <div className="reports-filter-title"><FilterOutlined /><span>全局数据筛选</span></div>
        <div className="reports-filter-grid">
          <label>
            <span>日期范围</span>
            <DatePicker.RangePicker value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : null} onChange={(dates) => setFilters((current) => ({ ...current, dateFrom: dateText(dates?.[0]), dateTo: dateText(dates?.[1]) }))} />
          </label>
          <label>
            <span>日期口径</span>
            <Select value={filters.dateBasis ?? "DEFAULT"} options={dateBasisOptions} onChange={(dateBasis) => setFilters((current) => ({ ...current, dateBasis }))} />
          </label>
          <label>
            <span>销售人员</span>
            <Select allowClear placeholder="全部销售" value={filters.salesPersonId} options={options?.salesPeople.map((person) => ({ value: person.id, label: person.name }))} onChange={(salesPersonId) => setFilters((current) => ({ ...current, salesPersonId }))} />
          </label>
          <label>
            <span>施工人员</span>
            <Select allowClear placeholder="全部施工人员" value={filters.workerUserId} options={options?.constructionPeople.map((person) => ({ value: person.id, label: person.name }))} onChange={(workerUserId) => setFilters((current) => ({ ...current, workerUserId }))} />
          </label>
          <label>
            <span>施工类型</span>
            <Select allowClear placeholder="全部类型" value={filters.constructionType} options={options?.constructionTypes.map((value) => ({ value, label: value }))} onChange={(constructionType) => setFilters((current) => ({ ...current, constructionType }))} />
          </label>
          <label>
            <span>产品分类</span>
            <Select allowClear placeholder="全部分类" value={filters.productCategory} options={options?.productCategories.map((value) => ({ value, label: value }))} onChange={(productCategory) => setFilters((current) => ({ ...current, productCategory }))} />
          </label>
          <label>
            <span>成本来源</span>
            <Select allowClear placeholder="全部成本来源" value={filters.costSource} options={[{ value: "实际", label: "实际成本" }, { value: "标准", label: "标准成本" }, { value: "待补齐", label: "待补齐" }]} onChange={(costSource) => setFilters((current) => ({ ...current, costSource }))} />
          </label>
          <label>
            <span>收款状态</span>
            <Select allowClear placeholder="全部收款状态" value={filters.collectionStatus} options={[{ value: "已收清", label: "已收清" }, { value: "部分收款", label: "部分收款" }, { value: "未收款", label: "未收款" }]} onChange={(collectionStatus) => setFilters((current) => ({ ...current, collectionStatus }))} />
          </label>

          <label>
            <span>订单状态</span>
            <Select allowClear placeholder="全部状态" value={filters.orderStatus} options={options?.orderStatuses.map((value) => ({ value, label: value }))} onChange={(orderStatus) => setFilters((current) => ({ ...current, orderStatus }))} />
          </label>
          <label><span>售后状态</span><Select allowClear placeholder="全部售后状态" value={filters.afterSaleStatus} options={options?.afterSaleStatuses.map((value) => ({ value, label: value }))} onChange={(afterSaleStatus) => setFilters((current) => ({ ...current, afterSaleStatus }))} /></label>
          <label><span>售后责任</span><Select allowClear placeholder="全部售后责任" value={filters.afterSaleResponsibility} options={options?.afterSaleResponsibilities.map((value) => ({ value, label: value }))} onChange={(afterSaleResponsibility) => setFilters((current) => ({ ...current, afterSaleResponsibility }))} /></label>
          <Space align="end"><Button icon={<ReloadOutlined />} onClick={() => { setDrilldownApplied(false); setFilters({ storeId, dateBasis: "DEFAULT", ...currentMonthRange() }); }}>重置筛选</Button></Space>
        </div>
      </Card>

      {dateRangeInvalid && <Alert type="warning" showIcon message="开始日期不能晚于结束日期，请重新选择日期范围" />}
      {dateRangeTooLarge && <Alert type="warning" showIcon message="日期范围不能超过 366 天，请缩小范围" />}
      {drilldownApplied && <Alert type="info" showIcon message="已应用分析条件" action={<Button size="small" onClick={() => { setDrilldownApplied(false); setFilters({ storeId, dateBasis: "DEFAULT", ...currentMonthRange() }); }}>清除条件</Button>} />}
      {reportQuery.isError && <Alert type="error" showIcon message="报表加载失败" description="请检查筛选条件或稍后重试。" action={<Button size="small" onClick={() => void reportQuery.refetch()}>重试</Button>} />}

      {reportQuery.isLoading && <Card className="reports-loading-card"><Skeleton active paragraph={{ rows: 3 }} /></Card>}
      <section className="reports-bento-grid">
        <Card className="reports-metric-card"><Statistic title="订单金额" value={money(report?.summary.amountCents)} loading={reportQuery.isLoading} />{report && <Typography.Text type="secondary">较上期 {comparisonLabel(report.comparison.amount)}</Typography.Text>}</Card>
        <Card className="reports-metric-card"><Statistic title="实际收款" value={money(report?.summary.receivedCents)} loading={reportQuery.isLoading} />{report && <Typography.Text type="secondary">较上期 {comparisonLabel(report.comparison.received)}</Typography.Text>}</Card>
        <Card className="reports-metric-card"><Statistic title="毛利" value={money(report?.summary.grossProfitCents)} loading={reportQuery.isLoading} />{report && <Typography.Text type="secondary">较上期 {comparisonLabel(report.comparison.grossProfit)}</Typography.Text>}</Card>
        <Card className="reports-metric-card"><Statistic title="待收金额" value={money(report?.summary.outstandingCents)} loading={reportQuery.isLoading} />{report && <Typography.Text type="secondary">较上期 {comparisonLabel(report.comparison.outstanding)}</Typography.Text>}</Card>
      </section>

      {report && <Card title="本期经营结论" className="reports-insights-card">
        {report.insights.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前数据暂未触发经营异常结论" /> : report.insights.map((insight, index) => (
          <Alert key={insight.title + index} type="warning" showIcon message={insight.title} description={<Space direction="vertical" size={4}><span>{insight.evidence}</span><Button type="link" onClick={() => { if (insight.targetView) setView(insight.targetView as ReportView); if (insight.filters) setFilters((current) => ({ ...current, ...insight.filters })); setDrilldownApplied(true); }}>查看对应明细</Button></Space>} />
        ))}
      </Card>}
      {report && <Card title="趋势分析" extra={<Tag>按{report.trendGranularity === "day" ? "日" : report.trendGranularity === "week" ? "周" : "月"}聚合</Tag>} className="reports-trend-card">
        <Space wrap><span>趋势指标</span><Select value={trendMetric} options={["amountCents", "receivedCents", "outstandingCents", "grossProfitCents"].map((value) => ({ value, label: trendMetricLabel(value as TrendMetric) }))} onChange={setTrendMetric} /></Space>
        <TrendChart trend={report.trend} metric={trendMetric} onPointClick={(period) => { const start = dayjs(period); const end = report.trendGranularity === "day" ? start : report.trendGranularity === "week" ? start.add(6, "day") : start.endOf("month"); setFilters((current) => ({ ...current, dateFrom: start.format("YYYY-MM-DD"), dateTo: end.format("YYYY-MM-DD") })); setDrilldownApplied(true); }} />
        <Space wrap><Tag>订单 {report.summary.orders} 单</Tag><Tag color={report.summary.metricCompleteness === "complete" ? "green" : "orange"}>成本完整度 {(report.summary.costCompletenessBps / 100).toFixed(1)}%</Tag>{report.summary.metricCompleteness === "incomplete" && <Tag color="orange">毛利待补齐 {report.summary.pendingCostOrderCount} 单</Tag>}</Space>
      </Card>}
      {report && <ContributionRiskSummary report={report} onView={(nextView) => { setView(nextView); setDrilldownApplied(true); }} />}
      <Card className="reports-detail-card" title="经营分析明细" extra={<Button icon={<DownloadOutlined />} onClick={() => void exportCurrentView()} disabled={!report || reportQuery.isFetching || dateRangeTooLarge || dateRangeInvalid}>导出当前视图</Button>}>
        <Tabs activeKey={currentView} onChange={(key) => setView(key as ReportView)} items={availableViews.map((item) => ({ key: item.key, label: item.label }))} />
        <Typography.Paragraph type="secondary">
          {currentView === "construction" && "施工金额仅在店长确认实际工时后按确认工时分摊；未确认时只展示实际提成，不虚构分摊金额。"}
          {currentView === "finance" && "成本来源：已确认/已结算的施工成本使用实际值；未结算订单使用产品材料成本标准；缺失时明确标记待补齐。"}
          {currentView === "afterSalesWorker" && "售后费用包含材料、实际施工人工、退款/补偿、外包与供应商追偿，并按费用确认日期计入。"}
          {currentView === "afterSalesBreakdown" && "按售后处理状态与责任归属统计数量及占比。"}
        </Typography.Paragraph>
        <OperationalReportTable view={currentView} loading={reportQuery.isLoading} report={report} />
      </Card>
    </div>
  );
}

function ContributionRiskSummary({ report, onView }: { report: Awaited<ReturnType<typeof reportsApi.operational>>; onView: (view: ReportView) => void }) {
  const topSales = report.salesPeople[0];
  const topProject = report.projectStats[0];
  const topAfterSale = report.afterSaleBreakdown[0];
  return <Card title="贡献与风险结构" className="reports-structure-card">
    <Space wrap size={[12, 12]}>
      <Tag color="blue">销售贡献：{topSales ? `${topSales.name} ${money(topSales.amountCents)}` : "暂无数据"}</Tag>
      <Tag color="blue">项目贡献：{topProject ? `${topProject.name} ${money(topProject.amountCents)}` : "暂无数据"}</Tag>
      <Tag color={report.summary.outstandingCents > 0 ? "orange" : "green"}>待收风险：{money(report.summary.outstandingCents)}</Tag>
      <Tag color={report.summary.pendingCostOrderCount > 0 ? "orange" : "green"}>成本风险：{report.summary.pendingCostOrderCount} 单待补齐</Tag>
      <Tag color={topAfterSale ? "orange" : "green"}>售后结构：{topAfterSale ? `${topAfterSale.category} ${bps(topAfterSale.proportionBps)}` : "暂无数据"}</Tag>
      {topSales && <Button type="link" onClick={() => onView("sales")}>查看销售贡献</Button>}
      {topProject && <Button type="link" onClick={() => onView("project")}>查看项目贡献</Button>}
      {report.summary.outstandingCents > 0 && <Button type="link" onClick={() => onView("finance")}>查看待收</Button>}
      {report.summary.pendingCostOrderCount > 0 && <Button type="link" onClick={() => onView("finance")}>查看待补齐成本</Button>}
      {topAfterSale && <Button type="link" onClick={() => onView("afterSalesBreakdown")}>查看售后结构</Button>}
    </Space>
  </Card>;
}

function TrendChart({ trend, metric, onPointClick }: { trend: OperationalReport["trend"]; metric: TrendMetric; onPointClick: (period: string) => void }) {
  if (trend.length === 0) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前范围暂无趋势数据，请调整日期范围" />;
  const values = trend.map((item) => item[metric]);
  const max = Math.max(...values.map((value) => Math.abs(value ?? 0)), 1);
  const width = 720;
  const height = 180;
  const pointFor = (value: number | null, index: number) => {
    const x = trend.length === 1 ? width / 2 : (index / (trend.length - 1)) * (width - 24) + 12;
    const y = value == null ? height / 2 : height - 24 - ((value + max) / (max * 2)) * (height - 48);
    return { x, y };
  };
  const points = trend.map((item, index) => { const point = pointFor(item[metric], index); return `${point.x.toFixed(1)},${point.y.toFixed(1)}`; }).join(" ");
  return <div className="reports-trend-chart" aria-label={`${trendMetricLabel(metric)}趋势图`}><svg viewBox={`0 0 ${width} ${height}`} role="img"><polyline points={points} fill="none" stroke="#124b73" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />{trend.map((item, index) => { const point = pointFor(item[metric], index); const incomplete = item.metricCompleteness === "incomplete" || item[metric] == null; return <circle key={item.period} cx={point.x} cy={point.y} r="6" fill={incomplete ? "#f59e0b" : "#fff"} stroke={incomplete ? "#f59e0b" : "#124b73"} strokeWidth="3" tabIndex={0} role="button" aria-label={`${item.period} ${trendMetricLabel(metric)}${incomplete ? "待补齐" : yuanCurrency(item[metric] ?? 0)}`} onClick={() => onPointClick(item.period)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onPointClick(item.period); }}><title>{item.period + " " + (incomplete ? "待补齐" : yuanCurrency(item[metric] ?? 0))}</title></circle>; })}</svg><div className="reports-trend-labels">{trend.map((item) => <button type="button" key={item.period} onClick={() => onPointClick(item.period)}>{item.period}</button>)}</div></div>;
}
function OperationalReportTable({ view, loading, report }: { view: ReportView; loading: boolean; report: Awaited<ReturnType<typeof reportsApi.operational>> | undefined }) {
  if (!report && !loading) return <Empty description="暂无符合条件的数据" />;
  if (report) {
    const rowCount = view === "sales" ? report.salesPeople.length : view === "construction" ? report.constructionWorkers.length : view === "finance" ? report.financeOrders.length : view === "project" ? report.projectStats.length : view === "afterSalesWorker" ? report.afterSaleWorkers.length : report.afterSaleBreakdown.length;
    if (rowCount === 0 && !loading) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的数据，请调整筛选范围" />;
  }
  if (view === "sales") return <Table rowKey="userId" loading={loading} pagination={false} dataSource={report?.salesPeople ?? []} columns={[
    { title: "销售人员", dataIndex: "name" }, { title: "订单数", dataIndex: "orders" },
    { title: "销售金额", dataIndex: "amountCents", render: yuanCurrency }, { title: "实际收款", dataIndex: "receivedCents", render: yuanCurrency },
    { title: "成本", dataIndex: "costCents", render: yuanCurrency }, { title: "毛利", dataIndex: "grossProfitCents", render: (value: number | null) => money(value) },
    { title: "应计/已确认/已结算提成", render: (_, row) => `${yuanCurrency(row.accruedCommissionCents)} / ${yuanCurrency(row.confirmedCommissionCents)} / ${yuanCurrency(row.settledCommissionCents)}` },
    { title: "成本来源(实际/标准/待补齐)", render: (_, row) => `${row.costSourceActualOrders} / ${row.costSourceStandardOrders} / ${row.costSourceMissingOrders}` }
  ]} />;
  if (view === "construction") return <Table rowKey="userId" loading={loading} pagination={false} dataSource={report?.constructionWorkers ?? []} columns={[
    { title: "施工人员", dataIndex: "name" }, { title: "参与订单", dataIndex: "orders" }, { title: "订单金额", dataIndex: "orderAmountCents", render: yuanCurrency },
    { title: "施工收费", dataIndex: "constructionChargeCents", render: yuanCurrency }, { title: "分摊施工金额", dataIndex: "allocatedConstructionChargeCents", render: yuanCurrency },
    { title: "确认工时(分钟)", dataIndex: "confirmedMinutes" }, { title: "提成(应计/确认/结算)", render: (_, row) => `${yuanCurrency(row.accruedCommissionCents)} / ${yuanCurrency(row.confirmedCommissionCents)} / ${yuanCurrency(row.settledCommissionCents)}` },
    { title: "分摊状态", dataIndex: "allocationStatus", render: (value) => <Tag color={value === "已按确认工时分摊" ? "green" : value === "店长手工分摊" ? "blue" : "orange"}>{value}</Tag> }
  ]} />;
  if (view === "finance") return <Table rowKey="orderId" loading={loading} pagination={{ pageSize: 20 }} dataSource={report?.financeOrders ?? []} columns={[
    { title: "订单号", dataIndex: "orderNo" }, { title: "销售员", dataIndex: "salesPersonName" }, { title: "施工类型", dataIndex: "constructionType" }, { title: "订单状态", dataIndex: "status" },
    { title: "订单金额", dataIndex: "amountCents", render: yuanCurrency }, { title: "收款", dataIndex: "receivedCents", render: yuanCurrency },
    { title: "材料成本", dataIndex: "materialCostCents", render: yuanCurrency }, { title: "施工成本", dataIndex: "constructionCostCents", render: yuanCurrency },
    { title: "总成本", dataIndex: "totalCostCents", render: (value) => value == null ? "待补齐" : yuanCurrency(value) }, { title: "毛利", dataIndex: "grossProfitCents", render: (value) => value == null ? "待补齐" : yuanCurrency(value) },
    { title: "成本来源", dataIndex: "costSource", render: (value) => <Tag color={value === "实际" ? "green" : value === "标准" ? "blue" : "orange"}>{value}</Tag> }
  ]} />;
  if (view === "project") return <Table rowKey={(row) => `${row.dimension}-${row.name}`} loading={loading} pagination={false} dataSource={report?.projectStats ?? []} columns={[
    { title: "统计维度", dataIndex: "dimension" }, { title: "项目", dataIndex: "name" }, { title: "订单数", dataIndex: "orders" }, { title: "订单金额", dataIndex: "amountCents", render: yuanCurrency }, { title: "施工收费", dataIndex: "constructionChargeCents", render: yuanCurrency }
  ]} />;
  if (view === "afterSalesWorker") return <Table rowKey="userId" loading={loading} pagination={false} dataSource={report?.afterSaleWorkers ?? []} columns={[
    { title: "施工人员", dataIndex: "name" }, { title: "施工订单", dataIndex: "constructionOrders" }, { title: "售后单", dataIndex: "afterSales" }, { title: "售后占比", dataIndex: "afterSaleRateBps", render: bps },
    { title: "材料", dataIndex: "materialCostCents", render: yuanCurrency }, { title: "施工人工", dataIndex: "laborCostCents", render: yuanCurrency }, { title: "退款/补偿", dataIndex: "refundCompensationCents", render: yuanCurrency }, { title: "外包", dataIndex: "outsourceCostCents", render: yuanCurrency }, { title: "供应商追偿", dataIndex: "supplierRecoveryCents", render: yuanCurrency }
  ]} />;
  return <Table rowKey="category" loading={loading} pagination={false} dataSource={report?.afterSaleBreakdown ?? []} columns={[
    { title: "售后状态 / 责任", dataIndex: "category" }, { title: "售后数量", dataIndex: "afterSales" }, { title: "相对占比", dataIndex: "proportionBps", render: bps }
  ]} />;
}

function buildExportSummaryRows(report: Awaited<ReturnType<typeof reportsApi.operational>>, filterSummary: string) {
  return [
    { 类别: "查询条件", 指标: "筛选范围", 数值: filterSummary },
    { 类别: "查询条件", 指标: "数据更新时间", 数值: report.generatedAt },
    { 类别: "核心指标", 指标: "订单金额", 数值: money(report.summary.amountCents) },
    { 类别: "核心指标", 指标: "实际收款", 数值: money(report.summary.receivedCents) },
    { 类别: "核心指标", 指标: "待收金额", 数值: money(report.summary.outstandingCents) },
    { 类别: "核心指标", 指标: "毛利", 数值: money(report.summary.grossProfitCents) },
    { 类别: "对比", 指标: "订单金额较上期", 数值: comparisonLabel(report.comparison.amount) },
    { 类别: "对比", 指标: "实际收款较上期", 数值: comparisonLabel(report.comparison.received) },
    { 类别: "对比", 指标: "待收金额较上期", 数值: comparisonLabel(report.comparison.outstanding) },
    { 类别: "对比", 指标: "毛利较上期", 数值: comparisonLabel(report.comparison.grossProfit) },
    { 类别: "数据覆盖", 指标: "成本完整度", 数值: `${(report.summary.costCompletenessBps / 100).toFixed(1)}%` },
    { 类别: "数据覆盖", 指标: "待补齐成本订单", 数值: report.summary.pendingCostOrderCount },
    { 类别: "数据覆盖", 指标: "缺失日期记录", 数值: report.summary.coverage.ordersWithMissingBusinessDate + report.summary.coverage.paymentsWithMissingEntryDate + report.summary.coverage.costsWithMissingConfirmationDate + report.summary.coverage.afterSalesWithMissingConfirmationDate },
    ...report.insights.map((insight) => ({ 类别: "经营结论", 指标: insight.title, 数值: `${insight.evidence}；动作：${insight.action}` }))
  ];
}
function buildExportRows(view: ReportView, report: Awaited<ReturnType<typeof reportsApi.operational>>) {
  if (view === "sales") return report.salesPeople.map((row) => ({ "销售人员": row.name, "订单数": row.orders, "销售金额(元)": row.amountCents / 100, "实际收款(元)": row.receivedCents / 100, "成本(元)": row.costCents / 100, "毛利(元)": money(row.grossProfitCents), "应计提成(元)": row.accruedCommissionCents / 100, "已确认提成(元)": row.confirmedCommissionCents / 100, "已结算提成(元)": row.settledCommissionCents / 100 }));
  if (view === "construction") return report.constructionWorkers.map((row) => ({ "施工人员": row.name, "订单数": row.orders, "分摊施工金额(元)": row.allocatedConstructionChargeCents / 100, "确认工时(分钟)": row.confirmedMinutes, "实际提成(元)": row.accruedCommissionCents / 100, "分摊状态": row.allocationStatus }));
  if (view === "finance") return report.financeOrders.map((row) => ({ "订单号": row.orderNo, "订单金额(元)": row.amountCents / 100, "收款(元)": row.receivedCents / 100, "材料成本(元)": money(row.materialCostCents), "施工成本(元)": money(row.constructionCostCents), "总成本(元)": row.totalCostCents == null ? "待补齐" : row.totalCostCents / 100, "毛利(元)": row.grossProfitCents == null ? "待补齐" : row.grossProfitCents / 100, "成本来源": row.costSource }));
  if (view === "project") return report.projectStats.map((row) => ({ "统计维度": row.dimension, "项目": row.name, "订单数": row.orders, "订单金额(元)": row.amountCents / 100, "施工收费(元)": row.constructionChargeCents / 100 }));
  if (view === "afterSalesWorker") return report.afterSaleWorkers.map((row) => ({ "施工人员": row.name, "施工订单": row.constructionOrders, "售后单": row.afterSales, "售后占比": row.afterSaleRateBps / 100 }));
  return report.afterSaleBreakdown.map((row) => ({ "售后状态/责任": row.category, "售后数量": row.afterSales, "占比": row.proportionBps / 100 }));
}
