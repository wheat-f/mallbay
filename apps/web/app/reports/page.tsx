"use client";

import { DownloadOutlined, FilterOutlined } from "@ant-design/icons";
import { App, Button, Card, DatePicker, Empty, Select, Space, Statistic, Table, Tabs, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import type { OperationalReportFilters } from "@mallbay/shared";
import { useMemo, useState } from "react";
import { reportsApi } from "../../src/lib/api";
import { yuanCurrency } from "../../src/features/orders/order-display";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { exportWorkbookToExcel } from "../../src/lib/export-excel";
import { useAuthStore } from "../../src/stores/auth-store";

type ReportView = "sales" | "construction" | "finance" | "project" | "afterSalesWorker" | "afterSalesBreakdown";

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
  const [filters, setFilters] = useState<OperationalReportFilters>({ storeId, dateBasis: "DEFAULT" });
  const filterOptionsQuery = useQuery({
    queryKey: ["report-filter-options", storeId],
    queryFn: () => reportsApi.filterOptions(storeId),
    enabled: Boolean(storeId) || Boolean(user?.isAuditor)
  });
  const query = useMemo(() => ({ ...filters, storeId }), [filters, storeId]);
  const reportQuery = useQuery({
    queryKey: ["operational-reports", query],
    queryFn: () => reportsApi.operational(query),
    enabled: Boolean(storeId) || Boolean(user?.isAuditor)
  });
  const report = reportQuery.data;
  const options = filterOptionsQuery.data;
  const availableViews = isSales ? reportViews.filter((item) => item.key === "sales") : reportViews;
  const currentView = availableViews.some((item) => item.key === view) ? view : "sales";
  const salesAmount = report?.salesPeople.reduce((sum, row) => sum + row.amountCents, 0) ?? 0;
  const receivedAmount = report?.salesPeople.reduce((sum, row) => sum + row.receivedCents, 0) ?? 0;
  const profitAmount = report?.financeOrders.reduce((sum, row) => sum + (row.grossProfitCents ?? 0), 0) ?? 0;
  const exportCurrentView = async () => {
    if (!report) {
      message.warning("报表数据尚未加载完成");
      return;
    }
    const rows = buildExportRows(currentView, report);
    await exportWorkbookToExcel("经营分析报表.xlsx", [{ sheetName: currentView, title: reportViews.find((item) => item.key === currentView)?.label ?? "经营分析", rows }]);
    message.success("当前报表已导出");
  };

  return (
    <div className="management-page reports-page">
      <StorePageHeader title={isSales ? "我的销售业绩" : "分析报表中心"} description="按真实人员、业务日期与订单明细分析经营数据" />

      <Card className="reports-filter-card">
        <div className="reports-filter-title"><FilterOutlined /><span>全局数据筛选</span></div>
        <div className="reports-filter-grid">
          <label>
            <span>日期范围</span>
            <DatePicker.RangePicker onChange={(dates) => setFilters((current) => ({ ...current, dateFrom: dateText(dates?.[0]), dateTo: dateText(dates?.[1]) }))} />
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
            <span>订单状态</span>
            <Select allowClear placeholder="全部状态" value={filters.orderStatus} options={options?.orderStatuses.map((value) => ({ value, label: value }))} onChange={(orderStatus) => setFilters((current) => ({ ...current, orderStatus }))} />
          </label>
          <Space align="end"><Button onClick={() => setFilters({ storeId, dateBasis: "DEFAULT" })}>重置筛选</Button></Space>
        </div>
      </Card>

      <section className="reports-bento-grid">
        <Card className="reports-metric-card"><Statistic title="订单金额" value={yuanCurrency(salesAmount)} loading={reportQuery.isLoading} /></Card>
        <Card className="reports-metric-card"><Statistic title="实际收款" value={yuanCurrency(receivedAmount)} loading={reportQuery.isLoading} /></Card>
        <Card className="reports-metric-card"><Statistic title="订单预计/实际毛利" value={yuanCurrency(profitAmount)} loading={reportQuery.isLoading} /></Card>
        <Card className="reports-metric-card"><Statistic title="售后单数" value={report?.afterSaleBreakdown.reduce((sum, row) => sum + row.afterSales, 0) ?? 0} loading={reportQuery.isLoading} /></Card>
      </section>

      <Card className="reports-detail-card" title="经营分析明细" extra={<Button icon={<DownloadOutlined />} onClick={() => void exportCurrentView()}>导出当前视图</Button>}>
        <Tabs activeKey={currentView} onChange={(key) => setView(key as ReportView)} items={availableViews.map((item) => ({ key: item.key, label: item.label }))} />
        <Typography.Paragraph type="secondary">
          {currentView === "construction" && "施工金额仅在店长确认实际工时后按确认工时分摊；未确认时只展示实际提成，不虚构分摊金额。"}
          {currentView === "finance" && "成本来源：已确认/已结算的施工成本使用实际值；未结算订单使用产品材料成本标准；缺失时明确标记待补齐。"}
          {currentView === "afterSalesWorker" && "售后费用包含材料、实际施工人工、退款/补偿、外包与供应商追偿；费用台账接入后按四类分别汇总。"}
          {currentView === "afterSalesBreakdown" && "按售后处理状态与责任归属统计数量及占比。"}
        </Typography.Paragraph>
        <OperationalReportTable view={currentView} loading={reportQuery.isLoading} report={report} />
      </Card>
    </div>
  );
}

