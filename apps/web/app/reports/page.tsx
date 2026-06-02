"use client";

import type { ReportSummary } from "@mallbay/shared";
import { Layout, Statistic, Table, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type ReportRow = {
  key: keyof ReportSummary;
  label: string;
  value: number;
};

export default function ReportsPage() {
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const summaryQuery = useQuery({
    queryKey: ["reports-summary", storeId],
    queryFn: () => reportsApi.summary(storeId!),
    enabled: Boolean(storeId)
  });
  const summary = summaryQuery.data;
  const rows: ReportRow[] = [
    { key: "orders", label: "订单数", value: summary?.orders ?? 0 },
    { key: "totalAmountCents", label: "订单总额分", value: summary?.totalAmountCents ?? 0 },
    { key: "paidAmountCents", label: "已收款分", value: summary?.paidAmountCents ?? 0 },
    { key: "constructionRecords", label: "施工记录", value: summary?.constructionRecords ?? 0 },
    { key: "afterSales", label: "售后单", value: summary?.afterSales ?? 0 },
    { key: "invoices", label: "发票", value: summary?.invoices ?? 0 },
    { key: "rebates", label: "返利", value: summary?.rebates ?? 0 }
  ];

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4">
          <Typography.Title level={3} className="!mb-1">经营报表</Typography.Title>
          <Typography.Text type="secondary">销售、收款、施工、售后、发票和返利的门店经营汇总</Typography.Text>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-4">
          {rows.slice(0, 4).map((row) => (
            <div key={row.key} className="rounded border border-slate-200 bg-white p-4">
              <Statistic title={row.label} value={row.value} loading={summaryQuery.isLoading} />
            </div>
          ))}
        </div>

        <Table<ReportRow>
          rowKey="key"
          loading={summaryQuery.isLoading}
          dataSource={rows}
          pagination={false}
          columns={[
            { title: "指标", dataIndex: "label" },
            { title: "数值", dataIndex: "value" }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
