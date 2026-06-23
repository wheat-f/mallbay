"use client";

import type { InventorySupplierSummary } from "@mallbay/shared";
import { useMemo, useState } from "react";
import { Alert, App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Table, Tag } from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  MinusCircleOutlined,
  PlusOutlined,
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
import { PurchaseModuleNav } from "../../../../src/features/purchases/purchase-module-nav";
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

type ReceiveBatchFormRow = {
  batchNo?: string;
  quantity?: number;
  supplierName?: string;
};

type ScanImportMode = "append" | "replace";

export default function PurchaseOrderDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [receiveForm] = Form.useForm();
  const params = useParams<{ id: string }>();
  const purchaseOrderId = params.id;
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManagePurchase = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const [rejectReason, setRejectReason] = useState("");
  const [scanImportOpen, setScanImportOpen] = useState(false);
  const [scanImportText, setScanImportText] = useState("");
  const [scanImportMode, setScanImportMode] = useState<ScanImportMode>("append");

  const purchaseOrderQuery = useQuery({
    queryKey: ["purchase-order", purchaseOrderId],
    queryFn: () => purchaseApi.order(purchaseOrderId),
    enabled: Boolean(purchaseOrderId)
  });
  const purchaseOrder = purchaseOrderQuery.data as PurchaseOrderDetail | undefined;
  const suppliersQuery = useQuery({
    queryKey: ["purchase-order-detail-suppliers", storeId],
    queryFn: () => purchaseApi.suppliers(storeId!),
    enabled: Boolean(storeId)
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
        queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrderId] }),
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrderId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const cancelPurchaseOrder = useMutation({
    mutationFn: (values: { id: string; reason: string }) => purchaseApi.cancelOrder(values.id, { reason: values.reason }),
    onSuccess: async () => {
      message.success("采购订单已取消");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrderId] })
      ]);
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
  const supplierOptions = useMemo(
    () => buildSupplierOptions((suppliersQuery.data ?? []) as InventorySupplierSummary[], purchaseOrder?.supplierName),
    [purchaseOrder?.supplierName, suppliersQuery.data]
  );
  const selectedReceiveItemId = Form.useWatch("itemId", receiveForm);
  const selectedReceiveItem = items.find((item) => item.id === selectedReceiveItemId);
  const remainingReceiveQuantity = getRemainingPurchaseQuantity(selectedReceiveItem);
  const purchaseSteps = getPurchaseSteps(purchaseOrder?.status);
  const getDefaultSupplierName = () =>
    (receiveForm.getFieldValue("supplierName") as string | undefined) || purchaseOrder?.supplierName || undefined;
  const createEmptyBatchRow = (): ReceiveBatchFormRow => ({
    batchNo: "",
    quantity: selectedReceiveItem ? Math.min(1, remainingReceiveQuantity || 1) : 1,
    supplierName: getDefaultSupplierName()
  });
  const ensureReceiveItemSelected = () => {
    if (!selectedReceiveItem) {
      message.error("请先选择验收物料");
      return false;
    }
    if (remainingReceiveQuantity <= 0) {
      message.error("该采购明细已全部入库");
      return false;
    }
    return true;
  };
  const handleGenerateBatchRows = () => {
    if (!ensureReceiveItemSelected()) return;
    const remaining = getRemainingPurchaseQuantity(selectedReceiveItem);
    const wholeRows = Number.isInteger(remaining) ? remaining : Math.ceil(remaining);
    const rowCount = Math.min(wholeRows, 50);
    const defaultSupplierName = getDefaultSupplierName();
    receiveForm.setFieldsValue({
      batches: Array.from({ length: rowCount }, (_, index) => ({
        batchNo: "",
        quantity: index === rowCount - 1 ? Number((remaining - (rowCount - 1)).toFixed(3)) : 1,
        supplierName: defaultSupplierName || purchaseOrder?.supplierName || undefined
      }))
    });
  };
  const handleOpenScanImport = () => {
    if (!ensureReceiveItemSelected()) return;
    setScanImportOpen(true);
  };
  const handleImportScannedBatches = () => {
    if (!ensureReceiveItemSelected()) return;
    const parsed = parseInboundScanLines(scanImportText);
    if (parsed.errors.length > 0) {
      message.error(`扫码内容有误：第 ${parsed.errors[0].line} 行 ${parsed.errors[0].message}`);
      return;
    }
    if (parsed.batches.length === 0) {
      message.error("请粘贴或扫描入库批次");
      return;
    }
    const defaultSupplierName = getDefaultSupplierName();
    const importedBatches = parsed.batches.map((batch) => ({
      ...batch,
      supplierName: batch.supplierName || defaultSupplierName
    }));
    const existingBatches = ((receiveForm.getFieldValue("batches") ?? []) as ReceiveBatchFormRow[]).filter(Boolean);
    const nextBatches = scanImportMode === "replace" ? importedBatches : [...existingBatches, ...importedBatches];
    const totalQuantity = nextBatches.reduce((sum, batch) => sum + Number(batch.quantity ?? 0), 0);
    if (remainingReceiveQuantity > 0 && totalQuantity > remainingReceiveQuantity) {
      message.error(`批次数量合计不能超过剩余待入库数量 ${remainingReceiveQuantity}`);
      return;
    }
    receiveForm.setFieldsValue({ batches: nextBatches });
    setScanImportOpen(false);
    setScanImportText("");
  };

  return (
    <div className="management-page purchase-order-detail-page">
      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="orders" />
        <div className="purchase-module-content">
          {!purchaseOrder && !purchaseOrderQuery.isLoading ? (
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
                  form={receiveForm}
                  layout="vertical"
                  initialValues={{ supplierName: purchaseOrder.supplierName ?? undefined, warehouseName: "华东 1 号中心仓 - A区", batches: [] }}
                  onFinish={(values: {
                    itemId: string;
                    supplierName?: string;
                    batches?: ReceiveBatchFormRow[];
                    productionDate?: unknown;
                    warehouseName?: string;
                    acceptanceNote?: string;
                  }) => {
                    const selectedItem = items.find((item) => item.id === values.itemId);
                    const remaining = getRemainingPurchaseQuantity(selectedItem);
                    const batches = (values.batches ?? [])
                      .map((batch) => ({
                        batchNo: batch.batchNo?.trim() ?? "",
                        quantity: Number(batch.quantity ?? 0),
                        supplierName: batch.supplierName?.trim() || values.supplierName?.trim() || purchaseOrder.supplierName || undefined
                      }))
                      .filter((batch) => batch.batchNo && batch.quantity > 0);
                    if (batches.length === 0) {
                      message.error("请至少录入一个批次明细");
                      return;
                    }
                    if (batches.some((batch) => !batch.supplierName)) {
                      message.error("请选择或填写供应商");
                      return;
                    }
                    if (hasDuplicateBatchNo(batches)) {
                      message.error("批次号不能重复");
                      return;
                    }
                    const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
                    if (remaining > 0 && totalQuantity > remaining) {
                      message.error(`入库数量不能超过剩余待入库数量 ${remaining}`);
                      return;
                    }
                    receivePurchaseItemBatches.mutate({ itemId: values.itemId, batches });
                  }}
                >
                  <Form.Item name="itemId" label="验收物料" rules={[{ required: true, message: "请选择验收物料" }]}>
                    <Select placeholder="选择采购明细" options={itemOptions} />
                  </Form.Item>
                  <div className="purchase-receive-default-grid">
                    <Form.Item name="supplierName" label="默认供应商">
                      <Select
                        showSearch
                        allowClear
                        optionFilterProp="label"
                        placeholder="未填批次供应商时使用该供应商"
                        options={supplierOptions}
                      />
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
                  </div>
                  <Form.Item name="acceptanceNote" label="验收备注">
                    <Input.TextArea rows={2} placeholder="如包装破损、数量不符等情况请在此说明" />
                  </Form.Item>
                  <div className="purchase-receive-batch-toolbar">
                    <div>
                      <strong>批次明细</strong>
                      <span>{selectedReceiveItem ? `剩余待入库 ${remainingReceiveQuantity}` : "先选择验收物料后录入批次"}</span>
                    </div>
                    <div className="purchase-receive-batch-actions">
                      <Button
                        type="default"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          if (!ensureReceiveItemSelected()) return;
                          const current = ((receiveForm.getFieldValue("batches") ?? []) as ReceiveBatchFormRow[]).filter(Boolean);
                          receiveForm.setFieldsValue({ batches: [...current, createEmptyBatchRow()] });
                        }}
                      >
                        手工新增批次
                      </Button>
                      <Button type="default" icon={<PlusOutlined />} onClick={handleGenerateBatchRows}>
                        按剩余数量生成批次行
                      </Button>
                      <Button type="default" icon={<QrcodeOutlined />} onClick={handleOpenScanImport}>
                        扫码/粘贴导入
                      </Button>
                    </div>
                  </div>
                  <Form.List name="batches">
                    {(fields, { remove }) => (
                      <div className="purchase-receive-batch-list">
                        {fields.map((field, index) => {
                          const { key, ...restField } = field;

                          return (
                            <div className="purchase-receive-batch-row" key={key}>
                              <Form.Item
                                {...restField}
                                name={[field.name, "batchNo"]}
                                label={index === 0 ? "批次号" : " "}
                                rules={[{ required: true, message: "请输入批次号" }]}
                              >
                                <Input placeholder={`第 ${index + 1} 卷/批次号`} />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[field.name, "quantity"]}
                                label={index === 0 ? "数量" : " "}
                                rules={[{ required: true, message: "请输入数量" }]}
                              >
                                <InputNumber className="w-full" min={0.001} placeholder="数量" />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[field.name, "supplierName"]}
                                label={index === 0 ? "供应商" : " "}
                              >
                                <Select
                                  showSearch
                                  allowClear
                                  optionFilterProp="label"
                                  placeholder={purchaseOrder.supplierName ?? "选择供应商"}
                                  options={supplierOptions}
                                />
                              </Form.Item>
                              <Button
                                aria-label="移除批次明细"
                                icon={<MinusCircleOutlined />}
                                disabled={fields.length <= 1}
                                onClick={() => remove(field.name)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Form.List>
                  <Button block type="primary" htmlType="submit" icon={<InboxOutlined />} loading={receivePurchaseItemBatches.isPending} disabled={!canManagePurchase}>
                    确认验收并入库
                  </Button>
                </Form>

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
          <Modal
            title="扫码/粘贴导入批次明细"
            open={scanImportOpen}
            okText="导入到批次明细"
            cancelText="取消"
            onOk={handleImportScannedBatches}
            onCancel={() => setScanImportOpen(false)}
            destroyOnHidden
          >
            <div className="purchase-scan-import-modal">
              <Radio.Group
                value={scanImportMode}
                onChange={(event) => setScanImportMode(event.target.value as ScanImportMode)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="append">追加到现有批次</Radio.Button>
                <Radio.Button value="replace">覆盖当前批次</Radio.Button>
              </Radio.Group>
              <label>
                <span>导入方式</span>
                <Input.TextArea
                  rows={5}
                  value={scanImportText}
                  onChange={(event) => setScanImportText(event.target.value)}
                  placeholder="每行：批次号 数量 供应商（供应商可选），例如 B001 1 3M"
                />
              </label>
              <p>导入后会回填到批次明细列表，仍需人工核对批次号、数量和供应商后再确认入库。</p>
            </div>
          </Modal>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function toNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
}

function getRemainingPurchaseQuantity(item?: PurchaseOrderItemRow) {
  if (!item) return 0;
  return Math.max(0, Number((toNumber(item.quantity) - toNumber(item.receivedQuantity)).toFixed(3)));
}

function hasDuplicateBatchNo(batches: Array<{ batchNo: string }>) {
  const seen = new Set<string>();
  for (const batch of batches) {
    const normalized = batch.batchNo.trim().toLocaleLowerCase();
    if (seen.has(normalized)) return true;
    seen.add(normalized);
  }
  return false;
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

function buildSupplierOptions(suppliers: InventorySupplierSummary[], purchaseOrderSupplierName?: string | null) {
  const names = new Set<string>();
  for (const supplier of suppliers) {
    if (supplier.name?.trim()) names.add(supplier.name.trim());
  }
  if (purchaseOrderSupplierName?.trim()) names.add(purchaseOrderSupplierName.trim());

  return Array.from(names).map((name) => ({ value: name, label: name }));
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function formatDateTime(value?: string | null) {
  return value ? value.slice(0, 19).replace("T", " ") : "-";
}