function OperationalReportTable({ view, loading, report }: { view: ReportView; loading: boolean; report: Awaited<ReturnType<typeof reportsApi.operational>> | undefined }) {
  if (!report && !loading) return <Empty description="暂无符合条件的数据" />;
  if (view === "sales") return <Table rowKey="userId" loading={loading} pagination={false} dataSource={report?.salesPeople ?? []} columns={[
    { title: "销售人员", dataIndex: "name" }, { title: "订单数", dataIndex: "orders" },
    { title: "销售金额", dataIndex: "amountCents", render: yuanCurrency }, { title: "实际收款", dataIndex: "receivedCents", render: yuanCurrency },
    { title: "成本", dataIndex: "costCents", render: yuanCurrency }, { title: "毛利", dataIndex: "grossProfitCents", render: yuanCurrency },
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

function buildExportRows(view: ReportView, report: Awaited<ReturnType<typeof reportsApi.operational>>) {
  if (view === "sales") return report.salesPeople.map((row) => ({ "销售人员": row.name, "订单数": row.orders, "销售金额(元)": row.amountCents / 100, "实际收款(元)": row.receivedCents / 100, "成本(元)": row.costCents / 100, "毛利(元)": row.grossProfitCents / 100, "应计提成(元)": row.accruedCommissionCents / 100, "已确认提成(元)": row.confirmedCommissionCents / 100, "已结算提成(元)": row.settledCommissionCents / 100 }));
  if (view === "construction") return report.constructionWorkers.map((row) => ({ "施工人员": row.name, "订单数": row.orders, "分摊施工金额(元)": row.allocatedConstructionChargeCents / 100, "确认工时(分钟)": row.confirmedMinutes, "实际提成(元)": row.accruedCommissionCents / 100, "分摊状态": row.allocationStatus }));
  if (view === "finance") return report.financeOrders.map((row) => ({ "订单号": row.orderNo, "订单金额(元)": row.amountCents / 100, "收款(元)": row.receivedCents / 100, "材料成本(元)": (row.materialCostCents ?? 0) / 100, "施工成本(元)": (row.constructionCostCents ?? 0) / 100, "总成本(元)": row.totalCostCents == null ? "待补齐" : row.totalCostCents / 100, "毛利(元)": row.grossProfitCents == null ? "待补齐" : row.grossProfitCents / 100, "成本来源": row.costSource }));
  if (view === "project") return report.projectStats.map((row) => ({ "统计维度": row.dimension, "项目": row.name, "订单数": row.orders, "订单金额(元)": row.amountCents / 100, "施工收费(元)": row.constructionChargeCents / 100 }));
  if (view === "afterSalesWorker") return report.afterSaleWorkers.map((row) => ({ "施工人员": row.name, "施工订单": row.constructionOrders, "售后单": row.afterSales, "售后占比": row.afterSaleRateBps / 100 }));
  return report.afterSaleBreakdown.map((row) => ({ "售后状态/责任": row.category, "售后数量": row.afterSales, "占比": row.proportionBps / 100 }));
}
