"use client";

import type { InventorySupplierSummary, InventoryWarehouseSummary, ProductUnit } from "@mallbay/shared";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Alert, App, Button, Card, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Table, Tag } from "antd";
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  HistoryOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  ImportOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  PrinterOutlined,
  StopOutlined
} from "@ant-design/icons";
import { BrowserMultiFormatReader } from "@zxing/browser";
import * as XLSX from "xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { purchaseApi } from "../../../../src/lib/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../../../src/features/permissions/use-effective-permissions";
import {
  getPurchaseInboundItemDetails,
  getPurchaseOrderArrivalReminder,
  getPurchaseOrderStatusLabel,
  type PurchaseInboundItemLike
} from "../../../../src/features/inventory/display";
import { PurchaseModuleNav } from "../../../../src/features/purchases/purchase-module-nav";
import {
  parseInboundFileRows,
  parseInboundImageCodes,
  parseInboundScanLines,
  type InboundScanParseResult
} from "../../../../src/features/inventory/inbound-scan";
import { exportRowsToExcel } from "../../../../src/lib/export-excel";
import { PRODUCT_UNIT_OPTIONS } from "../../../../src/features/products/display";

type PurchaseOrderItemRow = Omit<PurchaseInboundItemLike, "receiptCostRecords"> & {
  id: string;
  productId?: string | null;
  unitCostCents?: number | null;
  receiptCostRecords?: PurchaseReceiptCostRecord[];
};

type PurchaseReceiptCostRecord = {
  id: string;
  inventoryBatchId: string;
  actualUnitCostCents?: number | null;
  plannedUnitCostCents?: number | null;
  differenceCents?: number | null;
  differenceReason?: string | null;
  createdAt: string;
  inventoryBatch?: { batchNo?: string | null } | null;
};

type PurchaseOrderDetail = {
  id: string;
  orderNo: string;
  status: string;
  supplierName?: string | null;
  purchaser?: { id: string; username?: string | null; nickname?: string | null } | null;
  expectedAt?: string | null;
  createdAt?: string | null;
  items?: PurchaseOrderItemRow[];
};

type ReceiveBatchFormRow = {
  batchNo?: string;
  quantity?: number;
  unit?: ProductUnit;
  baseUnit?: ProductUnit;
  baseQuantityPerPackage?: number;
  supplierName?: string;
  actualCostMode?: "PLANNED" | "ACTUAL" | "PENDING";
  actualUnitCostYuan?: number;
  costDifferenceReason?: string;
};

type ScanImportMode = "append" | "replace";
type ScanImportSource = "image" | "manual" | "file";
type ReceiveActionMode = "receive" | "reject";

type ScanImportImageResult = {
  fileName: string;
  previewUrl: string;
  code?: string;
  error?: string;
};

