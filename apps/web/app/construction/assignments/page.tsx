"use client";

import { App, Button, Card, Select, Tag } from "antd";
import { CarOutlined, CheckCircleOutlined, SendOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { constructionApi, orderApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { getConstructionStatusLabel, getConstructionWorkerLabel } from "../../../src/features/construction/display";
import {
  getConstructionLocationLabel,
  getConstructionTypeLabel,
  yuanCurrency
} from "../../../src/features/orders/order-display";

type OrderRow = {
  id: string;
  orderNo: string;
  status: string;
  appointmentDate?: string | null;
  appointmentTimeSlot?: string | null;
  constructionLocation?: string | null;
  constructionType?: string | null;
  laborCostCents?: number | null;
  note?: string | null;
  outsideAddress?: string | null;
  totalAmountCents?: number | null;
  customer?: { name?: string | null; companyName?: string | null };
  items?: { id?: string; product?: { brand?: string | null; name?: string | null; model?: string | null } | null; quantity?: number }[];
  vehicle?: { plateNo?: string | null; brand?: string | null; model?: string | null; color?: string | null } | null;
};

type WorkerRow = {
  userId: string;
  skillTags?: string[];
  isActive: boolean;
  user?: { username?: string | null; nickname?: string | null } | null;
};

type ConstructionRecordRow = {
  id: string;
  orderId: string;
  status: string;
  order?: { orderNo: string };
  assignments?: { workerUserId: string }[];
};

export default function ConstructionAssignmentsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [selectedWorkerUserIds, setSelectedWorkerUserIds] = useState<string[]>([]);

  const pendingOrdersQuery = useQuery({
    queryKey: ["orders", storeId, "PENDING_DISPATCH"],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "PENDING_DISPATCH", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });

  const recordsQuery = useQuery({
    queryKey: ["construction-assignments", storeId],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const workersQuery = useQuery({
    queryKey: ["construction-workers", storeId],
    queryFn: () => constructionApi.workers(storeId!),
    enabled: Boolean(storeId)
  });

  const assignMutation = useMutation({
    mutationFn: () => constructionApi.assignOrder(selectedOrder!.id, { workerUserIds: selectedWorkerUserIds }),
    onSuccess: async () => {
      message.success("派工已保存");
      setSelectedOrderId(undefined);
      setSelectedWorkerUserIds([]);
      await queryClient.invalidateQueries({ queryKey: ["orders", storeId, "PENDING_DISPATCH"] });
      await queryClient.invalidateQueries({ queryKey: ["construction-assignments", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const pendingRows = useMemo(() => ((pendingOrdersQuery.data?.items ?? []) as OrderRow[]), [pendingOrdersQuery.data?.items]);
  const records = (recordsQuery.data ?? []) as ConstructionRecordRow[];
  const workers = ((workersQuery.data ?? []) as WorkerRow[]).filter((worker) => worker.isActive);
  const workerMap = new Map(workers.map((worker) => [worker.userId, worker]));
  const selectedOrder = pendingRows.find((row) => row.id === selectedOrderId) ?? pendingRows[0];

  useEffect(() => {
    if (!selectedOrderId && pendingRows[0]) {
      setSelectedOrderId(pendingRows[0].id);
    }
  }, [pendingRows, selectedOrderId]);

  return (
    <div className="management-page dispatch-page">
      <section className="dispatch-canvas dispatch-board-shell">
        <Card className="dispatch-order-list dispatch-board-rail" title={`待派单队列 (${pendingRows.length})`}>
          <div className="dispatch-filter-row">
            <Select
              allowClear
              placeholder="全部施工类型"
              options={[
                { value: "PPF", label: "漆面保护膜" },
                { value: "COLOR_FILM", label: "改色膜" },
                { value: "HEAT_FILM", label: "隔热膜" }
              ]}
            />
            <div className="dispatch-segment">
              <button type="button">今天预约</button>
              <button type="button">明日及以后</button>
            </div>
          </div>

          {pendingOrdersQuery.isLoading ? (
            <div className="operation-empty">待派单订单加载中...</div>
          ) : pendingRows.length > 0 ? (
            <div className="operation-queue-list">
              {pendingRows.map((row) => {
                const active = row.id === selectedOrder?.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`dispatch-order-card ${active ? "dispatch-order-card-active" : ""}`}
                    onClick={() => {
                      setSelectedOrderId(row.id);
                      setSelectedWorkerUserIds([]);
                    }}
                  >
                    <div className="dispatch-order-card-head">
                      <span>{row.orderNo}</span>
                      <Tag color={row.constructionLocation === "OUTSIDE" ? "warning" : "processing"}>
                        {getConstructionLocationLabel(row.constructionLocation)}
                      </Tag>
                    </div>
                    <strong>{getOrderVehicleLabel(row)}</strong>
                    <div className="dispatch-order-tags">
                      <Tag>{getConstructionTypeLabel(row.constructionType)}</Tag>
                      <Tag>{row.appointmentTimeSlot ?? "待定时段"}</Tag>
                    </div>
                    <div className="dispatch-order-meta">
                      <span>{getOrderCustomerLabel(row)}</span>
                      <span>{row.appointmentDate?.slice(0, 10) ?? "未预约"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="operation-empty">暂无待派单订单</div>
          )}
        </Card>

        <div className="dispatch-main-column dispatch-board-center">
          <Card className="dispatch-order-detail">
            <div className="dispatch-detail-head">
              <div className="dispatch-detail-title">
                <span className="dispatch-detail-icon">
                  <CarOutlined />
                </span>
                <div>
                  <h2>{selectedOrder ? getOrderVehicleLabel(selectedOrder) : "请选择待派单订单"}</h2>
                  <p>
                    车牌/车型：{selectedOrder ? getOrderVehicleLabel(selectedOrder) : "-"} · 客户：
                    {selectedOrder ? getOrderCustomerLabel(selectedOrder) : "-"}
                  </p>
                </div>
              </div>
              <div className="dispatch-detail-number">
                <strong>{selectedOrder?.orderNo ?? "未选择订单"}</strong>
                <span>预约 {selectedOrder?.appointmentDate?.slice(0, 10) ?? "-"} {selectedOrder?.appointmentTimeSlot ?? ""}</span>
              </div>
            </div>

            <div className="dispatch-info-grid">
              <div className="dispatch-info-panel">
                <h3>订单施工信息</h3>
                <div className="dispatch-info-row">
                  <span>施工类型</span>
                  <strong>{getConstructionTypeLabel(selectedOrder?.constructionType)}</strong>
                </div>
                <div className="dispatch-info-row">
                  <span>施工地点</span>
                  <strong>{getConstructionLocationLabel(selectedOrder?.constructionLocation)}</strong>
                </div>
                <div className="dispatch-info-row">
                  <span>产品明细</span>
                  <strong>{getOrderItemsSummary(selectedOrder)}</strong>
                </div>
              </div>

              <div className="dispatch-info-panel dispatch-location-panel">
                <h3>外出施工信息</h3>
                <p>{selectedOrder?.outsideAddress || "到店施工或未填写外出地址"}</p>
                <Button size="small" onClick={() => router.push(selectedOrder ? `/orders/${selectedOrder.id}` : "/orders")}>
                  查看订单详情
                </Button>
              </div>
            </div>

            <div className="dispatch-note-panel">
              <h3>销售备注</h3>
              <p>{selectedOrder?.note || "暂无销售备注。派单前可结合客户历史和施工复杂度安排主贴与副手。"}</p>
            </div>

            <div className="dispatch-fee-panel dispatch-cost-card">
              <div>
                <span>施工费</span>
                <strong>{yuanCurrency(selectedOrder?.laborCostCents)}</strong>
              </div>
              <div>
                <span>订单总额</span>
                <strong>{yuanCurrency(selectedOrder?.totalAmountCents)}</strong>
              </div>
            </div>
          </Card>

          <Card className="dispatch-action-bar">
            <div>
              <span>已选择</span>
              <strong>
                {selectedWorkerUserIds.length
                  ? selectedWorkerUserIds.map((id) => getConstructionWorkerLabel(workerMap.get(id) ?? id)).join("、")
                  : "尚未选择施工人员"}
              </strong>
              <p>最多选择 3 位施工人员，建议至少 1 位主贴师傅。</p>
            </div>
            <div className="dispatch-action-controls">
              <Select
                mode="multiple"
                maxCount={3}
                value={selectedWorkerUserIds}
                onChange={setSelectedWorkerUserIds}
                placeholder="选择施工人员"
                options={workers.map((worker) => ({
                  value: worker.userId,
                  label: getConstructionWorkerLabel(worker)
                }))}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                loading={assignMutation.isPending}
                disabled={!selectedOrder || selectedWorkerUserIds.length === 0}
                onClick={() => assignMutation.mutate()}
              >
                确认派单
              </Button>
            </div>
          </Card>

        </div>

        <aside className="dispatch-board-aside">
          <Card className="dispatch-worker-panel" title="推荐施工组合">
            <div className="dispatch-skill-filter">
              <span>技能筛选</span>
              <div>
                {["可外出", "仅店内", "擅长漆面保护膜", "擅长改色膜"].map((label) => (
                  <Tag key={label} color={label === "可外出" || label === "擅长漆面保护膜" ? "processing" : undefined}>
                    {label}
                  </Tag>
                ))}
              </div>
            </div>

            <div className="dispatch-worker-list">
              {workers.length ? (
                workers.map((worker, index) => {
                  const selected = selectedWorkerUserIds.includes(worker.userId);
                  return (
                    <button
                      key={worker.userId}
                      type="button"
                      className={`dispatch-worker-card ${selected ? "dispatch-worker-card-selected" : ""}`}
                      onClick={() => {
                        setSelectedWorkerUserIds((current) => {
                          if (current.includes(worker.userId)) return current.filter((id) => id !== worker.userId);
                          if (current.length >= 3) return current;
                          return [...current, worker.userId];
                        });
                      }}
                    >
                      <div className="dispatch-worker-avatar">{getWorkerAvatarText(worker, index)}</div>
                      <div>
                        <strong>{getConstructionWorkerLabel(worker)}</strong>
                        <span>{worker.skillTags?.join(" / ") || "施工能力待维护"}</span>
                      </div>
                      {selected ? <CheckCircleOutlined className="dispatch-worker-check" /> : null}
                    </button>
                  );
                })
              ) : (
                <div className="operation-empty">暂无可用施工人员</div>
              )}
            </div>
          </Card>

          <Card className="dispatch-progress-card" title="施工履约进度">
            {recordsQuery.isLoading ? (
              <div className="operation-empty">施工进度加载中...</div>
            ) : records.length ? (
              <div className="dispatch-progress-list">
                {records.slice(0, 6).map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    className="dispatch-progress-item"
                    onClick={() => router.push(`/construction/orders/${record.orderId}`)}
                  >
                    <span>{record.order?.orderNo ?? "订单未加载"}</span>
                    <Tag>{getConstructionStatusLabel(record.status)}</Tag>
                    <small>
                      {record.assignments
                        ?.map((item) => getConstructionWorkerLabel(workerMap.get(item.workerUserId) ?? item.workerUserId))
                        .join("、") ?? "未记录人员"}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="operation-empty">暂无施工履约记录</div>
            )}
          </Card>
        </aside>
      </section>
    </div>
  );
}

function getOrderCustomerLabel(order?: OrderRow) {
  if (!order) return "-";
  return order.customer?.companyName ?? order.customer?.name ?? "未登记客户";
}

function getOrderVehicleLabel(order?: OrderRow) {
  if (!order?.vehicle) return "车辆未登记";
  return [order.vehicle.plateNo, [order.vehicle.brand, order.vehicle.model].filter(Boolean).join(" "), order.vehicle.color]
    .filter(Boolean)
    .join(" / ");
}

function getOrderItemsSummary(order?: OrderRow) {
  if (!order?.items?.length) return "产品明细未加载";
  return order.items
    .map((item) => {
      const product = item.product;
      const productLabel = [product?.brand, product?.name, product?.model].filter(Boolean).join(" / ") || "产品未加载";
      return `${productLabel} x ${item.quantity ?? 1}`;
    })
    .join("、");
}

function getWorkerAvatarText(worker: WorkerRow, index: number) {
  return worker.user?.nickname?.slice(0, 1) ?? worker.user?.username?.slice(0, 1)?.toUpperCase() ?? String(index + 1);
}
