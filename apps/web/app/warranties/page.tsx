"use client";

import type { OrderStatus, WarrantyStatus, WarrantySummary } from "@mallbay/shared";
import { App, Button, Card, Input, Select, Table, Tag } from "antd";
import {
  DownloadOutlined,
  FileProtectOutlined,
  PrinterOutlined,
  SearchOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { orderApi, warrantiesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  getWarrantyExpiryReminder,
  getWarrantyOrderLabel,
  getWarrantyStatusLabel
} from "../../src/features/warranties/display";
import { exportRowsToExcel } from "../../src/lib/export-excel";

type OrderWorkRow = {
  id: string;
  orderNo?: string | null;
  status?: OrderStatus | null;
  constructionRecord?: { qualityResult?: string | null } | null;
  appointmentDate?: string | null;
  appointmentTimeSlot?: string | null;
  customer?: {
    name?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
    personalName?: string | null;
  } | null;
  vehicle?: {
    carPlate?: string | null;
    carModel?: string | null;
    carColor?: string | null;
    plateNo?: string | null;
    model?: string | null;
    color?: string | null;
  } | null;
};

type WarrantyStatusFilter = "ALL" | WarrantyStatus | "PENDING_ACTIVATION";

const WARRANTY_STATUS_OPTIONS: Array<{ value: WarrantyStatusFilter; label: string }> = [
  { value: "ALL", label: "全部质保" },
  { value: "PENDING_ACTIVATION", label: "待生效" },
  { value: "ACTIVE", label: "生效中" },
  { value: "EXPIRED", label: "已过期" },
  { value: "VOIDED", label: "已作废" }
];

export default function WarrantiesPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [keyword, setKeyword] = useState("");
  const [warrantyStatusFilter, setWarrantyStatusFilter] = useState<WarrantyStatusFilter>("ALL");

  const warrantiesQuery = useQuery({
    queryKey: ["warranties", storeId],
    queryFn: () => warrantiesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const completedOrdersQuery = useQuery({
    queryKey: ["warranties", "completed-orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "IN_CONSTRUCTION", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });

  const warrantyRows = useMemo(() => (warrantiesQuery.data ?? []) as WarrantySummary[], [warrantiesQuery.data]);
  const warrantyByOrderId = useMemo(() => {
    const map = new Map<string, WarrantySummary>();
    warrantyRows.forEach((warranty) => map.set(warranty.orderId, warranty));
    return map;
  }, [warrantyRows]);
  const completedOrderRows = useMemo(
    () => (completedOrdersQuery.data?.items ?? []).filter((order) => (order as OrderWorkRow).constructionRecord?.qualityResult === "PASS") as OrderWorkRow[],
    [completedOrdersQuery.data?.items]
  );
  const pendingDeliveryRows = useMemo(
    () => completedOrderRows.filter((order) => !warrantyByOrderId.has(order.id)),
    [completedOrderRows, warrantyByOrderId]
  );
  const filteredWarrantyRows = useMemo(() => {
    const trimmedKeyword = keyword.trim().toLowerCase();
    return warrantyRows.filter((row) => {
      if (warrantyStatusFilter !== "ALL" && row.status !== warrantyStatusFilter) return false;
      if (!trimmedKeyword) return true;

      const reminder = getWarrantyExpiryReminder(row);
      const text = [
        row.warrantyNo,
        row.scope,
        getWarrantyOrderLabel(row),
        getWarrantyStatusLabel(row.status),
        reminder.label
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(trimmedKeyword);
    });
  }, [keyword, warrantyRows, warrantyStatusFilter]);

  const activeWarranties = warrantyRows.filter((row) => row.status === "ACTIVE").length;
  const expiringWarranties = warrantyRows.filter((row) => getWarrantyExpiryReminder(row).color === "warning").length;
  const exportWarrantyRecords = async () => {
    if (filteredWarrantyRows.length === 0) {
      message.warning("当前筛选条件下没有可导出的质保记录");
      return;
    }
    try {
      await exportRowsToExcel(
        "warranty-records.xlsx",
        "质保记录",
        filteredWarrantyRows.map((row) => ({
          "质保编号": row.warrantyNo,
          "关联订单": getWarrantyOrderLabel(row),
          "质保范围": row.scope || "-",
          "开始日期": row.startDate,
          "结束日期": row.endDate,
          "质保状态": getWarrantyStatusLabel(row.status),
          "到期提醒": getWarrantyExpiryReminder(row).label,
          "售后记录数": row.afterSales?.length ?? 0
        })),
        { title: "电子质保记录", subtitle: `导出当前筛选结果（${filteredWarrantyRows.length} 条）` }
      );
      message.success("质保记录已导出");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "质保记录导出失败");
    }
  };

  return (
    <div className="management-page">
      <StorePageHeader
        title="质保管理"
        description="查看最终交付后形成的电子质保卡、到期状态和售后追溯；未交付工单请从订单履约页完成最终交付。"
      />

      <section className="warranty-command-bar">
        <div className="warranty-command-copy">
          <span>质保工作台</span>
          <strong>主列表展示已由最终交付形成的电子质保卡</strong>
        </div>
        <div className="warranty-command-actions">
          <Button icon={<PrinterOutlined />}>批量打印</Button>
          <Button icon={<DownloadOutlined />} onClick={() => void exportWarrantyRecords()}>导出记录</Button>
          <Button type="primary" icon={<SearchOutlined />} onClick={() => router.push("/orders")}>
            查看订单履约
          </Button>
        </div>
      </section>

      <div className="management-kpi-grid">
        {[
          ["质保卡总数", warrantyRows.length, "当前门店电子质保卡"],
          ["有效质保", activeWarranties, "可用于售后追溯"],
          ["即将到期", expiringWarranties, "30 天内需要提醒"],
          ["待最终交付", pendingDeliveryRows.length, "质检通过且待由最终交付形成质保"]
        ].map(([label, value, description]) => (
          <Card key={label} className="management-kpi-card">
            <div className="management-kpi-label">{label}</div>
            <div className="management-kpi-value">{value}</div>
            <div className="management-kpi-desc">{description}</div>
          </Card>
        ))}
      </div>

      <section className="warranty-filter-panel">
        <div className="warranty-filter-search">
          <span>质保搜索</span>
          <Input.Search
            prefix={<SearchOutlined />}
            placeholder="质保编号 / 订单号 / 客户 / 车牌 / 范围"
            allowClear
            onSearch={setKeyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <div className="warranty-filter-field">
          <span>质保状态</span>
          <Select value={warrantyStatusFilter} options={WARRANTY_STATUS_OPTIONS} onChange={setWarrantyStatusFilter} />
        </div>
      </section>

      <section className="warranty-workspace warranty-workspace-list">
        <div className="warranty-main-column">
          <Card
            className="warranty-record-list"
            title="质保卡列表"
            extra={<span className="warranty-table-count">{filteredWarrantyRows.length} 条</span>}
          >
            <div className="warranty-mobile-cards">
              {filteredWarrantyRows.length > 0 ? (
                filteredWarrantyRows.map((row) => (
                  <article key={row.id} className="warranty-mobile-card">
                    <div className="warranty-mobile-card-head">
                      <div className="min-w-0">
                        <strong>{row.warrantyNo}</strong>
                        <span>{getWarrantyOrderLabel(row)}</span>
                      </div>
                      {renderWarrantyStatus(row)}
                    </div>
                    <dl className="warranty-mobile-fields">
                      <div>
                        <dt>质保范围</dt>
                        <dd>{row.scope || "-"}</dd>
                      </div>
                      <div>
                        <dt>有效期</dt>
                        <dd>{formatWarrantyPeriod(row)}</dd>
                      </div>
                    </dl>
                    {renderWarrantyCardAction(row, router)}
                  </article>
                ))
              ) : (
                <div className="warranty-mobile-empty">暂无电子质保卡</div>
              )}
            </div>
            <Table<WarrantySummary>
              className="warranty-desktop-table"
              rowKey="id"
              loading={warrantiesQuery.isLoading}
              dataSource={filteredWarrantyRows}
              pagination={{ pageSize: 8 }}
              scroll={{ x: 980 }}
              columns={[
                { title: "质保编号", width: 170, render: (_, row) => row.warrantyNo },
                { title: "关联订单", width: 280, render: (_, row) => getWarrantyOrderLabel(row) },
                { title: "质保范围", width: 220, render: (_, row) => row.scope || "-" },
                { title: "有效期", width: 210, render: (_, row) => formatWarrantyPeriod(row) },
                { title: "质保状态", width: 150, render: (_, row) => renderWarrantyStatus(row) },
                {
                  title: "操作",
                  width: 150,
                  render: (_, row) => renderWarrantyCardAction(row, router)
                }
              ]}
            />
          </Card>
        </div>

        <aside className="warranty-side-column warranty-support-grid">
          <Card
            className="warranty-preview-panel"
            title="待最终交付工单"
            extra={<span className="warranty-table-count">{pendingDeliveryRows.length} 条</span>}
          >
            {pendingDeliveryRows.length > 0 ? (
              <div className="warranty-pending-list">
                {pendingDeliveryRows.map((row) => renderPendingWarrantyOrder(row, router))}
              </div>
            ) : (
              <div className="warranty-mobile-empty">暂无待最终交付的质检通过工单</div>
            )}
          </Card>
          <Card className="warranty-preview-panel" title="电子质保说明">
            <div className="warranty-guide-grid warranty-guide-grid-side">
              <article className="warranty-launch-card">
                <span><SafetyCertificateOutlined /></span>
                <div>
                  <h3>形成条件</h3>
                  <p>质保只在最终交付事务中形成或激活，质检通过不提供独立生成入口。</p>
                </div>
              </article>
              <article className="warranty-audit-guide">
                <span><FileProtectOutlined /></span>
                <div>
                  <h3>查看条件</h3>
                  <p>已存在质保记录后，可从主列表查看电子质保卡和售后追溯。</p>
                </div>
              </article>
            </div>
          </Card>
        </aside>
      </section>
    </div>
  );
}

function renderWarrantyCardAction(row: WarrantySummary, router: ReturnType<typeof useRouter>) {
  return (
    <Button size="small" onClick={() => router.push(`/warranties/${row.id}`)}>
      查看电子质保
    </Button>
  );
}

function renderPendingWarrantyOrder(row: OrderWorkRow, router: ReturnType<typeof useRouter>) {
  return (
    <article key={row.id} className="warranty-mobile-card warranty-pending-card">
      <div className="warranty-mobile-card-head">
        <div className="min-w-0">
          <strong>{row.orderNo ?? "未编号订单"}</strong>
          <span>{getOrderCustomerName(row)} / {getOrderVehicleLabel(row)}</span>
        </div>
        <Tag color="processing">待最终交付</Tag>
      </div>
      <dl className="warranty-mobile-fields">
        <div>
          <dt>预约</dt>
          <dd>{formatAppointment(row)}</dd>
        </div>
        <div>
          <dt>状态</dt>
          <dd>{getOrderStatusLabel(row.status)}</dd>
        </div>
      </dl>
      <Button size="small" type="primary" onClick={() => router.push(`/orders/${row.id}`)}>
        前往订单详情
      </Button>
    </article>
  );
}

function renderWarrantyStatus(row: WarrantySummary) {
  const reminder = getWarrantyExpiryReminder(row);
  return (
    <div className="warranty-status-stack">
      <Tag color={reminder.color}>{getWarrantyStatusLabel(row.status)}</Tag>
      <span>{reminder.label}</span>
    </div>
  );
}

function getOrderCustomerName(row: OrderWorkRow) {
  return row.customer?.companyName ?? row.customer?.personalName ?? row.customer?.name ?? row.customer?.contactPerson ?? "未登记客户";
}

function getOrderVehicleLabel(row: OrderWorkRow) {
  const plate = row.vehicle?.carPlate ?? row.vehicle?.plateNo;
  const model = row.vehicle?.carModel ?? row.vehicle?.model;
  const color = row.vehicle?.carColor ?? row.vehicle?.color;
  return [plate, model, color].filter(Boolean).join(" / ") || "车辆未登记";
}

function getOrderStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    PENDING_DISPATCH: "待派单",
    DISPATCHED: "已派工",
    IN_CONSTRUCTION: "施工中",
    COMPLETED: "已完工",
    WARRANTIED: "已质保",
    CANCELLED: "已取消"
  };
  return status ? labels[status] ?? status : "-";
}

function formatAppointment(row: OrderWorkRow) {
  const date = formatWarrantyDate(row.appointmentDate);
  return [date, row.appointmentTimeSlot].filter(Boolean).join(" ") || "-";
}

function formatWarrantyPeriod(row: Pick<WarrantySummary, "startDate" | "endDate">) {
  return `${formatWarrantyDate(row.startDate) || "-"} 至 ${formatWarrantyDate(row.endDate) || "-"}`;
}

function formatWarrantyDate(value?: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "质保日期待确认";
}