export default function PurchaseOrderDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [receiveForm] = Form.useForm();
  const [receiptCostForm] = Form.useForm();
  const params = useParams<{ id: string }>();
  const purchaseOrderId = params.id;
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const permissionsQuery = useEffectivePermissions(storeId);
  const canManagePurchase = hasEffectivePermission(permissionsQuery.data?.permissions, "purchase", "write", storeId);
  const [rejectReason, setRejectReason] = useState("");
  const [scanImportOpen, setScanImportOpen] = useState(false);
  const [scanImportText, setScanImportText] = useState("");
  const [scanImportMode, setScanImportMode] = useState<ScanImportMode>("append");
  const [scanImportSource, setScanImportSource] = useState<ScanImportSource>("manual");
  const [scanImportParsed, setScanImportParsed] = useState<InboundScanParseResult>({ batches: [], errors: [] });
  const [scanImportImages, setScanImportImages] = useState<ScanImportImageResult[]>([]);
  const [scanImportFileName, setScanImportFileName] = useState("");
  const [scanImportRecognizing, setScanImportRecognizing] = useState(false);
  const [receiveActionMode, setReceiveActionMode] = useState<ReceiveActionMode>("receive");
  const [editingReceiptCost, setEditingReceiptCost] = useState<PurchaseReceiptCostRecord | null>(null);

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
  const warehousesQuery = useQuery({
    queryKey: ["purchase-order-detail-warehouses", storeId],
    queryFn: () => purchaseApi.warehouses(storeId!),
    enabled: Boolean(storeId)
  });

  const receivePurchaseItemBatches = useMutation({
    mutationFn: (values: {
      itemId: string;
      batches: Array<{
        quantity: number;
        batchNo: string;
        unit?: ProductUnit;
        baseUnit?: ProductUnit;
        baseQuantityPerPackage?: number;
        supplierName?: string;
        warehouseId?: string;
        warehouseName?: string;
        actualUnitCostCents?: number | null;
        costDifferenceReason?: string;
      }>;
    }) =>
      purchaseApi.receiveOrderItemBatches(values.itemId, values.batches),
    onSuccess: async (result) => {
      if (result.failed.length > 0) {
        message.warning(`批量入库完成，成功 ${result.received.length} 行，失败 ${result.failed.length} 行`);
      } else {
        message.success("批量入库已完成");
        receiveForm.setFieldsValue({ batches: [] });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
      await queryClient.refetchQueries({ queryKey: ["purchase-order", purchaseOrderId], type: "active" });
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
  const effectivePurchaseOrderStatus = getEffectivePurchaseOrderStatus(purchaseOrder?.status, items);
  const effectivePurchaseOrder = purchaseOrder ? { ...purchaseOrder, status: effectivePurchaseOrderStatus } : undefined;
  const arrivalReminder = effectivePurchaseOrder ? getPurchaseOrderArrivalReminder(effectivePurchaseOrder) : "-";
  const itemOptions = items.map((item) => ({
    value: item.id,
    label: getPurchaseInboundItemDetails(item).product,
    disabled: getRemainingPurchaseQuantity(item) <= 0
  }));
  const supplierOptions = useMemo(
    () => buildSupplierOptions((suppliersQuery.data ?? []) as InventorySupplierSummary[], purchaseOrder?.supplierName),
    [purchaseOrder?.supplierName, suppliersQuery.data]
  );
  const warehouseOptions = useMemo(
    () => ((warehousesQuery.data ?? []) as InventoryWarehouseSummary[])
      .filter((warehouse) => warehouse.isActive)
      .map((warehouse) => ({ value: warehouse.id, label: buildWarehouseLabel(warehouse) })),
    [warehousesQuery.data]
  );
  const selectedReceiveItemId = Form.useWatch("itemId", receiveForm);
  const selectedReceiveItem = items.find((item) => item.id === selectedReceiveItemId);
  const remainingReceiveQuantity = getRemainingPurchaseQuantity(selectedReceiveItem);
  const isPurchaseOrderReceivable = effectivePurchaseOrderStatus === "ORDERED" || effectivePurchaseOrderStatus === "PARTIAL_RECEIVED";
  const canSubmitReceive =
    canManagePurchase &&
    isPurchaseOrderReceivable &&
    Boolean(selectedReceiveItem) &&
    remainingReceiveQuantity > 0 &&
    !receivePurchaseItemBatches.isPending;
  const purchaseSteps = getPurchaseSteps(effectivePurchaseOrderStatus);
  const getDefaultSupplierName = () =>
    (receiveForm.getFieldValue("supplierName") as string | undefined) || purchaseOrder?.supplierName || undefined;
  useEffect(() => {
    if (!receiveForm.getFieldValue("warehouseId") && warehouseOptions.length > 0) {
      receiveForm.setFieldsValue({ warehouseId: warehouseOptions[0].value });
    }
  }, [receiveForm, warehouseOptions]);
  useEffect(() => {
    if (!selectedReceiveItemId) return;
    const selectedItem = items.find((item) => item.id === selectedReceiveItemId);
    if (!selectedItem || getRemainingPurchaseQuantity(selectedItem) > 0) return;
    const nextReceivableItemId = items.find(
      (item) => item.id !== selectedReceiveItemId && getRemainingPurchaseQuantity(item) > 0
    )?.id;
    receiveForm.setFieldsValue({ itemId: nextReceivableItemId, batches: [] });
  }, [items, receiveForm, selectedReceiveItemId]);
  const createEmptyBatchRow = (): ReceiveBatchFormRow => ({
    batchNo: "",
    quantity: selectedReceiveItem ? Math.min(1, remainingReceiveQuantity || 1) : 1,
    ...getReceiveConversionDefaults(selectedReceiveItem),
    supplierName: getDefaultSupplierName(),
    actualCostMode: "PLANNED",
    actualUnitCostYuan: selectedReceiveItem?.unitCostCents == null ? undefined : selectedReceiveItem.unitCostCents / 100
  });

  const updateReceiptCost = useMutation({
    mutationFn: (values: { id: string; actualUnitCostCents: number | null; costDifferenceReason?: string }) =>
      purchaseApi.updateReceiptCost(values.id, values),
    onSuccess: async () => {
      message.success("实际入库价已更新");
      setEditingReceiptCost(null);
      await queryClient.invalidateQueries({ queryKey: ["purchase-order", purchaseOrderId] });
    },
    onError: (error: Error) => message.error(error.message)
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
    const conversionDefaults = getReceiveConversionDefaults(selectedReceiveItem);
    receiveForm.setFieldsValue({
      batches: Array.from({ length: rowCount }, (_, index) => ({
        batchNo: "",
        quantity: index === rowCount - 1 ? Number((remaining - (rowCount - 1)).toFixed(3)) : 1,
        ...conversionDefaults,
        supplierName: defaultSupplierName || purchaseOrder?.supplierName || undefined,
        actualCostMode: "PLANNED",
        actualUnitCostYuan: selectedReceiveItem?.unitCostCents == null ? undefined : selectedReceiveItem.unitCostCents / 100
      }))
    });
  };
  const handleOpenScanImport = () => {
    if (!ensureReceiveItemSelected()) return;
    setScanImportSource("manual");
    setScanImportText("");
    setScanImportParsed({ batches: [], errors: [] });
    setScanImportFileName("");
    setScanImportImages([]);
    setScanImportOpen(true);
  };

  const resetScanImport = () => {
    scanImportImages.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setScanImportOpen(false);
    setScanImportText("");
    setScanImportParsed({ batches: [], errors: [] });
    setScanImportFileName("");
    setScanImportImages([]);
    setScanImportRecognizing(false);
  };

  const handleScanImportImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setScanImportRecognizing(true);
    const reader = new BrowserMultiFormatReader();
    const imageResults: ScanImportImageResult[] = [];
    const codes: string[] = [];
    for (const file of files) {
      const previewUrl = URL.createObjectURL(file);
      try {
        const result = await reader.decodeFromImageUrl(previewUrl);
        const code = result.getText().trim();
        if (!code) throw new Error("图片中没有识别到批次号");
        codes.push(code);
        imageResults.push({ fileName: file.name, previewUrl, code });
      } catch {
        imageResults.push({ fileName: file.name, previewUrl, error: "未识别到批次号，请更换清晰图片或改用手动输入" });
      }
    }
    setScanImportImages(imageResults);
    setScanImportParsed(parseInboundImageCodes(codes));
    setScanImportRecognizing(false);
  };

  const handleScanImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error("文件中没有可读取的工作表");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "" });
      setScanImportFileName(file.name);
      setScanImportParsed(parseInboundFileRows(rows));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "文件读取失败，请使用 Excel 或 CSV 文件");
      setScanImportFileName("");
      setScanImportParsed({ batches: [], errors: [] });
    }
  };

  const handleImportScannedBatches = () => {
    if (!ensureReceiveItemSelected()) return;
    const parsed = scanImportSource === "manual" ? parseInboundScanLines(scanImportText) : scanImportParsed;
    if (parsed.errors.length > 0) {
      message.error(`导入内容有误：第 ${parsed.errors[0].line} 行 ${parsed.errors[0].message}`);
      return;
    }
    if (parsed.batches.length === 0) {
      message.error(scanImportSource === "image" ? "请先上传包含批次号的图片" : "请先输入或导入批次明细");
      return;
    }
    const defaultSupplierName = getDefaultSupplierName();
    const conversionDefaults = getReceiveConversionDefaults(selectedReceiveItem);
    const importedBatches = parsed.batches.map((batch) => ({
      ...batch,
      ...conversionDefaults,
      supplierName: batch.supplierName || defaultSupplierName,
      actualCostMode: "PLANNED",
      actualUnitCostYuan: selectedReceiveItem?.unitCostCents == null ? undefined : selectedReceiveItem.unitCostCents / 100
    }));
    const existingBatches = ((receiveForm.getFieldValue("batches") ?? []) as ReceiveBatchFormRow[]).filter(Boolean);
    const nextBatches = scanImportMode === "replace" ? importedBatches : [...existingBatches, ...importedBatches];
    const totalQuantity = nextBatches.reduce((sum, batch) => sum + Number(batch.quantity ?? 0), 0);
    if (remainingReceiveQuantity > 0 && totalQuantity > remainingReceiveQuantity) {
      message.error(`批次数量合计不能超过剩余待入库数量 ${remainingReceiveQuantity}`);
      return;
    }
    receiveForm.setFieldsValue({ batches: nextBatches });
    resetScanImport();
    message.success(`已导入 ${importedBatches.length} 行批次明细`);
  };
  const exportPurchaseOrder = async () => {
    if (!purchaseOrder) return;
    await exportRowsToExcel(
      `purchase-order-${purchaseOrder.orderNo}.xlsx`,
      "采购订单",
      items.map((item) => {
        const details = getPurchaseInboundItemDetails(item);
        return {
          采购单号: purchaseOrder.orderNo,
          供应商: purchaseOrder.supplierName ?? "",
          采购员: getPurchaserName(purchaseOrder),
          状态: getPurchaseOrderStatusLabel(effectivePurchaseOrderStatus),
          预计到货: formatDate(purchaseOrder.expectedAt),
          产品: details.product,
          采购数量: toNumber(item.quantity),
          已入库数量: toNumber(item.receivedQuantity),
          待入库数量: Math.max(0, toNumber(item.quantity) - toNumber(item.receivedQuantity)),
          批次: details.batches
        };
      }),
      { title: `采购订单 ${purchaseOrder.orderNo}`, subtitle: "采购、到货与批次摘要" }
    );
    message.success("采购订单已导出");
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
                <Tag>{getPurchaseOrderStatusLabel(effectivePurchaseOrderStatus)}</Tag>
              </h1>
              <p>{`采购员：${getPurchaserName(purchaseOrder)} / 创建时间：${formatDateTime(purchaseOrder.createdAt)} / 预计到货：${formatDate(purchaseOrder.expectedAt)}`}</p>
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
              <Button icon={<FileTextOutlined />} disabled={items.length === 0} onClick={() => void exportPurchaseOrder()}>
                导出 Excel
              </Button>
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
                  <span>状态</span><strong>{getPurchaseOrderStatusLabel(effectivePurchaseOrderStatus)}</strong>
                  <span>供应商</span><strong>{purchaseOrder.supplierName ?? "-"}</strong>
                  <span>采购员</span><strong>{getPurchaserName(purchaseOrder)}</strong>
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
                    {
                      title: "采购含税单价",
                      render: (_, row) => row.unitCostCents == null ? "未填写" : `¥${(row.unitCostCents / 100).toFixed(2)}`
                    },
                    { title: "入库批次", render: (_, row) => getPurchaseInboundItemDetails(row).batches },
                    {
                      title: "实际入库价 / 差异",
                      render: (_, row) => {
                        const records = row.receiptCostRecords ?? [];
                        if (records.length === 0) return "尚未入库";
                        return (
                          <div className="purchase-receipt-cost-summary">
                            {records.map((record) => (
                              <div key={record.id}>
                                <span>{record.inventoryBatch?.batchNo ?? "批次"}</span>
                                <strong>{record.actualUnitCostCents == null ? "待补价" : `¥${(record.actualUnitCostCents / 100).toFixed(2)}`}</strong>
                                {record.differenceCents == null || record.differenceCents === 0
                                  ? <em>无差异</em>
                                  : <em>{record.differenceCents > 0 ? "+" : ""}¥{(record.differenceCents / 100).toFixed(2)}</em>}
                                {canManagePurchase ? (
                                  <Button
                                    type="link"
                                    size="small"
                                    onClick={() => {
                                      setEditingReceiptCost(record);
                                      receiptCostForm.setFieldsValue({
                                        actualUnitCostYuan: record.actualUnitCostCents == null ? undefined : record.actualUnitCostCents / 100,
                                        costDifferenceReason: record.differenceReason ?? "",
                                        costMode: record.actualUnitCostCents == null ? "PENDING" : "ACTUAL"
                                      });
                                    }}
                                  >
                                    修改
                                  </Button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        );
                      }
                    }
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
                <Radio.Group
                  className="purchase-receive-action-switch"
                  value={receiveActionMode}
                  onChange={(event) => setReceiveActionMode(event.target.value as ReceiveActionMode)}
                  optionType="button"
                  buttonStyle="solid"
                >
                  <Radio.Button value="receive">验收入库</Radio.Button>
                  <Radio.Button value="reject">拒收订单</Radio.Button>
                </Radio.Group>
                {!isPurchaseOrderReceivable ? (
                  <Alert
                    className="management-readonly-alert"
                    type="success"
                    showIcon
                    title="已全部入库，无需继续验收"
                    description="采购订单和入库进度已经完成，后续可在采购清单、入库批次和库存流水中查看记录。"
                  />
                ) : null}
                {receiveActionMode === "receive" ? (
                <Form
                  form={receiveForm}
                  layout="vertical"
                  initialValues={{ supplierName: purchaseOrder.supplierName ?? undefined, batches: [] }}
                  onFinish={(values: {
                    itemId: string;
                    supplierName?: string;
                    batches?: ReceiveBatchFormRow[];
                    productionDate?: unknown;
                    warehouseId?: string;
                    acceptanceNote?: string;
                  }) => {
                    const selectedItem = items.find((item) => item.id === values.itemId);
                    const remaining = getRemainingPurchaseQuantity(selectedItem);
                    const selectedWarehouse = warehouseOptions.find((warehouse) => warehouse.value === values.warehouseId);
                    if (!selectedWarehouse) {
                      message.error("请选择存放仓库");
                      return;
                    }
                    const rawBatches = values.batches ?? [];
                    if (rawBatches.some((batch) => batch.actualCostMode === "ACTUAL" && !Number.isFinite(Number(batch.actualUnitCostYuan)))) {
                      message.error("选择录入实际入库价时，请填写不小于 0 的金额");
                      return;
                    }
                    const batches = rawBatches
                      .map((batch) => ({
                        batchNo: batch.batchNo?.trim() ?? "",
                        quantity: Number(batch.quantity ?? 0),
                        unit: batch.unit,
                        baseUnit: batch.baseUnit,
                        baseQuantityPerPackage: Number(batch.baseQuantityPerPackage ?? 1),
                        supplierName: batch.supplierName?.trim() || values.supplierName?.trim() || purchaseOrder.supplierName || undefined,
                        warehouseId: values.warehouseId,
                        warehouseName: selectedWarehouse?.label,
                        idempotencyKey: crypto.randomUUID(),
                        actualUnitCostCents: batch.actualCostMode === "PENDING"
                          ? null
                          : batch.actualCostMode === "ACTUAL"
                            ? Math.round(Number(batch.actualUnitCostYuan ?? 0) * 100)
                            : undefined,
                        costDifferenceReason: batch.costDifferenceReason?.trim() || undefined
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
                    if (batches.some((batch) => batch.actualUnitCostCents !== null && batch.actualUnitCostCents !== undefined && batch.actualUnitCostCents < 0)) {
                      message.error("实际入库单价不能为负数");
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
                    <Select placeholder="选择采购明细" options={itemOptions} disabled={!isPurchaseOrderReceivable} />
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
                    <Form.Item name="warehouseId" label="存放仓库" rules={[{ required: true, message: "请选择存放仓库" }]}>
                      <Select
                        loading={warehousesQuery.isLoading}
                        placeholder="选择仓库"
                        options={warehouseOptions}
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
                        disabled={!canManagePurchase || !isPurchaseOrderReceivable}
                        onClick={() => {
                          if (!ensureReceiveItemSelected()) return;
                          const current = ((receiveForm.getFieldValue("batches") ?? []) as ReceiveBatchFormRow[]).filter(Boolean);
                          receiveForm.setFieldsValue({ batches: [...current, createEmptyBatchRow()] });
                        }}
                      >
                        手工新增批次
                      </Button>
                      <Button
                        type="default"
                        icon={<PlusOutlined />}
                        disabled={!canManagePurchase || !isPurchaseOrderReceivable}
                        onClick={handleGenerateBatchRows}
                      >
                        按剩余数量生成批次行
                      </Button>
                      <Button
                        type="default"
                        icon={<ImportOutlined />}
                        disabled={!canManagePurchase || !isPurchaseOrderReceivable}
                        onClick={handleOpenScanImport}
                      >
                        批次导入
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
                                label={index === 0 ? "包装数量" : " "}
                                rules={[{ required: true, message: "请输入数量" }]}
                              >
                                <InputNumber className="w-full" min={0.001} placeholder="数量" />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[field.name, "unit"]}
                                label={index === 0 ? "包装单位" : " "}
                                initialValue={getReceiveConversionDefaults(selectedReceiveItem).unit}
                                rules={[{ required: true, message: "请选择包装单位" }]}
                              >
                                <Select options={PRODUCT_UNIT_OPTIONS} />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[field.name, "baseUnit"]}
                                label={index === 0 ? "库存单位" : " "}
                                initialValue={getReceiveConversionDefaults(selectedReceiveItem).baseUnit}
                                rules={[{ required: true, message: "请选择库存单位" }]}
                              >
                                <Select options={PRODUCT_UNIT_OPTIONS} />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[field.name, "baseQuantityPerPackage"]}
                                label={index === 0 ? "换算率" : " "}
                                initialValue={getReceiveConversionDefaults(selectedReceiveItem).baseQuantityPerPackage}
                                rules={[{ required: true, message: "请输入换算率" }]}
                              >
                                <InputNumber className="w-full" min={0.001} placeholder="1包装=多少库存单位" />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[field.name, "actualCostMode"]}
                                label={index === 0 ? "实际价处理" : " "}
                                initialValue="PLANNED"
                              >
                                <Select
                                  options={[
                                    { value: "PLANNED", label: "默认采用采购单价" },
                                    { value: "ACTUAL", label: "录入实际入库价" },
                                    { value: "PENDING", label: "暂不录入，后补" }
                                  ]}
                                />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[field.name, "actualUnitCostYuan"]}
                                label={index === 0 ? "实际含税单价（元）" : " "}
                              >
                                <InputNumber className="w-full" min={0} precision={2} placeholder="选择后录入" />
                              </Form.Item>
                              <Form.Item
                                {...restField}
                                name={[field.name, "costDifferenceReason"]}
                                label={index === 0 ? "成本差异原因" : " "}
                              >
                                <Input placeholder="实际价不同于采购单价时必填" />
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
                  <Button block type="primary" htmlType="submit" icon={<InboxOutlined />} loading={receivePurchaseItemBatches.isPending} disabled={!canSubmitReceive}>
                    确认验收并入库
                  </Button>
                </Form>
                ) : null}

                {receiveActionMode === "reject" ? (
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
                ) : null}
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
            title="补录或修改实际入库价"
            open={Boolean(editingReceiptCost)}
            okText="保存实际入库价"
            cancelText="取消"
            confirmLoading={updateReceiptCost.isPending}
            onCancel={() => setEditingReceiptCost(null)}
            onOk={() => receiptCostForm.submit()}
            destroyOnHidden
          >
            <Alert
              type="info"
              showIcon
              message="实际价用于材料成本核算"
              description="不录入时可标记为待补价；若与采购订单含税单价不同，必须写明原因。已有出库的批次不会被直接改写，系统将保留差异记录。"
            />
            <Form
              form={receiptCostForm}
              layout="vertical"
              onFinish={(values: { costMode?: "ACTUAL" | "PENDING"; actualUnitCostYuan?: number; costDifferenceReason?: string }) => {
                const costMode = values.costMode ?? "ACTUAL";
                if (costMode === "ACTUAL" && !Number.isFinite(Number(values.actualUnitCostYuan))) {
                  message.error("请填写不小于 0 的实际入库单价");
                  return;
                }
                if (!editingReceiptCost) return;
                updateReceiptCost.mutate({
                  id: editingReceiptCost.id,
                  actualUnitCostCents: costMode === "PENDING" ? null : Math.round(Number(values.actualUnitCostYuan) * 100),
                  costDifferenceReason: values.costDifferenceReason?.trim() || undefined
                });
              }}
            >
              <Form.Item name="costMode" label="实际价状态" initialValue="ACTUAL">
                <Radio.Group optionType="button" buttonStyle="solid">
                  <Radio.Button value="ACTUAL">录入实际入库价</Radio.Button>
                  <Radio.Button value="PENDING">暂不录入，后补</Radio.Button>
                </Radio.Group>
              </Form.Item>
              <Form.Item name="actualUnitCostYuan" label="实际含税单价（元）">
                <InputNumber className="w-full" min={0} precision={2} placeholder="如 1280.00" />
              </Form.Item>
              <Form.Item name="costDifferenceReason" label="成本差异原因">
                <Input.TextArea rows={2} placeholder="实际入库价与采购订单含税单价不一致时必填" />
              </Form.Item>
            </Form>
          </Modal>
          <Modal
            title="批次导入"
            open={scanImportOpen}
            okText="导入到批次明细"
            cancelText="取消"
            onOk={handleImportScannedBatches}
            onCancel={resetScanImport}
            okButtonProps={{ disabled: scanImportRecognizing }}
            destroyOnHidden
          >
            <div className="purchase-scan-import-modal">
              <Radio.Group
                value={scanImportSource}
                onChange={(event) => setScanImportSource(event.target.value as ScanImportSource)}
                optionType="button"
                buttonStyle="solid"
                className="purchase-scan-import-source"
              >
                <Radio.Button value="image">图片识别</Radio.Button>
                <Radio.Button value="manual">手动输入</Radio.Button>
                <Radio.Button value="file">文件导入</Radio.Button>
              </Radio.Group>
              <Radio.Group
                value={scanImportMode}
                onChange={(event) => setScanImportMode(event.target.value as ScanImportMode)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="append">追加到现有批次</Radio.Button>
                <Radio.Button value="replace">覆盖当前批次</Radio.Button>
              </Radio.Group>
              {scanImportSource === "image" ? (
                <div className="purchase-scan-import-section">
                  <label>
                    <span>上传批次标签图片</span>
                    <input type="file" accept="image/*" multiple onChange={handleScanImportImages} />
                  </label>
                  {scanImportRecognizing ? <span className="purchase-scan-import-status">正在识别图片...</span> : null}
                  {scanImportImages.length > 0 ? (
                    <div className="purchase-scan-import-image-list">
                      {scanImportImages.map((image) => (
                        <div key={`${image.fileName}-${image.previewUrl}`} className="purchase-scan-import-image-item">
                          <img src={image.previewUrl} alt={image.fileName} />
                          <div>
                            <strong>{image.fileName}</strong>
                            <span>{image.error ?? `识别结果：${image.code}`}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {scanImportSource === "manual" ? (
                <label>
                  <span>手动输入</span>
                  <Input.TextArea
                    rows={5}
                    value={scanImportText}
                    onChange={(event) => setScanImportText(event.target.value)}
                    placeholder="每行：批次号 数量 供应商（供应商可选），例如 B001 1 3M"
                  />
                </label>
              ) : null}
              {scanImportSource === "file" ? (
                <div className="purchase-scan-import-section">
                  <label>
                    <span>导入 Excel/CSV 文件</span>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleScanImportFile} />
                  </label>
                  <span className="purchase-scan-import-status">
                    {scanImportFileName || "表头支持：批次号、数量、供应商；数量为空时按 1 处理"}
                  </span>
                </div>
              ) : null}
              {scanImportSource !== "manual" && (scanImportParsed.batches.length > 0 || scanImportParsed.errors.length > 0) ? (
                <div className="purchase-scan-import-preview">
                  <strong>识别/导入预览</strong>
                  <span>成功 {scanImportParsed.batches.length} 行，错误 {scanImportParsed.errors.length} 行</span>
                  {scanImportParsed.errors.slice(0, 3).map((error) => (
                    <span key={`${error.line}-${error.message}`} className="purchase-scan-import-error">
                      第 {error.line} 行：{error.message}
                    </span>
                  ))}
                </div>
              ) : null}
              <p>导入后会回填到批次明细列表，仍需人工核对批次号、数量、单位和供应商后再确认入库。</p>
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

function getReceiveConversionDefaults(item?: PurchaseOrderItemRow): Required<Pick<ReceiveBatchFormRow, "unit" | "baseUnit" | "baseQuantityPerPackage">> {
  const product = item?.product;
  const packageUnit = normalizeProductUnit(product?.unit ?? product?.salesUnit ?? product?.inventoryUnit);
  const baseUnit = normalizeProductUnit(product?.inventoryUnit ?? packageUnit);
  const baseQuantityPerPackage = packageUnit === baseUnit
    ? 1
    : toNumber(product?.metersPerRoll) || toNumber(product?.rollLengthMeters) || 1;

  return {
    unit: packageUnit,
    baseUnit,
    baseQuantityPerPackage
  };
}

function normalizeProductUnit(value?: ProductUnit | string | null): ProductUnit {
  if (
    value === "ROLL" ||
    value === "METER" ||
    value === "SQUARE_METER" ||
    value === "SQUARE_CENTIMETER" ||
    value === "PIECE"
  ) {
    return value;
  }
  return "PIECE";
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

function getEffectivePurchaseOrderStatus(status: string | undefined, items: PurchaseOrderItemRow[]) {
  if (status === "DRAFT" || status === "CANCELLED") return status;
  if (items.length === 0) return status;
  const purchasedQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const receivedQuantity = items.reduce((sum, item) => sum + toNumber(item.receivedQuantity), 0);
  if (purchasedQuantity <= 0) return status;
  if (receivedQuantity >= purchasedQuantity) return "RECEIVED";
  if (receivedQuantity > 0 && status === "ORDERED") return "PARTIAL_RECEIVED";
  return status;
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

function buildWarehouseLabel(warehouse: InventoryWarehouseSummary) {
  return [warehouse.name, warehouse.area].filter(Boolean).join(" - ");
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function formatDateTime(value?: string | null) {
  return value ? value.slice(0, 19).replace("T", " ") : "-";
}

function getPurchaserName(order?: PurchaseOrderDetail) {
  return order?.purchaser?.nickname ?? order?.purchaser?.username ?? "采购员待确认";
}
