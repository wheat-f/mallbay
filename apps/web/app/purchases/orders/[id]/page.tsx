"use client";

import { useState } from "react";
import { Alert, App, Button, Card, DatePicker, Form, Input, InputNumber, Select, Table, Tag } from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  StopOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { purchaseApi } from "../../../../src/lib/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import {
  getPurchaseInboundItemDetails,
  getPurchaseOrderArrivalReminder,
  getPurchaseOrderStatusLabel,
  type PurchaseInboundItemLike
} from "../../../../src/features/inventory/display";
import { parseInboundScanLines } from "../../../../src/features/inventory/inbound-scan";

type PurchaseOrderItemRow = PurchaseInboundItemLike & {
  id: string;
  productId?: string | null;
};

type PurchaseOrderDetail = {
  id: string;
  orderNo: string;
  status: string;
  supplierName?: string | null;
  expectedAt?: string | null;
  createdAt?: string | null;
  items?: PurchaseOrderItemRow[];
};

export default function PurchaseOrderDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const purchaseOrderId = params.id;
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManagePurchase = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const [rejectReason, setRejectReason] = useState("");

  const purchaseOrdersQuery = useQuery({
    queryKey: ["purchase-orders", storeId],
    queryFn: () => purchaseApi.orders(storeId!),
    enabled: Boolean(storeId)
  });
  const purchaseOrder = ((purchaseOrdersQuery.data ?? []) as PurchaseOrderDetail[]).find((order) => order.id === purchaseOrderId);

  const receivePurchaseItem = useMutation({
    mutationFn: (values: { itemId: string; quantity: number; batchNo: string; supplierName?: string }) =>
      purchaseApi.receiveOrderItem(values.itemId, {
        quantity: values.quantity,
        batchNo: values.batchNo,
        supplierName: values.supplierName
      }),
    onSuccess: async () => {
      message.success("采购明细已入库");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const receivePurchaseItemBatches = useMutation({
    mutationFn: (values: { itemId: string; batches: Array<{ quantity: number; batchNo: string; supplierName?: string }> }) =>
      purchaseApi.receiveOrderItemBatches(values.itemId, values.batches),
    onSuccess: async (result) => {
      if (result.failed.length > 0) {
        message.warning(`批量入库完成，成功 ${result.received.length} 行，失败 ${result.failed.length} 行`);
      } else {
        message.success("批量入库已完成");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const approvePurchaseOrder = useMutation({
    mutationFn: (id: string) => purchaseApi.approveOrder(id),
    onSuccess: async () => {
      message.success("采购订单已审批通过");
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const cancelPurchaseOrder = useMutation({
    mutationFn: (values: { id: string; reason: string }) => purchaseApi.cancelOrder(values.id, { reason: values.reason }),
    onSuccess: async () => {
      message.success("采购订单已取消");
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const handleRejectPurchaseOrder = () => {
    if (!purchaseOrder) return;
    const trimmedReason = rejectReason.trim();
    if (!trimmedReason) {
      message.error("请填写拒绝收货原因");
      return;
    }
    cancelPurchaseOrder.mutate({ id: purchaseOrder.id, reason: trimmedReason });
  };

  const items = purchaseOrder?.items ?? [];
  const purchasedQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const receivedQuantity = items.reduce((sum, item) => sum + toNumber(item.receivedQuantity), 0);
  const arrivalReminder = purchaseOrder ? getPurchaseOrderArrivalReminder(purchaseOrder) : "-";
  const itemOptions = items.map((item) => ({
    value: item.id,
    label: getPurchaseInboundItemDetails(item).product
  }));
  const purchaseSteps = getPurchaseSteps(purchaseOrder?.status);

  return (
    <div className="management-page">
      {!purchaseOrder && !purchaseOrdersQuery.isLoading ? (
        <Alert type="warning" showIcon title="采购订单未找到" description="请从采购列表重新进入采购订单详情。" />
      ) : null}

      {purchaseOrder ? (
        <>
          <section className="purchase-detail-hero">
            <div>
              <span className="purchase-detail-eyebrow">采购订单详情</span>
              <h1>
                {purchaseOrder.orderNo}
                <Tag>{getPurchaseOrderStatusLabel(purchaseOrder.status)}</Tag>
              </h1>
              <p>{`创建时间：${formatDateTime(purchaseOrder.createdAt)} / 预计到货：${formatDate(purchaseOrder.expectedAt)}`}</p>
            </div>
            <div className="purchase-detail-actions">
              <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/purchases/orders")}>
                返回采购列表
              </Button>
              {purchaseOrder.status === "DRAFT" ? (
                <Button
                  icon={<CheckCircleOutlined />}
                  type="primary"
                  disabled={!canManagePurchase}
                  loading={approvePurchaseOrder.isPending}
                  onClick={() => approvePurchaseOrder.mutate(purchaseOrder.id)}
                >
                  审批通过
                </Button>
              ) : null}
              <Button icon={<FileTextOutlined />}>导出订单</Button>
              <Button icon={<PrinterOutlined />}>打印入库单</Button>
            </div>
          </section>

          <section className="purchase-detail-stepper">
            {purchaseSteps.map((step, index) => (
              <div key={step.label} className={`purchase-step-item ${step.state}`}>
                {index < purchaseSteps.length - 1 ? <div className="purchase-step-line" /> : null}
                <div className="purchase-step-dot">
                  {step.state === "done" ? <CheckCircleOutlined /> : index + 1}
                </div>
                <strong>{step.label}</strong>
                <span>{step.description}</span>
              </div>
            ))}
          </section>

          <section className="purchase-detail-workspace">
            <div className="purchase-detail-main">
              <Card className="purchase-detail-card purchase-basic-card" title={<><InfoCircleOutlined />基本信息</>}>
                <div className="purchase-info-grid">
                  <span>采购单号</span><strong>{purchaseOrder.orderNo}</strong>
                  <span>状态</span><strong>{getPurchaseOrderStatusLabel(purchaseOrder.status)}</strong>
                  <span>供应商</span><strong>{purchaseOrder.supplierName ?? "-"}</strong>
                  <span>预计到货</span><strong>{formatDate(purchaseOrder.expectedAt)}</strong>
                </div>
              </Card>

              <Card
                className="purchase-detail-card purchase-items-card"
                title="采购清单"
                extra={<span>{`共 ${items.length} 项物料`}</span>}
              >
                <div className="purchase-items-mobile-cards">
                  {items.length > 0 ? (
                    items.map((item) => {
                      const details = getPurchaseInboundItemDetails(item);
                      return (
                        <article className="purchase-items-mobile-card" key={item.id}>
                          <div className="purchase-items-mobile-card-head">
                            <div>
                              <strong>{details.product}</strong>
                              <span>{details.category}</span>
                            </div>
                            <Tag>{details.quantity}</Tag>
                          </div>
                          <dl className="purchase-items-mobile-card-fields">
                            <div>
                              <dt>规格</dt>
                              <dd>{details.specification}</dd>
                            </div>
                            <div>
                              <dt>质保</dt>
                              <dd>{details.warranty}</dd>
                            </div>
                            <div>
                              <dt>入库批次</dt>
                              <dd>{details.batches}</dd>
                            </div>
                          </dl>
                        </article>
                      );
                    })
                  ) : (
                    <div className="purchase-items-mobile-empty">暂无采购明细</div>
                  )}
                </div>
                <Table<PurchaseOrderItemRow>
                  className="purchase-items-desktop-table"
                  rowKey="id"
                  pagination={false}
                  dataSource={items}
                  columns={[
                    { title: "产品", render: (_, row) => getPurchaseInboundItemDetails(row).product },
                    { title: "类别", render: (_, row) => getPurchaseInboundItemDetails(row).category },
                    { title: "规格", render: (_, row) => getPurchaseInboundItemDetails(row).specification },
                    { title: "质保", render: (_, row) => getPurchaseInboundItemDetails(row).warranty },
                    { title: "数量", render: (_, row) => getPurchaseInboundItemDetails(row).quantity },
                    { title: "入库批次", render: (_, row) => getPurchaseInboundItemDetails(row).batches }
                  ]}
                />
              </Card>

              <Card className="purchase-detail-card purchase-log-card" title="流转日志" extra={<HistoryOutlined />}>
                <div className="purchase-log-timeline">
                  {[
                    `采购订单创建 ${formatDateTime(purchaseOrder.createdAt)}`,
                    `供应商已发货 ${purchaseOrder.supplierName ?? "供应商待确认"}`,
                    `到货提醒：${arrivalReminder}`,
                    `入库进度：${receivedQuantity}/${purchasedQuantity}`
                  ].map((item, index) => (
                    <div key={item}>
                      <i className={index === 0 ? "is-active" : ""} />
                      <strong>{item}</strong>
                      <span>{index === 0 ? "系统记录" : "自动同步"}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <aside className="purchase-detail-side">
              <Card className="purchase-receiving-panel" title="到货验收录入">
                <Form
                  layout="vertical"
                  initialValues={{ supplierName: purchaseOrder.supplierName ?? undefined, warehouseName: "华东 1 号中心仓 - A区" }}
                  onFinish={(values: {
                    itemId: string;
                    batchNo: string;
                    quantity: number;
                    supplierName?: string;
                    productionDate?: unknown;
                    warehouseName?: string;
                    acceptanceNote?: string;
                  }) => {
                    receivePurchaseItem.mutate({
                      itemId: values.itemId,
                      batchNo: values.batchNo,
                      quantity: values.quantity,
                      supplierName: values.supplierName
                    });
                  }}
                >
                  <Form.Item name="itemId" label="验收物料" rules={[{ required: true, message: "请选择验收物料" }]}>
                    <Select placeholder="选择采购明细" options={itemOptions} />
                  </Form.Item>
                  <Form.Item name="quantity" label="实收数量" rules={[{ required: true, message: "请输入入库数量" }]}>
                    <InputNumber className="w-full" min={0.001} placeholder="输入接收数量" />
                  </Form.Item>
                  <Form.Item name="batchNo" label="批次号" rules={[{ required: true, message: "请输入批次号" }]}>
                    <Input placeholder="例如：231024-XP-01" />
                  </Form.Item>
                  <Form.Item name="productionDate" label="生产日期">
                    <DatePicker className="w-full" />
                  </Form.Item>
                  <Form.Item name="warehouseName" label="存放仓库" rules={[{ required: true, message: "请选择存放仓库" }]}>
                    <Select
                      options={[
                        { value: "华东 1 号中心仓 - A区", label: "华东 1 号中心仓 - A区" },
                        { value: "华东 1 号中心仓 - B区", label: "华东 1 号中心仓 - B区" },
                        { value: "华南分仓 - A区", label: "华南分仓 - A区" }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="acceptanceNote" label="验收备注">
                    <Input.TextArea rows={2} placeholder="如包装破损、数量不符等情况请在此说明" />
                  </Form.Item>
                  <Button block type="primary" htmlType="submit" icon={<InboxOutlined />} loading={receivePurchaseItem.isPending} disabled={!canManagePurchase}>
                    确认验收并入库
                  </Button>
                </Form>

                <div className="purchase-scan-panel">
                  <div className="purchase-scan-title">
                    <QrcodeOutlined />
                    <span>批量扫码录入</span>
                  </div>
                  <Form
                    layout="vertical"
                    onFinish={(values: { itemId: string; scanText: string }) => {
                      const parsed = parseInboundScanLines(values.scanText);
                      if (parsed.errors.length > 0) {
                        message.error(`扫码内容有误：第 ${parsed.errors[0].line} 行 ${parsed.errors[0].message}`);
                        return;
                      }
                      if (parsed.batches.length === 0) {
                        message.error("请粘贴或扫描入库批次");
                        return;
                      }
                      receivePurchaseItemBatches.mutate({ itemId: values.itemId, batches: parsed.batches });
                    }}
                  >
                    <Form.Item name="itemId" label="扫码物料" rules={[{ required: true, message: "请选择扫码物料" }]}>
                      <Select placeholder="选择采购明细" options={itemOptions} />
                    </Form.Item>
                    <Form.Item name="scanText" label="批量扫码入库">
                      <Input.TextArea rows={3} placeholder="每行：批次号 数量 供应商（供应商可选），例如 B001 1 3M" />
                    </Form.Item>
                    <Button block htmlType="submit" loading={receivePurchaseItemBatches.isPending} disabled={!canManagePurchase}>
                      批量入库
                    </Button>
                  </Form>
                </div>

                <div className="purchase-reject-panel">
                  <div className="purchase-reject-title">
                    <StopOutlined />
                    <span>拒绝收货</span>
                  </div>
                  <Input.TextArea
                    rows={2}
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    placeholder="请填写拒绝原因，如包装破损、数量不符或批次异常"
                  />
                  <Button
                    block
                    danger
                    loading={cancelPurchaseOrder.isPending}
                    disabled={!canManagePurchase || !rejectReason.trim()}
                    onClick={handleRejectPurchaseOrder}
                  >
                    拒收订单
                  </Button>
                </div>
              </Card>

              <div className="purchase-help-card">
                <InfoCircleOutlined />
                <div>
                  <strong>入库指南</strong>
                  <p>确认入库前请核对实物外包装、防伪编码和批次号，并拍摄外箱照片存档。</p>
                </div>
              </div>
            </aside>
          </section>
        </>
      ) : null}
    </div>
  );
}

function toNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
}

function getPurchaseSteps(status?: string) {
  const statuses = ["DRAFT", "ORDERED", "PARTIAL_RECEIVED", "RECEIVED"];
  const labels = ["新建订单", "审批通过", "供应商发货", "待验收", "已入库"];
  const statusStepIndexes: Record<string, number> = {
    DRAFT: 0,
    ORDERED: 2,
    PARTIAL_RECEIVED: 3,
    RECEIVED: 4
  };
  const currentIndex = statusStepIndexes[status ?? "DRAFT"] ?? Math.max(0, statuses.indexOf(status ?? "DRAFT"));
  return labels.map((label, index) => ({
    label,
    description: index < currentIndex ? "已完成" : index === currentIndex ? "当前阶段" : "待处理",
    state: index < currentIndex ? "done" : index === currentIndex ? "active" : "pending"
  }));
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function formatDateTime(value?: string | null) {
  return value ? value.slice(0, 19).replace("T", " ") : "-";
}
