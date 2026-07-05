"use client";

import { App, Button, Card, Drawer, Input, Select, Tag } from "antd";
import type { DefaultOptionType } from "antd/es/select";
import {
  CalendarOutlined,
  CarOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  ToolOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { constructionApi, orderApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import {
  getConstructionQualityResultLabel,
  getConstructionStatusLabel,
  getConstructionWorkerLabel
} from "../../../src/features/construction/display";
import {
  buildConstructionWorkItems,
  getConstructionWorkOrderCounts,
  getVisibleConstructionWorkItems,
  type ConstructionWorkItem,
  type ConstructionWorkOrderTab
} from "../../../src/features/construction/work-orders";
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
  vehicle?: {
    carPlate?: string | null;
    carModel?: string | null;
    carColor?: string | null;
    plateNo?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
  } | null;
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
  qualityResult?: string | null;
  qualityNote?: string | null;
  order?: OrderRow & { orderNo?: string | null };
  assignments?: { workerUserId: string }[];
  photos?: { id: string; stage: string; url: string; uploadedById: string }[];
};

type DispatchChecklist = {
  customerConfirmed: boolean;
  scheduleNotified: boolean;
};

type DispatchDraft = {
  checklist: DispatchChecklist;
  note: string;
  workerUserIds: string[];
};

const emptyDispatchChecklist: DispatchChecklist = {
  customerConfirmed: false,
  scheduleNotified: false
};

export default function ConstructionAssignmentsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [activeWorkOrderTab, setActiveWorkOrderTab] = useState<ConstructionWorkOrderTab>("pending");
  const [selectedWorkItemKey, setSelectedWorkItemKey] = useState<string>();
  const [selectedWorkerUserIds, setSelectedWorkerUserIds] = useState<string[]>([]);
  const [confirmDrawerOpen, setConfirmDrawerOpen] = useState(false);
  const [dispatchChecklist, setDispatchChecklist] = useState<DispatchChecklist>(emptyDispatchChecklist);
  const [dispatchNote, setDispatchNote] = useState("");
  const [workerSearchKeyword, setWorkerSearchKeyword] = useState("");

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

  const pendingRows = useMemo(() => ((pendingOrdersQuery.data?.items ?? []) as OrderRow[]), [pendingOrdersQuery.data?.items]);
  const records = useMemo(() => ((recordsQuery.data ?? []) as ConstructionRecordRow[]), [recordsQuery.data]);
  const workers = useMemo(
    () => ((workersQuery.data ?? []) as WorkerRow[]).filter((worker) => worker.isActive),
    [workersQuery.data]
  );
  const filteredWorkers = useMemo(() => filterConstructionWorkers(workers, workerSearchKeyword), [workers, workerSearchKeyword]);
  const workerMap = new Map(workers.map((worker) => [worker.userId, worker]));
  const workItems = useMemo(
    () => buildConstructionWorkItems({ pendingOrders: pendingRows, records }),
    [pendingRows, records]
  );
  const workOrderCounts = useMemo(() => getConstructionWorkOrderCounts(workItems), [workItems]);
  const visibleWorkItems = useMemo(
    () => getVisibleConstructionWorkItems(workItems, activeWorkOrderTab),
    [activeWorkOrderTab, workItems]
  );
  const selectedWorkItem =
    visibleWorkItems.find((item) => getWorkItemKey(item) === selectedWorkItemKey) ?? visibleWorkItems[0] ?? workItems[0];
  const selectedPendingOrder = selectedWorkItem?.kind === "pending" ? (selectedWorkItem.order as OrderRow) : undefined;
  const selectedConstructionRecord = selectedWorkItem?.kind === "record" ? (selectedWorkItem.record as ConstructionRecordRow) : undefined;
  const selectedPendingOrderId = selectedPendingOrder?.id;
  const selectedPendingOrderDetailQuery = useQuery({
    queryKey: ["order-detail", selectedPendingOrderId],
    queryFn: () => orderApi.detail(selectedPendingOrderId!),
    enabled: Boolean(selectedPendingOrderId)
  });
  const selectedPendingOrderDetail = selectedPendingOrderDetailQuery.data as OrderRow | undefined;
  const selectedOrder = selectedPendingOrderDetail ?? selectedPendingOrder ?? selectedConstructionRecord?.order;
  const selectedOrderDetailLoading = Boolean(selectedPendingOrderId) && selectedPendingOrderDetailQuery.isLoading;

  useEffect(() => {
    if (!selectedPendingOrderId) {
      setDispatchChecklist(emptyDispatchChecklist);
      setDispatchNote("");
      return;
    }
    const draft = loadDispatchDraft(selectedPendingOrderId);
    setDispatchChecklist(draft?.checklist ?? emptyDispatchChecklist);
    setDispatchNote(draft?.note ?? "");
    setSelectedWorkerUserIds(draft?.workerUserIds ?? []);
  }, [selectedPendingOrderId]);

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!selectedPendingOrder) {
        throw new Error("请先选择待派单订单");
      }
      return constructionApi.assignOrder(selectedPendingOrder.id, { workerUserIds: selectedWorkerUserIds });
    },
    onSuccess: async () => {
      if (selectedPendingOrderId) {
        clearDispatchDraft(selectedPendingOrderId);
      }
      message.success("派工已保存");
      setSelectedWorkItemKey(undefined);
      setSelectedWorkerUserIds([]);
      setDispatchChecklist(emptyDispatchChecklist);
      setDispatchNote("");
      setConfirmDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["orders", storeId, "PENDING_DISPATCH"] });
      await queryClient.invalidateQueries({ queryKey: ["construction-assignments", storeId] });
      await queryClient.invalidateQueries({ queryKey: ["order-detail", selectedPendingOrderId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const saveCurrentDispatchDraft = () => {
    if (!selectedPendingOrderId) {
      message.warning("请先选择待派单订单");
      return;
    }
    saveDispatchDraft(selectedPendingOrderId, {
      checklist: dispatchChecklist,
      note: dispatchNote,
      workerUserIds: selectedWorkerUserIds
    });
    message.info("已暂存本次派工草稿");
    setConfirmDrawerOpen(false);
  };

  return (
    <div className="management-page dispatch-page">
      <section className="dispatch-management-toolbar" aria-label="施工管理入口">
        <div className="dispatch-management-summary">
          {[
            { label: "待派单", value: workOrderCounts.pending },
            { label: "施工中", value: workOrderCounts.active },
            { label: "已完工", value: workOrderCounts.completed },
            { label: "施工工单", value: workOrderCounts.all }
          ].map((item) => (
            <article key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
        <div className="dispatch-management-toolbar-actions">
          <Button type="primary" icon={<SettingOutlined />} onClick={() => router.push("/construction/capacities")}>
            施工产能设置
          </Button>
          <Button icon={<CalendarOutlined />} onClick={() => router.push("/construction/schedules")}>
            施工排班
          </Button>
          <Button icon={<ToolOutlined />} onClick={() => router.push("/construction/tasks")}>
            施工工单
          </Button>
        </div>
      </section>
      <section className="dispatch-canvas dispatch-board-shell">
        <Card className="dispatch-order-list dispatch-board-rail" title={`施工工单 (${workOrderCounts.all})`}>
          <div className="dispatch-work-order-tabs" role="tablist" aria-label="施工工单状态">
            {[
              { key: "pending" as const, label: "待派单", count: workOrderCounts.pending },
              { key: "dispatched" as const, label: "已派工", count: workOrderCounts.dispatched },
              { key: "active" as const, label: "施工中", count: workOrderCounts.active },
              { key: "completed" as const, label: "已完工", count: workOrderCounts.completed },
              { key: "all" as const, label: "全部", count: workOrderCounts.all }
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeWorkOrderTab === tab.key ? "is-active" : undefined}
                onClick={() => {
                  setActiveWorkOrderTab(tab.key);
                  setSelectedWorkItemKey(undefined);
                  setSelectedWorkerUserIds([]);
                }}
              >
                {tab.label}
                <em>{tab.count}</em>
              </button>
            ))}
          </div>
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

          {pendingOrdersQuery.isLoading || recordsQuery.isLoading ? (
            <div className="operation-empty">施工工单加载中...</div>
          ) : visibleWorkItems.length > 0 ? (
            <div className="operation-queue-list">
              {visibleWorkItems.map((item) => {
                const row = getWorkItemOrder(item);
                const active = getWorkItemKey(item) === (selectedWorkItem ? getWorkItemKey(selectedWorkItem) : "");
                return (
                  <button
                    key={getWorkItemKey(item)}
                    type="button"
                    className={`dispatch-order-card ${active ? "dispatch-order-card-active" : ""}`}
                    onClick={() => {
                      setSelectedWorkItemKey(getWorkItemKey(item));
                      setSelectedWorkerUserIds([]);
                    }}
                  >
                    <div className="dispatch-order-card-head">
                      <span>{item.orderNo}</span>
                      <Tag color={getWorkItemStatusColor(item)}>{getWorkItemStatusLabel(item)}</Tag>
                    </div>
                    <strong>{getOrderVehicleLabel(row)}</strong>
                    <div className="dispatch-order-tags">
                      <Tag>{getConstructionTypeLabel(row.constructionType)}</Tag>
                      <Tag>{row.appointmentTimeSlot ?? "待定时段"}</Tag>
                    </div>
                    <div className="dispatch-order-meta">
                      <span>{getOrderCustomerLabel(row)}</span>
                      <span>{formatDispatchAppointmentDate(row.appointmentDate)}</span>
                    </div>
                    {item.kind === "record" ? (
                      <small className="dispatch-order-workers">
                        {formatAssignedWorkers(item.record as ConstructionRecordRow, workerMap)}
                      </small>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="operation-empty">暂无施工工单，待派单队列和施工履约记录会在这里统一呈现。</div>
          )}
        </Card>

        <div className="dispatch-main-column dispatch-board-center">
          {selectedConstructionRecord ? (
            <AssignedConstructionRecordPanel
              record={selectedConstructionRecord}
              workerMap={workerMap}
              onOpenDetail={() => router.push(`/construction/orders/${selectedConstructionRecord.orderId}`)}
            />
          ) : (
            <PendingDispatchPanel
              selectedOrder={selectedPendingOrder ? selectedOrder : undefined}
              onOpenOrder={() => router.push(selectedPendingOrder ? `/orders/${selectedPendingOrder.id}` : "/orders")}
              onOpenSchedule={() => router.push("/construction/schedules")}
            />
          )}

          {selectedWorkItem?.kind === "pending" ? (
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
                  showSearch
                  filterOption={filterWorkerOption}
                  options={filteredWorkers.map((worker) => ({
                    value: worker.userId,
                    label: getConstructionWorkerLabel(worker)
                  }))}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  loading={assignMutation.isPending}
                  disabled={!selectedPendingOrder || selectedWorkerUserIds.length === 0}
                  onClick={() => setConfirmDrawerOpen(true)}
                >
                  确认派单
                </Button>
              </div>
            </Card>
          ) : null}

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
            <Input
              allowClear
              className="dispatch-worker-search"
              prefix={<SearchOutlined />}
              value={workerSearchKeyword}
              onChange={(event) => setWorkerSearchKeyword(event.target.value)}
              placeholder="搜索施工人员姓名、账号或技能"
            />

            <div className="dispatch-worker-list">
              {filteredWorkers.length ? (
                filteredWorkers.map((worker, index) => {
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
                <div className="operation-empty">{workerSearchKeyword ? "未找到匹配施工人员" : "暂无可用施工人员"}</div>
              )}
            </div>
          </Card>

          <Card
            className="dispatch-progress-card"
            title="施工履约进度"
            extra={<Button size="small" onClick={() => setActiveWorkOrderTab("all")}>查看全部工单</Button>}
          >
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
                    <span>{record.order?.orderNo ?? "订单信息待确认"}</span>
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
      <Drawer
        className="dispatch-confirm-drawer"
        title={
          <div className="dispatch-confirm-drawer-title">
            <CheckCircleOutlined />
            <span>确认提交派工与库房匹配</span>
          </div>
        }
        width={480}
        open={confirmDrawerOpen}
        onClose={() => setConfirmDrawerOpen(false)}
        footer={
          <div className="dispatch-confirm-drawer-footer">
            <Button
              type="primary"
              icon={<SendOutlined />}
              block
              loading={assignMutation.isPending}
              disabled={!selectedPendingOrder || selectedWorkerUserIds.length === 0}
              onClick={() => assignMutation.mutate()}
            >
              确认提交，进入派工流转
            </Button>
            <Button
              block
              onClick={saveCurrentDispatchDraft}
            >
              暂存草稿
            </Button>
            <p>提交后订单将进入“库房备货”与“派工排期”阶段，请确保信息准确无误。</p>
          </div>
        }
      >
        <div className="dispatch-confirm-drawer-body">
          <section className="dispatch-confirm-section">
            <div className="dispatch-confirm-section-title">
              <i />
              <h3>订单概览</h3>
            </div>
            <div className="dispatch-confirm-summary">
              <div>
                <span>订单号</span>
                <strong>{selectedOrder?.orderNo ?? "未选择订单"}</strong>
              </div>
              <div>
                <span>客户姓名</span>
                <strong>{getOrderCustomerLabel(selectedOrder)}</strong>
              </div>
              <div>
                <span>车型</span>
                <strong>{getOrderVehicleLabel(selectedOrder)}</strong>
              </div>
              <div>
                <span>施工类型</span>
                <Tag color="processing">{getConstructionTypeLabel(selectedOrder?.constructionType)}</Tag>
              </div>
              <div className="dispatch-confirm-summary-wide">
                <span>预约施工日期</span>
                <strong>{formatDispatchAppointmentDate(selectedOrder?.appointmentDate)} {selectedOrder?.appointmentTimeSlot ?? ""}</strong>
              </div>
            </div>
          </section>

          <section className="dispatch-confirm-section">
            <div className="dispatch-confirm-section-title">
              <i />
              <h3>货品匹配预检</h3>
              <span>{selectedOrderDetailLoading ? "货品明细加载中" : `共 ${selectedOrder?.items?.length ?? 0} 项货品`}</span>
            </div>
            <div className="dispatch-confirm-product-list">
              {selectedOrderDetailLoading ? (
                <div className="operation-empty">货品明细加载中...</div>
              ) : selectedOrder?.items?.length ? (
                selectedOrder.items.map((item, index) => (
                  <div key={item.id ?? index} className="dispatch-confirm-product">
                    <div>
                      <strong>{getOrderProductName(item)}</strong>
                      <span>{getOrderProductSpec(item)}</span>
                    </div>
                    <div>
                      <strong>x{item.quantity ?? 1}</strong>
                      <Tag color={index === 0 ? "success" : "warning"}>
                        {index === 0 ? "现货充足" : "需切割/待库房备货"}
                      </Tag>
                    </div>
                  </div>
                ))
              ) : (
                <div className="operation-empty">暂无货品明细，派工前请回订单补齐。</div>
              )}
            </div>
          </section>

          <section className="dispatch-confirm-section dispatch-confirm-checks">
            <label>
              <input
                type="checkbox"
                checked={dispatchChecklist.customerConfirmed}
                onChange={(event) =>
                  setDispatchChecklist((current) => ({ ...current, customerConfirmed: event.target.checked }))
                }
              />
              <span>
                <strong>已核对客户信息及施工要求</strong>
                <small>确认施工部位、产品型号、特殊工艺已通过客户确认。</small>
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={dispatchChecklist.scheduleNotified}
                onChange={(event) =>
                  setDispatchChecklist((current) => ({ ...current, scheduleNotified: event.target.checked }))
                }
              />
              <span>
                <strong>已告知客户施工时间及注意事项</strong>
                <small>包含工期预估、车辆交接流程以及施工期间的必要提醒。</small>
              </span>
            </label>
            <div className="dispatch-confirm-note">
              <strong>给库房/施工主管的补充建议</strong>
              <Input.TextArea
                rows={5}
                value={dispatchNote}
                onChange={(event) => setDispatchNote(event.target.value)}
                placeholder="例如：客户要求特别注意前保险杠合缝处、需库房优先调配A库物料等..."
              />
            </div>
          </section>
        </div>
      </Drawer>
    </div>
  );
}

function getOrderCustomerLabel(order?: OrderRow) {
  if (!order) return "-";
  return order.customer?.companyName ?? order.customer?.name ?? "未登记客户";
}

function getWorkItemKey(item: ConstructionWorkItem) {
  return `${item.kind}:${item.orderId}`;
}

function getWorkItemOrder(item: ConstructionWorkItem) {
  return (item.kind === "pending" ? item.order : item.order) as OrderRow;
}

function getWorkItemStatusLabel(item: ConstructionWorkItem) {
  if (item.kind === "pending") return "待派单";
  return getConstructionStatusLabel(item.status);
}

function getWorkItemStatusColor(item: ConstructionWorkItem) {
  if (item.status === "PENDING_DISPATCH") return "warning";
  if (item.status === "IN_CONSTRUCTION") return "processing";
  if (item.status === "COMPLETED") return "success";
  return "default";
}

function formatAssignedWorkers(record: ConstructionRecordRow, workerMap: Map<string, WorkerRow>) {
  if (!record.assignments?.length) return "未记录人员";
  return record.assignments
    .map((item) => getConstructionWorkerLabel(workerMap.get(item.workerUserId) ?? item.workerUserId))
    .join("、");
}

function PendingDispatchPanel({
  selectedOrder,
  onOpenOrder,
  onOpenSchedule
}: {
  selectedOrder?: OrderRow;
  onOpenOrder: () => void;
  onOpenSchedule: () => void;
}) {
  return (
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
          <span>预约 {formatDispatchAppointmentDate(selectedOrder?.appointmentDate, "-")} {selectedOrder?.appointmentTimeSlot ?? ""}</span>
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
          <strong>外派施工门店协同</strong>
          <p>本店下单，外店或外出地址施工时，请在施工排班中维护当天人员去向，并在订单详情保留地址和照片。</p>
          <Button size="small" onClick={onOpenOrder}>
            查看订单详情
          </Button>
          <Button size="small" onClick={onOpenSchedule}>
            施工排班
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
  );
}

function AssignedConstructionRecordPanel({
  record,
  workerMap,
  onOpenDetail
}: {
  record: ConstructionRecordRow;
  workerMap: Map<string, WorkerRow>;
  onOpenDetail: () => void;
}) {
  return (
    <Card className="dispatch-order-detail">
      <div className="dispatch-detail-head">
        <div className="dispatch-detail-title">
          <span className="dispatch-detail-icon">
            <CarOutlined />
          </span>
          <div>
            <h2>{record.order?.orderNo ?? "施工工单"}</h2>
            <p>当前状态：{getConstructionStatusLabel(record.status)}</p>
          </div>
        </div>
        <Button type="primary" onClick={onOpenDetail}>查看施工工单</Button>
      </div>

      <div className="dispatch-info-grid">
        <div className="dispatch-info-panel">
          <h3>施工团队</h3>
          <strong>{formatAssignedWorkers(record, workerMap)}</strong>
        </div>
        <div className="dispatch-info-panel">
          <h3>施工照片</h3>
          <strong>{record.photos?.length ?? 0} 张</strong>
        </div>
        <div className="dispatch-info-panel">
          <h3>质检状态</h3>
          <strong>{getConstructionQualityResultLabel(record.qualityResult)}</strong>
        </div>
      </div>

      <div className="dispatch-note-panel">
        <h3>质检备注</h3>
        <p>{record.qualityNote || "暂无质检备注。进入施工工单可补充照片、开工完工和质检信息。"}</p>
      </div>

      <div className="dispatch-fee-panel dispatch-cost-card">
        <div>
          <span>施工类型</span>
          <strong>{getConstructionTypeLabel(record.order?.constructionType)}</strong>
        </div>
        <div>
          <span>施工地点</span>
          <strong>{getConstructionLocationLabel(record.order?.constructionLocation)}</strong>
        </div>
      </div>
    </Card>
  );
}

function getOrderVehicleLabel(order?: OrderRow) {
  if (!order?.vehicle) return "车辆未登记";
  const vehicleLabel = [
    order.vehicle.carPlate ?? order.vehicle.plateNo,
    order.vehicle.carModel ?? [order.vehicle.brand, order.vehicle.model].filter(Boolean).join(" "),
    order.vehicle.carColor ?? order.vehicle.color
  ]
    .filter(Boolean)
    .join(" / ");
  return vehicleLabel || "车辆未登记";
}

function getOrderItemsSummary(order?: OrderRow) {
  if (!order?.items?.length) return "待库房核对产品明细";
  return order.items
    .map((item) => {
      const product = item.product;
      const productLabel = [product?.brand, product?.name, product?.model].filter(Boolean).join(" / ") || "待库房核对产品";
      return `${productLabel} x ${item.quantity ?? 1}`;
    })
    .join("、");
}

function formatDispatchAppointmentDate(value?: string | null, missingLabel = "未预约") {
  if (!value) return missingLabel;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "预约日期待确认";
}

function getOrderProductName(item: NonNullable<OrderRow["items"]>[number]) {
  const product = item.product;
  return [product?.brand, product?.name].filter(Boolean).join(" / ") || "待库房核对产品";
}

function getOrderProductSpec(item: NonNullable<OrderRow["items"]>[number]) {
  return item.product?.model || "待库房核对规格";
}

function filterConstructionWorkers(workers: WorkerRow[], keyword: string) {
  const normalizedKeyword = normalizeWorkerSearchKeyword(keyword);
  if (!normalizedKeyword) return workers;
  return workers.filter((worker) => getWorkerSearchText(worker).includes(normalizedKeyword));
}

function filterWorkerOption(input: string, option?: DefaultOptionType) {
  const normalizedInput = normalizeWorkerSearchKeyword(input);
  if (!normalizedInput) return true;
  return normalizeWorkerSearchKeyword(`${option?.label ?? ""} ${option?.value ?? ""}`).includes(normalizedInput);
}

function getWorkerSearchText(worker: WorkerRow) {
  return normalizeWorkerSearchKeyword(
    [
      getConstructionWorkerLabel(worker),
      worker.user?.nickname,
      worker.user?.username,
      worker.userId,
      ...(worker.skillTags ?? [])
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function normalizeWorkerSearchKeyword(value: string) {
  return value.trim().toLowerCase();
}

function getWorkerAvatarText(worker: WorkerRow, index: number) {
  return worker.user?.nickname?.slice(0, 1) ?? worker.user?.username?.slice(0, 1)?.toUpperCase() ?? String(index + 1);
}

function getDispatchDraftKey(orderId: string) {
  return `mallbay-construction-dispatch-draft:${orderId}`;
}

function loadDispatchDraft(orderId: string): DispatchDraft | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = localStorage.getItem(getDispatchDraftKey(orderId));
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Partial<DispatchDraft>;
    return {
      checklist: {
        customerConfirmed: parsed.checklist?.customerConfirmed === true,
        scheduleNotified: parsed.checklist?.scheduleNotified === true
      },
      note: typeof parsed.note === "string" ? parsed.note : "",
      workerUserIds: Array.isArray(parsed.workerUserIds)
        ? parsed.workerUserIds.filter((id): id is string => typeof id === "string")
        : []
    };
  } catch {
    return undefined;
  }
}

function saveDispatchDraft(orderId: string, draft: DispatchDraft) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getDispatchDraftKey(orderId), JSON.stringify(draft));
}

function clearDispatchDraft(orderId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getDispatchDraftKey(orderId));
}
