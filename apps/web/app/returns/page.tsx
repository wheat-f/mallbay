"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag
} from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import {
  approvePurchaseReturn,
  approveSalesReturn,
  cancelPurchaseReturn,
  cancelSalesReturn,
  getPurchaseReturn,
  getSalesReturn,
  listPurchaseReturns,
  listSalesReturns,
  outboundPurchaseReturn,
  receiveSalesReturn,
  refundSalesReturn,
  settlePurchaseReturn,
  submitPurchaseReturn,
  submitSalesReturn,
  type ReturnDetailResponse,
  type ReturnListItem
} from "@/features/returns/api";
import { PurchaseModuleNav } from "@/features/purchases/purchase-module-nav";
import { StorePageHeader } from "@/features/workbench/store-page-header";
import { useCurrentStoreContext } from "@/features/workbench/store-context";

type Kind = "sales" | "purchase";

const RETURN_STATUS_META: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "草稿", color: "default" },
  SUBMITTED: { label: "待审核", color: "processing" },
  WAITING_RECEIPT: { label: "待收货", color: "warning" },
  PARTIAL_RECEIVED: { label: "部分收货", color: "processing" },
  WAITING_REFUND: { label: "待退款", color: "warning" },
  PARTIAL_REFUND: { label: "部分退款", color: "processing" },
  WAITING_OUTBOUND: { label: "待出库", color: "warning" },
  PARTIAL_OUTBOUND: { label: "部分出库", color: "processing" },
  WAITING_SETTLEMENT: { label: "待结算", color: "warning" },
  PARTIAL_SETTLEMENT: { label: "部分结算", color: "processing" },
  COMPLETED: { label: "已完成", color: "success" },
  CANCELLED: { label: "已取消", color: "error" }
};

function getReturnStatusMeta(status: string) {
  return RETURN_STATUS_META[status] ?? { label: status, color: "default" };
}

