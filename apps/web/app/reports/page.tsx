"use client";

import { Layout, Statistic, Table, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
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

function ReportSectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <Typography.Title level={4} className="!mb-1">
        {title}
      </Typography.Title>
      <Typography.Text type="secondary">{description}</Typography.Text>
    </div>
  );
}

function ReportsPageHeader({ isSalesReport }: { isSalesReport: boolean }) {
  return (
    <StorePageHeader
      title={isSalesReport ? "我的业绩" : "经营报表"}
      description={isSalesReport ? "查看自己的订单、回款、发票、返利和销售提成" : "销售、收款、施工、售后、发票和返利的门店经营汇总"}
    />
  );
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

  if (isSalesReport) {
    return (
      <Layout className="dashboard-shell">
        <Layout.Content className="dashboard-content">
          <ReportsPageHeader isSalesReport={isSalesReport} />

          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {rows.slice(0, 6).map((row) => (
              <div key={row.key} className="rounded border border-slate-200 bg-white p-4">
                <Statistic title={row.label} value={row.value} loading={summaryQuery.isLoading} />
              </div>
            ))}
          </div>

          <Table<ReportDisplayRow>
            rowKey="key"
            loading={summaryQuery.isLoading}
            dataSource={rows}
            pagination={false}
            columns={[
              { title: "指标", dataIndex: "label" },
              { title: "数值", dataIndex: "value" }
            ]}
          />

          <div className="mt-6">
            <ReportSectionHeader title="业绩分析" description="基于本人订单和回款自动计算关键销售指标" />
            <Table<ReportInsightRow>
              rowKey="key"
              loading={summaryQuery.isLoading}
              dataSource={insightRows}
              pagination={false}
              columns={[
                { title: "分析指标", dataIndex: "label" },
                { title: "数值", dataIndex: "value" },
                { title: "计算口径", dataIndex: "description" }
              ]}
            />
          </div>

          <div className="mt-6">
            <ReportSectionHeader title="销售趋势" description="按月查看本人订单数、订单额、已收款和回款率" />
            <Table<SalesTrendDisplayRow>
              rowKey="month"
              loading={summaryQuery.isLoading}
              dataSource={salesTrendRows}
              pagination={false}
              columns={[
                { title: "月份", dataIndex: "month" },
                { title: "订单数", dataIndex: "orders" },
                { title: "订单额", dataIndex: "totalAmount" },
                { title: "已收款", dataIndex: "paidAmount" },
                { title: "回款率", dataIndex: "collectionRate" }
              ]}
            />
          </div>

          <div className="mt-6">
            <ReportSectionHeader title="我的销售提成" description="按月查看本人销售提成单和销售提成金额" />
            <Table<CommissionTrendDisplayRow>
              rowKey="month"
              loading={summaryQuery.isLoading}
              dataSource={commissionTrendRows}
              pagination={false}
              columns={[
                { title: "月份", dataIndex: "month" },
                { title: "销售提成单", dataIndex: "salesLogs" },
                { title: "销售提成金额", dataIndex: "salesCommission" }
              ]}
            />
          </div>

          <div className="mt-6">
            <ReportSectionHeader title="我的发票趋势" description="按月查看本人订单对应发票申请、开具和金额" />
            <Table<InvoiceTrendDisplayRow>
              rowKey="month"
              loading={summaryQuery.isLoading}
              dataSource={invoiceTrendRows}
              pagination={false}
              columns={[
                { title: "月份", dataIndex: "month" },
                { title: "发票", dataIndex: "invoices" },
                { title: "已开具", dataIndex: "issued" },
                { title: "金额", dataIndex: "amount" },
                { title: "开票率", dataIndex: "issueRate" }
              ]}
            />
          </div>

          <div className="mt-6">
            <ReportSectionHeader title="我的返利趋势" description="按月查看本人订单对应返利申请、发放和金额" />
            <Table<RebateTrendDisplayRow>
              rowKey="month"
              loading={summaryQuery.isLoading}
              dataSource={rebateTrendRows}
              pagination={false}
              columns={[
                { title: "月份", dataIndex: "month" },
                { title: "返利", dataIndex: "rebates" },
                { title: "已发放", dataIndex: "paid" },
                { title: "金额", dataIndex: "amount" },
                { title: "发放率", dataIndex: "payRate" }
              ]}
            />
          </div>
        </Layout.Content>
      </Layout>
    );
  }

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <ReportsPageHeader isSalesReport={isSalesReport} />

        <div className="mb-4 grid gap-3 md:grid-cols-4">
          {rows.slice(0, 4).map((row) => (
            <div key={row.key} className="rounded border border-slate-200 bg-white p-4">
              <Statistic title={row.label} value={row.value} loading={summaryQuery.isLoading} />
            </div>
          ))}
        </div>

        <Table<ReportDisplayRow>
          rowKey="key"
          loading={summaryQuery.isLoading}
          dataSource={rows}
          pagination={false}
          columns={[
            { title: "指标", dataIndex: "label" },
            { title: "数值", dataIndex: "value" }
          ]}
        />

        <div className="mt-6">
          <ReportSectionHeader title="经营分析" description="基于当前门店报表摘要自动计算关键经营指标" />
          <Table<ReportInsightRow>
            rowKey="key"
            loading={summaryQuery.isLoading}
            dataSource={insightRows}
            pagination={false}
            columns={[
              { title: "分析指标", dataIndex: "label" },
              { title: "数值", dataIndex: "value" },
              { title: "计算口径", dataIndex: "description" }
            ]}
          />
        </div>

        <div className="mt-6">
          <ReportSectionHeader title="销售趋势" description="按月查看订单数、订单额、已收款和回款率" />
          <Table<SalesTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={salesTrendRows}
            pagination={false}
            columns={[
              { title: "月份", dataIndex: "month" },
              { title: "订单数", dataIndex: "orders" },
              { title: "订单额", dataIndex: "totalAmount" },
              { title: "已收款", dataIndex: "paidAmount" },
              { title: "回款率", dataIndex: "collectionRate" }
            ]}
          />
        </div>

        <div className="mt-6">
          <ReportSectionHeader title="施工趋势" description="按月查看施工记录、完工、质检通过、返工和完工率" />
          <Table<ConstructionTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={constructionTrendRows}
            pagination={false}
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

        <div className="mt-6">
          <ReportSectionHeader title="售后趋势" description="按月查看售后单、解决率、施工责任和售后率" />
          <Table<AfterSaleTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={afterSaleTrendRows}
            pagination={false}
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

        <div className="mt-6">
          <ReportSectionHeader title="提成趋势" description="按月查看销售提成、师傅提成、调整金额和提成合计" />
          <Table<CommissionTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={commissionTrendRows}
            pagination={false}
            columns={[
              { title: "月份", dataIndex: "month" },
              { title: "销售提成单", dataIndex: "salesLogs" },
              { title: "师傅提成单", dataIndex: "workerCommissions" },
              { title: "销售提成", dataIndex: "salesCommission" },
              { title: "师傅提成", dataIndex: "workerCommission" },
              { title: "调整", dataIndex: "workerAdjustment" },
              { title: "提成合计", dataIndex: "totalCommission" }
            ]}
          />
        </div>

        <div className="mt-6">
          <ReportSectionHeader title="库存趋势" description="按月查看库存流水、入库、出库、锁定、释放和调整数量" />
          <Table<InventoryTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={inventoryTrendRows}
            pagination={false}
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

        <div className="mt-6">
          <ReportSectionHeader title="发票趋势" description="按月查看发票申请、开具、作废、重开、金额和开票率" />
          <Table<InvoiceTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={invoiceTrendRows}
            pagination={false}
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

        <div className="mt-6">
          <ReportSectionHeader title="返利趋势" description="按月查看返利申请、审批、发放、驳回、金额和发放率" />
          <Table<RebateTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={rebateTrendRows}
            pagination={false}
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

        <div className="mt-6">
          <ReportSectionHeader title="财务趋势" description="按月查看收款、费用、报销、返利和净现金流" />
          <Table<FinanceTrendDisplayRow>
            rowKey="month"
            loading={summaryQuery.isLoading}
            dataSource={financeTrendRows}
            pagination={false}
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
      </Layout.Content>
    </Layout>
  );
}