export default function ReturnsPage() {
  const { message } = App.useApp();
  const { storeId } = useCurrentStoreContext();
  const [activeKind, setActiveKind] = useState<Kind>("sales");
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<{ kind: Kind; item: ReturnDetailResponse } | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string>();
  const [quantity, setQuantity] = useState<number>(1);
  const [amountYuan, setAmountYuan] = useState<number>(0);
  const [voucherId, setVoucherId] = useState("");
  const [reason, setReason] = useState("");
  const [targetStatus, setTargetStatus] = useState<"AVAILABLE" | "INSPECTION" | "DAMAGED">("AVAILABLE");
  const [settlementMode, setSettlementMode] = useState<"SUPPLIER_REFUND" | "PAYABLE_OFFSET" | "EXCHANGE" | "MIXED">("PAYABLE_OFFSET");
  const [busy, setBusy] = useState(false);

  const returnsQuery = useQuery({
    queryKey: ["returns-list", storeId],
    queryFn: async () => {
      const [sales, purchases] = await Promise.all([
        listSalesReturns(storeId!),
        listPurchaseReturns(storeId!)
      ]);
      return { sales, purchases };
    },
    enabled: Boolean(storeId)
  });

  const sales = useMemo(() => returnsQuery.data?.sales ?? [], [returnsQuery.data?.sales]);
  const purchases = useMemo(() => returnsQuery.data?.purchases ?? [], [returnsQuery.data?.purchases]);

  const filterRows = (rows: ReturnListItem[]) => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      const matchKeyword = !q || row.returnNo.toLowerCase().includes(q) || (row.reason ?? "").toLowerCase().includes(q);
      const matchStatus = statusFilter === "ALL" || row.status === statusFilter;
      return matchKeyword && matchStatus;
    });
  };

  const filteredSales = useMemo(() => filterRows(sales), [keyword, sales, statusFilter]);
  const filteredPurchases = useMemo(() => filterRows(purchases), [keyword, purchases, statusFilter]);

  async function refreshDetail(kind: Kind, id: string) {
    try {
      const detail = kind === "sales" ? await getSalesReturn(id) : await getPurchaseReturn(id);
      setSelected({ kind, item: detail });
      setSelectedDetailId(detail.details?.[0]?.id);
      setQuantity(1);
      setAmountYuan(0);
      setVoucherId("");
      setReason("");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "退货单详情加载失败");
    }
  }

  async function runAction(action: () => Promise<unknown>, successText: string, reloadDetail?: { kind: Kind; id: string }) {
    setBusy(true);
    try {
      await action();
      message.success(successText);
      await returnsQuery.refetch();
      if (reloadDetail) {
        await refreshDetail(reloadDetail.kind, reloadDetail.id);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : "退货操作失败");
    } finally {
      setBusy(false);
    }
  }

  const buildColumns = (kind: Kind) => [
    {
      title: "退货单号",
      dataIndex: "returnNo",
      width: 180,
      render: (value: string) => <span className="font-mono font-semibold text-[var(--mb-primary)]">{value}</span>
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 120,
      render: (status: string) => {
        const meta = getReturnStatusMeta(status);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      }
    },
    {
      title: "退货原因",
      dataIndex: "reason",
      render: (value: string) => value || "-"
    },
    {
      title: "创建时间",
      dataIndex: "createdAt",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString("zh-CN")
    },
    {
      title: "操作",
      key: "actions",
      width: 240,
      render: (_: unknown, item: ReturnListItem) => (
        <Space wrap size="small">
          <Button size="small" onClick={() => void refreshDetail(kind, item.id)}>
            处理 / 详情
          </Button>
          {item.status === "DRAFT" ? (
            <Button
              size="small"
              type="primary"
              loading={busy}
              onClick={() =>
                void runAction(
                  () => (kind === "sales" ? submitSalesReturn(item.id) : submitPurchaseReturn(item.id)),
                  "退货单已提交"
                )
              }
            >
              提交
            </Button>
          ) : null}
          {item.status === "SUBMITTED" ? (
            <Button
              size="small"
              type="primary"
              loading={busy}
              onClick={() =>
                void runAction(
                  () => (kind === "sales" ? approveSalesReturn(item.id) : approvePurchaseReturn(item.id, "BUSINESS")),
                  "业务审核已通过"
                )
              }
            >
              业务审核
            </Button>
          ) : null}
          {item.status === "SUBMITTED" && kind === "purchase" ? (
            <Button
              size="small"
              loading={busy}
              onClick={() => void runAction(() => approvePurchaseReturn(item.id, "FINANCIAL"), "财务审核已通过")}
            >
              财务审核
            </Button>
          ) : null}
        </Space>
      )
    }
  ];

  const activeDetailItem = selected
    ? selected.item.details.find((item) => item.id === selectedDetailId) ?? selected.item.details[0]
    : undefined;

  const canReceive =
    selected?.kind === "sales" &&
    ["WAITING_RECEIPT", "PARTIAL_RECEIVED"].includes(selected.item.status) &&
    Boolean(activeDetailItem);
  const canRefund = selected?.kind === "sales" && ["WAITING_REFUND", "PARTIAL_REFUND"].includes(selected.item.status);
  const canOutbound =
    selected?.kind === "purchase" &&
    ["WAITING_OUTBOUND", "PARTIAL_OUTBOUND"].includes(selected.item.status) &&
    Boolean(activeDetailItem);
  const canSettle =
    selected?.kind === "purchase" && ["WAITING_SETTLEMENT", "PARTIAL_SETTLEMENT"].includes(selected.item.status);
  const canCancel =
    Boolean(selected) &&
    ["DRAFT", "SUBMITTED", "PARTIAL_RECEIVED", "PARTIAL_REFUND", "PARTIAL_OUTBOUND", "PARTIAL_SETTLEMENT"].includes(
      selected!.item.status
    );

  return (
    <div className="management-page">
      <StorePageHeader title="退货处理" description="按状态机处理门店销售退货、采购退货、出入库与财务结算。">
        <Button icon={<ReloadOutlined />} loading={returnsQuery.isFetching} onClick={() => void returnsQuery.refetch()}>
          刷新列表
        </Button>
      </StorePageHeader>

      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="returns" />

        <div className="purchase-module-content">
          {!storeId ? (
            <Card>
              <Empty description="当前账号未加入门店，无法查看退货单" />
            </Card>
          ) : (
            <>
              <section className="management-kpi-grid">
                {[
                  ["销售退货单", sales.length, "全部销售退货申请"],
                  ["销售待处理", sales.filter((row) => row.status !== "COMPLETED" && row.status !== "CANCELLED").length, "待审核、收货或退款"],
                  ["采购退货单", purchases.length, "全部采购退货单"],
                  ["采购待处理", purchases.filter((row) => row.status !== "COMPLETED" && row.status !== "CANCELLED").length, "待审核、出库或结算"]
                ].map(([label, value, desc]) => (
                  <Card key={label} className="management-kpi-card">
                    <div className="management-kpi-label">{label}</div>
                    <div className="management-kpi-value">{value}</div>
                    <div className="management-kpi-desc">{desc}</div>
                  </Card>
                ))}
              </section>

              <Card className="management-filter-card">
                <Space wrap>
                  <Input.Search
                    allowClear
                    placeholder="搜索退货单号或原因"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    style={{ width: 260 }}
                  />
                  <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    style={{ width: 160 }}
                    options={[
                      { value: "ALL", label: "全部状态" },
                      ...Object.entries(RETURN_STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))
                    ]}
                  />
                  <Button
                    onClick={() => {
                      setKeyword("");
                      setStatusFilter("ALL");
                    }}
                  >
                    重置
                  </Button>
                </Space>
              </Card>

              {returnsQuery.isError ? (
                <Alert
                  type="error"
                  showIcon
                  title="退货列表加载失败"
                  description={returnsQuery.error instanceof Error ? returnsQuery.error.message : "请稍后重试"}
                />
              ) : null}

              <Card>
                <Tabs
                  activeKey={activeKind}
                  onChange={(key) => setActiveKind(key as Kind)}
                  items={[
                    {
                      key: "sales",
                      label: `销售退货单 (${filteredSales.length})`,
                      children: (
                        <Table<ReturnListItem>
                          rowKey="id"
                          loading={returnsQuery.isLoading}
                          dataSource={filteredSales}
                          scroll={{ x: 820 }}
                          pagination={{ pageSize: 10 }}
                          locale={{ emptyText: <Empty description="暂无销售退货单" /> }}
                          columns={buildColumns("sales")}
                        />
                      )
                    },
                    {
                      key: "purchase",
                      label: `采购退货单 (${filteredPurchases.length})`,
                      children: (
                        <Table<ReturnListItem>
                          rowKey="id"
                          loading={returnsQuery.isLoading}
                          dataSource={filteredPurchases}
                          scroll={{ x: 820 }}
                          pagination={{ pageSize: 10 }}
                          locale={{ emptyText: <Empty description="暂无采购退货单" /> }}
                          columns={buildColumns("purchase")}
                        />
                      )
                    }
                  ]}
                />
              </Card>
            </>
          )}
        </div>
      </div>

      <Drawer
        open={Boolean(selected)}
        title={selected ? `${selected.kind === "sales" ? "销售退货单" : "采购退货单"} · ${selected.item.returnNo}` : "退货单详情"}
        size="large"
        onClose={() => setSelected(null)}
        destroyOnHidden
      >
        {selected ? (
          <Space orientation="vertical" size="large" className="w-full">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="单号">{selected.item.returnNo}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={getReturnStatusMeta(selected.item.status).color}>{getReturnStatusMeta(selected.item.status).label}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="原因">{selected.item.reason || "-"}</Descriptions.Item>
              <Descriptions.Item label="明细数">{selected.item.details.length} 项</Descriptions.Item>
            </Descriptions>

            {selected.item.details.length > 0 ? (
              <Card size="small" title="选择处理明细">
                <Select
                  className="w-full"
                  value={activeDetailItem?.id}
                  onChange={setSelectedDetailId}
                  options={selected.item.details.map((detail, index) => ({
                    value: detail.id,
                    label: `明细 #${index + 1} · 申请 ${detail.quantity} · 已收 ${detail.receivedQuantity ?? 0} · 已出 ${detail.outboundQuantity ?? 0}`
                  }))}
                />
              </Card>
            ) : null}

            {canReceive ? (
              <Card size="small" title="退货验收入库">
                <Space wrap className="w-full">
                  <InputNumber min={1} value={quantity} onChange={(val) => setQuantity(Number(val ?? 1))} addonBefore="数量" />
                  <Select
                    value={targetStatus}
                    onChange={setTargetStatus}
                    style={{ width: 130 }}
                    options={[
                      { value: "AVAILABLE", label: "可售入库" },
                      { value: "INSPECTION", label: "待检" },
                      { value: "DAMAGED", label: "报损" }
                    ]}
                  />
                  <Button
                    type="primary"
                    loading={busy}
                    onClick={() =>
                      void runAction(
                        () =>
                          receiveSalesReturn(selected.item.id, {
                            detailId: activeDetailItem!.id,
                            quantity,
                            targetStatus
                          }),
                        "销售退货收货已确认",
                        { kind: selected.kind, id: selected.item.id }
                      )
                    }
                  >
                    确认收货
                  </Button>
                </Space>
              </Card>
            ) : null}

            {canRefund ? (
              <Card size="small" title="登记客户退款">
                <Space orientation="vertical" className="w-full">
                  <Space wrap>
                    <InputNumber
                      min={0}
                      precision={2}
                      prefix="¥"
                      value={amountYuan}
                      onChange={(val) => setAmountYuan(Number(val ?? 0))}
                      placeholder="退款金额（元）"
                    />
                    <Input
                      value={voucherId}
                      onChange={(event) => setVoucherId(event.target.value)}
                      placeholder="线下凭证号"
                      style={{ width: 220 }}
                    />
                  </Space>
                  <Button
                    type="primary"
                    loading={busy}
                    disabled={!voucherId.trim()}
                    onClick={() =>
                      void runAction(
                        () =>
                          refundSalesReturn(selected.item.id, {
                            actualRefundCents: Math.round(amountYuan * 100),
                            refundMethod: "OFFLINE",
                            voucherId: voucherId.trim()
                          }),
                        "客户退款已确认",
                        { kind: selected.kind, id: selected.item.id }
                      )
                    }
                  >
                    确认退款
                  </Button>
                </Space>
              </Card>
            ) : null}

            {canOutbound ? (
              <Card size="small" title="采购退货出库">
                <Space wrap>
                  <InputNumber min={1} value={quantity} onChange={(val) => setQuantity(Number(val ?? 1))} addonBefore="出库数量" />
                  <Button
                    type="primary"
                    loading={busy}
                    onClick={() =>
                      void runAction(
                        () => outboundPurchaseReturn(selected.item.id, { detailId: activeDetailItem!.id, quantity }),
                        "采购退货出库已确认",
                        { kind: selected.kind, id: selected.item.id }
                      )
                    }
                  >
                    确认出库
                  </Button>
                </Space>
              </Card>
            ) : null}

            {canSettle ? (
              <Card size="small" title="采购退货财务结算">
                <Space wrap className="w-full">
                  <Select
                    value={settlementMode}
                    onChange={setSettlementMode}
                    style={{ width: 150 }}
                    options={[
                      { value: "PAYABLE_OFFSET", label: "应付抵扣" },
                      { value: "SUPPLIER_REFUND", label: "供应商退款" },
                      { value: "MIXED", label: "混合" },
                      { value: "EXCHANGE", label: "换货" }
                    ]}
                  />
                  <InputNumber
                    min={0}
                    precision={2}
                    prefix="¥"
                    value={amountYuan}
                    onChange={(val) => setAmountYuan(Number(val ?? 0))}
                    placeholder="退款金额（元）"
                  />
                  <Button
                    type="primary"
                    loading={busy}
                    onClick={() =>
                      void runAction(
                        () =>
                          settlePurchaseReturn(selected.item.id, {
                            settlementMode,
                            refundAmountCents: Math.round(amountYuan * 100)
                          }),
                        "采购退货结算已完成",
                        { kind: selected.kind, id: selected.item.id }
                      )
                    }
                  >
                    确认结算
                  </Button>
                </Space>
              </Card>
            ) : null}

            {canCancel ? (
              <Card size="small" title="取消剩余退货">
                <Space wrap className="w-full">
                  <Input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="请填写取消原因"
                    style={{ width: 280 }}
                  />
                  <Popconfirm
                    title="确认取消剩余退货？"
                    okText="确认取消"
                    cancelText="返回"
                    disabled={!reason.trim()}
                    onConfirm={() =>
                      void runAction(
                        () =>
                          selected.kind === "sales"
                            ? cancelSalesReturn(selected.item.id, reason.trim())
                            : cancelPurchaseReturn(selected.item.id, reason.trim()),
                        "已取消剩余退货",
                        { kind: selected.kind, id: selected.item.id }
                      )
                    }
                  >
                    <Button danger disabled={busy || !reason.trim()}>
                      取消剩余
                    </Button>
                  </Popconfirm>
                </Space>
              </Card>
            ) : null}
          </Space>
        ) : null}
      </Drawer>
    </div>
  );
}
