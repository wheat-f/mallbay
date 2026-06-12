"use client";

import type { InventoryBatchSummary, InventoryMovementType, InventorySupplierSummary, ProductUnit } from "@mallbay/shared";
import type {
  CreateInventoryBatchPayload,
  CreateSupplierContactPayload,
  CreateSupplierPayload,
  CreateSupplierRatingHistoryPayload,
  UpdateSupplierPayload
} from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography } from "antd";
import { InboxOutlined, LockOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { inventoryApi, orderApi, productApi, userApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  getInventoryBatchLabel,
  getInventoryAllocationStatusLabel,
  getInventoryMovementTypeLabel,
  getInventoryOrderCustomerLabel,
  getInventoryOrderItemsSummary,
  getInventoryProductLabel,
  getInventoryOrderVehicleLabel,
  getInventoryBatchSplitSummary,
  getInventoryMovementSummary,
  getPurchaseInboundItemDetails,
  getPurchaseOrderArrivalReminder,
  getPurchaseOrderStatusLabel,
  getPurchaseRequirementItemsSummary,
  getPurchaseRequirementStatusLabel,
  getPurchaseRequirementSourceOrderLabel,
  INVENTORY_BATCH_MISSING_LABEL,
  INVENTORY_MOVEMENT_TYPE_LABEL,
  type InventoryOrderLike,
  type PurchaseInboundItemLike
} from "../../src/features/inventory/display";
import {
  buildInventoryAllocationRows,
  buildInventoryMatchRows,
  buildPurchaseRequirementFromShortages,
  filterInventoryBatches,
  type InventoryMatchInput
} from "../../src/features/inventory/matching";
import { parseInboundScanLines } from "../../src/features/inventory/inbound-scan";
import { getProductDisplayName, getProductUnitLabel } from "../../src/features/products/display";
import { getOrderStatusLabel } from "../../src/features/orders/order-display";

type MovementRow = {
  id: string;
  movementType: string;
  productId: string;
  batchId: string;
  quantity: number;
  createdAt: string;
};

type ProductOption = {
  id: string;
  brand?: string;
  name?: string;
  model?: string;
  unit?: ProductUnit;
  inventoryUnit?: ProductUnit;
  metersPerRoll?: number | string | null;
  quantityPrecision?: number | null;
};

type PurchaseRequirementRow = {
  id: string;
  status: string;
  sourceOrderId?: string;
  sourceOrder?: InventoryOrderLike | null;
  items?: Array<{
    productId?: string | null;
    requiredQuantity?: number | string | null;
    requiredUnit?: ProductUnit | string | null;
  }>;
  createdAt?: string;
};

type PurchaseOrderRow = {
  id: string;
  orderNo: string;
  status: string;
  supplierName?: string;
  expectedAt?: string;
  items?: PurchaseOrderItemRow[];
};

type PurchaseOrderItemRow = PurchaseInboundItemLike & {
  id: string;
  productId: string;
};

type SupplierFormValues = Omit<CreateSupplierPayload, "storeId">;

type SupplierEditFormValues = UpdateSupplierPayload;
type SupplierContactFormValues = CreateSupplierContactPayload;
type SupplierRatingFormValues = CreateSupplierRatingHistoryPayload;

type PendingMatchOrderRow = {
  id: string;
  orderNo: string;
  status: string;
  appointmentDate?: string;
  customer?: { name?: string; companyName?: string; contactName?: string };
  vehicle?: { plateNo?: string; model?: string; color?: string };
  items?: Array<{
    quantity?: number;
    productId?: string;
    product?: { brand?: string; name?: string; model?: string };
  }>;
};

type MovementFilterOrderRow = PendingMatchOrderRow;

type MovementOperatorRow = {
  id: string;
  username: string;
  nickname: string | null;
};

type OrderMatchResult = {
  items: Array<{
    orderItem: {
      id: string;
      productId: string;
      quantity: number;
      product?: { unit?: ProductUnit; brand?: string; name?: string; model?: string };
      inventoryAllocations?: Array<{
        lockedQuantity?: number | string;
        outboundQuantity?: number | string;
        status?: string;
      }>;
    };
    availableBatches: InventoryBatchSummary[];
  }>;
};

type SplitBatchResult = InventoryBatchSummary;

type LastSplitResult = {
  originalBatch: InventoryBatchSummary;
  childBatch: SplitBatchResult;
  quantityMeters: number;
  metersPerRoll?: number | string | null;
  quantityPrecision?: number | null;
};

type MovementFilterValues = {
  productId?: string;
  batchId?: string;
  movementType?: InventoryMovementType;
  orderId?: string;
  createdById?: string;
};

export default function InventoryPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [batchForm] = Form.useForm<CreateInventoryBatchPayload>();
  const [supplierForm] = Form.useForm<SupplierFormValues>();
  const [editSupplierForm] = Form.useForm<SupplierEditFormValues>();
  const [purchaseForm] = Form.useForm<{ productId: string; quantity: number }>();
  const [orderForm] = Form.useForm<{ orderId: string }>();
  const [movementFilterForm] = Form.useForm<MovementFilterValues>();
  const [allocationForm] = Form.useForm<{ allocations: Array<{ batchId: string; quantity: number }> }>();
  const [splitForm] = Form.useForm<{ batchId: string; quantityMeters: number }>();
  const [stockForm] = Form.useForm<{ batchId: string; movementType: "COUNT_IN" | "COUNT_OUT" | "DAMAGE_OUT" | "TRANSFER_IN" | "TRANSFER_OUT" | "RETURN_IN" | "RETURN_OUT"; quantity: number; note?: string }>();
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [activeInventoryTab, setActiveInventoryTab] = useState("pending-orders");
  const [batchSearchByOrderItem, setBatchSearchByOrderItem] = useState<Record<string, string>>({});
  const [movementFilters, setMovementFilters] = useState<MovementFilterValues>({});
  const [operatorKeyword, setOperatorKeyword] = useState("");
  const [lastSplitResult, setLastSplitResult] = useState<LastSplitResult | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<InventorySupplierSummary | null>(null);

  const productsQuery = useQuery({
    queryKey: ["inventory-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, pageSize: 100 }),
    enabled: Boolean(storeId)
  });

  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", storeId],
    queryFn: () => inventoryApi.batches({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const suppliersQuery = useQuery({
    queryKey: ["inventory-suppliers", storeId],
    queryFn: () => inventoryApi.suppliers(storeId!),
    enabled: Boolean(storeId)
  });
  const movementsQuery = useQuery({
    queryKey: ["inventory-movements", storeId, movementFilters],
    queryFn: () => inventoryApi.movements({ storeId: storeId!, ...movementFilters }),
    enabled: Boolean(storeId)
  });
  const movementOrdersQuery = useQuery({
    queryKey: ["inventory-movement-orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const movementOperatorsQuery = useQuery({
    queryKey: ["inventory-movement-operators", operatorKeyword],
    queryFn: () => userApi.searchUsers(operatorKeyword.trim()),
    enabled: operatorKeyword.trim().length > 0
  });
  const purchaseOrdersQuery = useQuery({
    queryKey: ["purchase-orders", storeId],
    queryFn: () => inventoryApi.purchaseOrders(storeId!),
    enabled: Boolean(storeId)
  });
  const purchaseRequirementsQuery = useQuery({
    queryKey: ["purchase-requirements", storeId],
    queryFn: () => inventoryApi.purchaseRequirements(storeId!),
    enabled: Boolean(storeId)
  });
  const pendingOrdersQuery = useQuery({
    queryKey: ["inventory-pending-match-orders", storeId],
    queryFn: () => inventoryApi.pendingMatchOrders(storeId!),
    enabled: Boolean(storeId)
  });
  const orderMatchQuery = useQuery({
    queryKey: ["inventory-order-match", selectedOrderId],
    queryFn: () => inventoryApi.orderMatch(selectedOrderId!),
    enabled: Boolean(selectedOrderId)
  });

  const productItems = (productsQuery.data?.items ?? []) as ProductOption[];
  const productMap = useMemo(
    () => new Map(productItems.map((product) => [product.id, product])),
    [productItems]
  );
  const productOptions = productItems.map((product) => ({
    value: product.id,
    label: getProductDisplayName(product) || product.id
  }));
  const batchMap = useMemo(
    () => new Map((batchesQuery.data ?? []).map((batch) => [batch.id, batch])),
    [batchesQuery.data]
  );
  const batchOptions = (batchesQuery.data ?? []).map((batch) => ({
    value: batch.id,
    label: getInventoryBatchLabel(batch, productMap)
  }));
  const movementTypeOptions = (Object.entries(INVENTORY_MOVEMENT_TYPE_LABEL) as Array<[InventoryMovementType, string]>).map(
    ([value, label]) => ({ value, label })
  );
  const pendingOrderOptions = ((pendingOrdersQuery.data ?? []) as PendingMatchOrderRow[]).map((order) => ({
    value: order.id,
    label: `${order.orderNo} · ${getInventoryOrderCustomerLabel(order)} · ${getInventoryOrderItemsSummary(order)}`
  }));
  const movementOrderOptions = ((movementOrdersQuery.data?.items ?? []) as MovementFilterOrderRow[]).map((order) => ({
    value: order.id,
    label: `${order.orderNo} · ${getInventoryOrderCustomerLabel(order)} · ${getInventoryOrderItemsSummary(order)}`
  }));
  const sourceOrderMap = useMemo(
    () => new Map(((movementOrdersQuery.data?.items ?? []) as InventoryOrderLike[]).map((order) => [order.id ?? "", order])),
    [movementOrdersQuery.data]
  );
  const movementOperatorOptions = ((movementOperatorsQuery.data ?? []) as MovementOperatorRow[]).map((operator) => ({
    value: operator.id,
    label: [operator.nickname, `@${operator.username}`].filter(Boolean).join(" ")
  }));
  const matchRows = buildInventoryMatchRows(orderMatchQuery.data as InventoryMatchInput | undefined);
  const allocationRows = buildInventoryAllocationRows(orderMatchQuery.data as InventoryMatchInput | undefined);
  const shortageRows = matchRows.filter((row) => row.shortageQuantity > 0);
  const movementRows = (movementsQuery.data ?? []) as MovementRow[];
  const movementSummary = getInventoryMovementSummary(movementRows);

  const createBatch = useMutation({
    mutationFn: (values: CreateInventoryBatchPayload) => inventoryApi.createBatch({ ...values, storeId: storeId! }),
    onSuccess: async () => {
      message.success("批次已入库");
      batchForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createSupplier = useMutation({
    mutationFn: (values: SupplierFormValues) => inventoryApi.createSupplier({ ...values, storeId: storeId! }),
    onSuccess: async () => {
      message.success("供应商已保存");
      supplierForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["inventory-suppliers", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const updateSupplier = useMutation({
    mutationFn: (values: SupplierEditFormValues) => inventoryApi.updateSupplier(editingSupplier!.id!, values),
    onSuccess: async () => {
      message.success("供应商已更新");
      setEditingSupplier(null);
      editSupplierForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["inventory-suppliers", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createSupplierContact = useMutation({
    mutationFn: (values: SupplierContactFormValues & { supplierId: string }) =>
      inventoryApi.createSupplierContact(values.supplierId, {
        name: values.name,
        phone: values.phone,
        role: values.role,
        isPrimary: values.isPrimary
      }),
    onSuccess: async () => {
      message.success("联系人已保存");
      await queryClient.invalidateQueries({ queryKey: ["inventory-suppliers", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createSupplierRatingHistory = useMutation({
    mutationFn: (values: SupplierRatingFormValues & { supplierId: string }) =>
      inventoryApi.createSupplierRatingHistory(values.supplierId, {
        rating: values.rating,
        note: values.note
      }),
    onSuccess: async () => {
      message.success("评级历史已保存");
      await queryClient.invalidateQueries({ queryKey: ["inventory-suppliers", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const openSupplierEditor = (supplier: InventorySupplierSummary) => {
    setEditingSupplier(supplier);
    editSupplierForm.setFieldsValue({
      name: supplier.name,
      contactName: supplier.contactName ?? undefined,
      contactPhone: supplier.contactPhone ?? undefined,
      rating: supplier.rating ?? undefined,
      note: supplier.note ?? undefined,
      isActive: supplier.isActive ?? true
    });
  };

  const createPurchaseRequirement = useMutation({
    mutationFn: (values: { productId: string; quantity: number }) => {
      const product = productItems.find((item) => item.id === values.productId);
      return inventoryApi.createPurchaseRequirement({
        storeId: storeId!,
        items: [
          {
            productId: values.productId,
            requiredQuantity: values.quantity,
            requiredUnit: product?.inventoryUnit ?? product?.unit ?? "ROLL"
          }
        ]
      });
    },
    onSuccess: async () => {
      message.success("采购需求已创建");
      purchaseForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["purchase-requirements", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createShortagePurchaseRequirement = useMutation({
    mutationFn: () => {
      if (!storeId || !selectedOrderId || shortageRows.length === 0) {
        throw new Error("当前订单没有缺货明细");
      }
      return inventoryApi.createPurchaseRequirement(
        buildPurchaseRequirementFromShortages(storeId, selectedOrderId, matchRows)
      );
    },
    onSuccess: async () => {
      message.success("缺货采购需求已创建");
      await queryClient.invalidateQueries({ queryKey: ["purchase-requirements", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createPurchaseOrderFromRequirement = useMutation({
    mutationFn: (id: string) => inventoryApi.createPurchaseOrderFromRequirement(id, {}),
    onSuccess: async () => {
      message.success("采购订单已生成");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-requirements", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const receivePurchaseItem = useMutation({
    mutationFn: (values: { itemId: string; quantity: number; batchNo: string; supplierName?: string }) =>
      inventoryApi.receivePurchaseItem(values.itemId, {
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
      inventoryApi.receivePurchaseItemBatches(values.itemId, values.batches),
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
    mutationFn: (id: string) => inventoryApi.approvePurchaseOrder(id),
    onSuccess: async () => {
      message.success("采购订单已审批通过");
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const cancelPurchaseOrder = useMutation({
    mutationFn: (values: { id: string; reason: string }) =>
      inventoryApi.cancelPurchaseOrder(values.id, { reason: values.reason }),
    onSuccess: async () => {
      message.success("采购订单已取消");
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const lockOrder = useMutation({
    mutationFn: (values: { orderId: string }) => inventoryApi.lockOrder(values.orderId),
    onSuccess: async () => {
      message.success("订单库存匹配完成");
      orderForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const outboundSelectedOrder = useMutation({
    mutationFn: () => inventoryApi.outboundOrder(selectedOrderId!),
    onSuccess: async () => {
      message.success("订单库存已出库");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-order-match", selectedOrderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const releaseSelectedOrder = useMutation({
    mutationFn: () => inventoryApi.releaseOrder(selectedOrderId!),
    onSuccess: async () => {
      message.success("订单锁定库存已释放");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-order-match", selectedOrderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const handleSelectedOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    setBatchSearchByOrderItem({});
  };

  const traceBatchMovements = (batch: InventoryBatchSummary) => {
    movementFilterForm.setFieldsValue({ batchId: batch.id });
    setMovementFilters({ batchId: batch.id });
    setActiveInventoryTab("movements");
  };

  const handleCancelPurchaseOrder = (id: string) => {
    const reason = window.prompt("请输入取消原因");
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      message.error("请输入取消原因");
      return;
    }
    cancelPurchaseOrder.mutate({ id, reason: trimmedReason });
  };

  const createOrderAllocations = useMutation({
    mutationFn: (values: { allocations: Array<{ batchId: string; quantity: number }> }) => {
      return inventoryApi.createOrderAllocations(selectedOrderId!, {
        allocations: values.allocations.map((allocation, index) => ({
          orderItemId: matchRows[index].orderItemId,
          batchId: allocation.batchId,
          quantity: allocation.quantity
        }))
      });
    },
    onSuccess: async () => {
      message.success("批次已锁定");
      allocationForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-order-match", selectedOrderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const splitBatch = useMutation({
    mutationFn: (values: { batchId: string; quantityMeters: number }) =>
      inventoryApi.splitBatch(values.batchId, { quantityMeters: values.quantityMeters }),
    onSuccess: async (childBatch, values) => {
      const originalBatch = batchMap.get(values.batchId);
      const product = originalBatch ? productMap.get(originalBatch.productId) : undefined;
      if (originalBatch) {
        setLastSplitResult({
          originalBatch,
          childBatch: childBatch as SplitBatchResult,
          quantityMeters: values.quantityMeters,
          metersPerRoll: product?.metersPerRoll,
          quantityPrecision: product?.quantityPrecision
        });
      }
      message.success("批次已拆分");
      splitForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createStockOperation = useMutation({
    mutationFn: (values: { batchId: string; movementType: "COUNT_IN" | "COUNT_OUT" | "DAMAGE_OUT" | "TRANSFER_IN" | "TRANSFER_OUT" | "RETURN_IN" | "RETURN_OUT"; quantity: number; note?: string }) =>
      inventoryApi.createStockOperation(values),
    onSuccess: async () => {
      message.success("出入库已记录");
      stockForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title="库存采购" description="管理产品批次、采购需求、订单锁库和库存流水" />

        <Tabs
          activeKey={activeInventoryTab}
          onChange={setActiveInventoryTab}
          items={[
            {
              key: "pending-orders",
              label: "待匹配订单",
              children: (
                <>
                  <Table<PendingMatchOrderRow>
                    rowKey="id"
                    loading={pendingOrdersQuery.isLoading}
                    dataSource={(pendingOrdersQuery.data ?? []) as PendingMatchOrderRow[]}
                    columns={[
                      { title: "订单号", dataIndex: "orderNo" },
                      { title: "客户", render: (_, row) => getInventoryOrderCustomerLabel(row) },
                      { title: "车辆", render: (_, row) => getInventoryOrderVehicleLabel(row) },
                      { title: "产品明细", render: (_, row) => getInventoryOrderItemsSummary(row) },
                      { title: "状态", render: (_, row) => <Tag>{getOrderStatusLabel(row.status)}</Tag> },
                      { title: "预约日期", render: (_, row) => row.appointmentDate?.slice(0, 10) ?? "-" },
                      {
                        title: "操作",
                        render: (_, row) => (
                          <>
                            <Button size="small" onClick={() => lockOrder.mutate({ orderId: row.id })} loading={lockOrder.isPending}>
                              匹配库存
                            </Button>
                            <Button size="small" className="ml-2" onClick={() => handleSelectedOrderChange(row.id)}>
                              选择批次
                            </Button>
                          </>
                        )
                      }
                    ]}
                  />
                  {selectedOrderId ? (
                    <div className="mt-6">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <Typography.Title level={5} className="!mb-0">批次锁定</Typography.Title>
                        <Button
                          icon={<ShoppingCartOutlined />}
                          disabled={shortageRows.length === 0}
                          loading={createShortagePurchaseRequirement.isPending}
                          onClick={() => createShortagePurchaseRequirement.mutate()}
                        >
                          为缺货生成采购需求
                        </Button>
                      </div>
                      <Form form={allocationForm} layout="vertical" onFinish={(values) => createOrderAllocations.mutate(values)}>
                        {matchRows.map((row, index) => (
                          <div key={row.orderItemId} className="mb-4 rounded border border-gray-200 bg-white p-3">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <Typography.Text strong>{row.productLabel}</Typography.Text>
                              <Tag>需求 {row.requiredQuantity} {getProductUnitLabel(row.unit)}</Tag>
                              <Tag color={row.lockedQuantity > 0 ? "processing" : "default"}>已锁 {row.lockedQuantity}</Tag>
                              <Tag color={row.availableQuantity > 0 ? "success" : "default"}>可用 {row.availableQuantity}</Tag>
                              <Tag color={row.shortageQuantity > 0 ? "error" : "success"}>缺口 {row.shortageQuantity}</Tag>
                            </div>
                            <Space className="w-full" align="baseline" wrap>
                            <Input
                              className="min-w-56"
                              allowClear
                              placeholder="扫描或输入批次号"
                              value={batchSearchByOrderItem[row.orderItemId] ?? ""}
                              onChange={(event) =>
                                setBatchSearchByOrderItem((current) => ({
                                  ...current,
                                  [row.orderItemId]: event.target.value
                                }))
                              }
                            />
                            <Form.Item name={["allocations", index, "batchId"]} rules={[{ required: true, message: "请选择批次" }]} className="!mb-0">
                              <Select
                                className="min-w-60"
                                placeholder="批次"
                                options={filterInventoryBatches(
                                  row.availableBatches,
                                  batchSearchByOrderItem[row.orderItemId]
                                ).map((batch) => ({
                                  value: batch.id,
                                  label: `${batch.batchNo} · 可用 ${batch.availableQuantity}`
                                }))}
                              />
                            </Form.Item>
                            <Form.Item name={["allocations", index, "quantity"]} rules={[{ required: true, message: "请输入数量" }]} className="!mb-0">
                              <InputNumber min={0.001} max={row.availableQuantity || undefined} placeholder="锁定数量" />
                            </Form.Item>
                            </Space>
                          </div>
                        ))}
                        <Button type="primary" htmlType="submit" loading={createOrderAllocations.isPending || orderMatchQuery.isLoading}>
                          确认锁定
                        </Button>
                      </Form>
                      <div className="mt-6">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <Typography.Title level={5} className="!mb-0">已锁批次</Typography.Title>
                          <Space>
                            <Button
                              disabled={allocationRows.length === 0}
                              loading={outboundSelectedOrder.isPending}
                              onClick={() => outboundSelectedOrder.mutate()}
                            >
                              确认出库
                            </Button>
                            <Button
                              danger
                              disabled={allocationRows.length === 0}
                              loading={releaseSelectedOrder.isPending}
                              onClick={() => releaseSelectedOrder.mutate()}
                            >
                              释放锁库
                            </Button>
                          </Space>
                        </div>
                        <Table
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={allocationRows}
                          columns={[
                            { title: "产品", dataIndex: "productLabel" },
                            { title: "批次", dataIndex: "batchLabel" },
                            { title: "锁定数量", dataIndex: "lockedQuantity" },
                            { title: "已出库", dataIndex: "outboundQuantity" },
                            { title: "剩余锁定", dataIndex: "remainingQuantity" },
                            { title: "状态", render: (_, row) => <Tag>{getInventoryAllocationStatusLabel(row.status)}</Tag> }
                          ]}
                        />
                      </div>
                    </div>
                  ) : null}
                </>
              )
            },
            {
              key: "suppliers",
              label: "供应商档案",
              children: (
                <>
                  <Form form={supplierForm} layout="inline" className="mb-4" onFinish={(values) => createSupplier.mutate(values)}>
                    <Form.Item name="name" rules={[{ required: true, message: "请输入供应商名称" }]}>
                      <Input placeholder="供应商名称" />
                    </Form.Item>
                    <Form.Item name="contactName">
                      <Input placeholder="联系人" />
                    </Form.Item>
                    <Form.Item name="contactPhone">
                      <Input placeholder="联系电话" />
                    </Form.Item>
                    <Form.Item name="rating">
                      <InputNumber min={1} max={5} placeholder="评级" />
                    </Form.Item>
                    <Form.Item name="note">
                      <Input placeholder="备注" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={createSupplier.isPending}>
                      新增供应商
                    </Button>
                  </Form>

                  <Table<InventorySupplierSummary>
                    rowKey={(row) => row.id ?? row.name}
                    loading={suppliersQuery.isLoading}
                    dataSource={suppliersQuery.data ?? []}
                    columns={[
                      { title: "供应商", dataIndex: "name" },
                      { title: "联系人", render: (_, row) => row.contactName ?? "-" },
                      { title: "联系电话", render: (_, row) => row.contactPhone ?? "-" },
                      { title: "评级", render: (_, row) => row.rating ?? "-" },
                      { title: "联系人档案", render: (_, row) => row.contacts?.length ?? 0 },
                      { title: "评级历史", render: (_, row) => row.ratingHistory?.length ?? 0 },
                      { title: "采购单", dataIndex: "purchaseOrderCount" },
                      { title: "批次数", dataIndex: "batchCount" },
                      { title: "启用", render: (_, row) => row.isActive === false ? "停用" : "启用" },
                      {
                        title: "操作",
                        render: (_, row) => (
                          <Button size="small" disabled={!row.id} onClick={() => openSupplierEditor(row)}>
                            编辑供应商
                          </Button>
                        )
                      }
                    ]}
                    expandable={{
                      expandedRowRender: (row) => row.id ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="rounded border border-gray-200 bg-white p-3">
                            <Typography.Title level={5} className="!mt-0">联系人档案</Typography.Title>
                            <Space direction="vertical" className="mb-3 w-full">
                              {(row.contacts ?? []).map((contact) => (
                                <Typography.Text key={contact.id}>
                                  {contact.isPrimary ? "主要 · " : ""}
                                  {contact.name}
                                  {contact.phone ? ` / ${contact.phone}` : ""}
                                  {contact.role ? ` / ${contact.role}` : ""}
                                </Typography.Text>
                              ))}
                              {(row.contacts?.length ?? 0) === 0 ? <Typography.Text type="secondary">暂无联系人</Typography.Text> : null}
                            </Space>
                            <Form
                              layout="inline"
                              onFinish={(values: SupplierContactFormValues) =>
                                createSupplierContact.mutate({ supplierId: row.id!, ...values })
                              }
                            >
                              <Form.Item name="name" rules={[{ required: true, message: "请输入联系人" }]}>
                                <Input placeholder="联系人" />
                              </Form.Item>
                              <Form.Item name="phone">
                                <Input placeholder="电话" />
                              </Form.Item>
                              <Form.Item name="role">
                                <Input placeholder="角色" />
                              </Form.Item>
                              <Form.Item name="isPrimary" valuePropName="checked">
                                <Switch checkedChildren="主要" unCheckedChildren="普通" />
                              </Form.Item>
                              <Button htmlType="submit" loading={createSupplierContact.isPending}>
                                新增联系人
                              </Button>
                            </Form>
                          </div>
                          <div className="rounded border border-gray-200 bg-white p-3">
                            <Typography.Title level={5} className="!mt-0">评级历史</Typography.Title>
                            <Space direction="vertical" className="mb-3 w-full">
                              {(row.ratingHistory ?? []).map((history) => (
                                <Typography.Text key={history.id}>
                                  {history.rating} 星
                                  {history.note ? ` / ${history.note}` : ""}
                                </Typography.Text>
                              ))}
                              {(row.ratingHistory?.length ?? 0) === 0 ? <Typography.Text type="secondary">暂无评级历史</Typography.Text> : null}
                            </Space>
                            <Form
                              layout="inline"
                              onFinish={(values: SupplierRatingFormValues) =>
                                createSupplierRatingHistory.mutate({ supplierId: row.id!, ...values })
                              }
                            >
                              <Form.Item name="rating" rules={[{ required: true, message: "请选择评级" }]}>
                                <InputNumber min={1} max={5} placeholder="评级" />
                              </Form.Item>
                              <Form.Item name="note">
                                <Input placeholder="评级说明" />
                              </Form.Item>
                              <Button htmlType="submit" loading={createSupplierRatingHistory.isPending}>
                                追加评级
                              </Button>
                            </Form>
                          </div>
                        </div>
                      ) : (
                        <Typography.Text type="secondary">历史供应商快照不可维护联系人和评级历史</Typography.Text>
                      )
                    }}
                  />
                </>
              )
            },
            {
              key: "batches",
              label: "库存批次",
              children: (
                <>
                  <Form form={batchForm} layout="inline" className="mb-4" onFinish={(values) => createBatch.mutate(values)}>
                    <Form.Item name="productId" rules={[{ required: true, message: "请选择产品" }]}>
                      <Select className="min-w-64" placeholder="产品" options={productOptions} showSearch optionFilterProp="label" />
                    </Form.Item>
                    <Form.Item name="batchNo" rules={[{ required: true, message: "请输入批次号" }]}>
                      <Input placeholder="批次号" />
                    </Form.Item>
                    <Form.Item name="supplierName">
                      <Input placeholder="供应商" />
                    </Form.Item>
                    <Form.Item name="totalQuantity" rules={[{ required: true, message: "请输入数量" }]}>
                      <InputNumber min={1} placeholder="数量" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<InboxOutlined />} loading={createBatch.isPending}>
                      入库
                    </Button>
                  </Form>

                  <Table<InventoryBatchSummary>
                    rowKey="id"
                    loading={batchesQuery.isLoading}
                    dataSource={batchesQuery.data ?? []}
                    columns={[
                      { title: "批次号", dataIndex: "batchNo" },
                      { title: "产品", render: (_, row) => getInventoryProductLabel(row.productId, productMap) },
                      { title: "供应商", dataIndex: "supplierName" },
                      { title: "总量", dataIndex: "totalQuantity" },
                      { title: "可用", dataIndex: "availableQuantity" },
                      { title: "已锁", dataIndex: "lockedQuantity" },
                      {
                        title: "操作",
                        render: (_, row) => (
                          <Button size="small" onClick={() => traceBatchMovements(row)}>
                            批次追溯
                          </Button>
                        )
                      }
                    ]}
                  />
                </>
              )
            },
            {
              key: "purchase",
              label: "采购需求",
              children: (
                <>
                  <Form form={purchaseForm} layout="inline" className="mb-4" onFinish={(values) => createPurchaseRequirement.mutate(values)}>
                    <Form.Item name="productId" rules={[{ required: true, message: "请选择产品" }]}>
                      <Select className="min-w-64" placeholder="产品" options={productOptions} showSearch optionFilterProp="label" />
                    </Form.Item>
                    <Form.Item name="quantity" rules={[{ required: true, message: "请输入采购数量" }]}>
                      <InputNumber min={1} placeholder="数量" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<ShoppingCartOutlined />} loading={createPurchaseRequirement.isPending}>
                      创建采购需求
                    </Button>
                  </Form>

                  <Table
                    rowKey="id"
                    loading={purchaseRequirementsQuery.isLoading}
                    dataSource={(purchaseRequirementsQuery.data ?? []) as PurchaseRequirementRow[]}
                    columns={[
                      { title: "需求明细", render: (_, row) => getPurchaseRequirementItemsSummary(row, productMap) },
                      { title: "来源订单", render: (_, row) => getPurchaseRequirementSourceOrderLabel(row, sourceOrderMap) },
                      { title: "状态", render: (_, row) => <Tag>{getPurchaseRequirementStatusLabel(row.status)}</Tag> },
                      {
                        title: "操作",
                        render: (_, row) => (
                          <Button size="small" onClick={() => createPurchaseOrderFromRequirement.mutate(row.id)}>
                            生成采购单
                          </Button>
                        )
                      }
                    ]}
                  />

                  <Typography.Title level={5} className="!mt-6">采购订单</Typography.Title>
                  <Table
                    rowKey="id"
                    loading={purchaseOrdersQuery.isLoading}
                    dataSource={(purchaseOrdersQuery.data ?? []) as PurchaseOrderRow[]}
                    columns={[
                      { title: "采购单号", dataIndex: "orderNo" },
                      { title: "供应商", dataIndex: "supplierName" },
                      { title: "状态", render: (_, row: PurchaseOrderRow) => <Tag>{getPurchaseOrderStatusLabel(row.status)}</Tag> },
                      {
                        title: "预计到货",
                        render: (_, row: PurchaseOrderRow) => row.expectedAt?.slice(0, 10) ?? "-"
                      },
                      {
                        title: "到货提醒",
                        render: (_, row: PurchaseOrderRow) => {
                          const reminder = getPurchaseOrderArrivalReminder(row);
                          const isRisk = reminder.includes("逾期") || reminder.includes("今日") || reminder.includes("未设置");
                          return <Tag color={isRisk ? "warning" : "default"}>{reminder}</Tag>;
                        }
                      },
                      {
                        title: "采购明细",
                        render: (_, row: PurchaseOrderRow) => `${row.items?.length ?? 0} 项`
                      },
                      {
                        title: "操作",
                        render: (_, row: PurchaseOrderRow) => (
                          <Space>
                            {row.status === "DRAFT" ? (
                              <Button
                                size="small"
                                loading={approvePurchaseOrder.isPending}
                                onClick={() => approvePurchaseOrder.mutate(row.id)}
                              >
                                审批通过
                              </Button>
                            ) : null}
                            {row.status === "DRAFT" || row.status === "ORDERED" ? (
                              <Button
                                size="small"
                                danger
                                loading={cancelPurchaseOrder.isPending}
                                onClick={() => handleCancelPurchaseOrder(row.id)}
                              >
                                取消采购单
                              </Button>
                            ) : null}
                          </Space>
                        )
                      }
                    ]}
                    expandable={{
                      expandedRowRender: (row: PurchaseOrderRow) => (
                        <Space direction="vertical" className="w-full" size="middle">
                          {(row.items ?? []).map((item) => {
                            const details = getPurchaseInboundItemDetails(item);
                            return (
                              <div key={item.id} className="rounded border border-gray-200 bg-white p-3">
                                <div className="mb-2 grid gap-2 md:grid-cols-2">
                                  <Typography.Text><strong>产品：</strong>{details.product}</Typography.Text>
                                  <Typography.Text><strong>类别：</strong>{details.category}</Typography.Text>
                                  <Typography.Text><strong>规格：</strong>{details.specification}</Typography.Text>
                                  <Typography.Text><strong>质保：</strong>{details.warranty}</Typography.Text>
                                  <Typography.Text><strong>数量：</strong>{details.quantity}</Typography.Text>
                                  <Typography.Text><strong>入库批次：</strong>{details.batches}</Typography.Text>
                                </div>
                                <Form
                                  layout="inline"
                                  initialValues={{ supplierName: row.supplierName }}
                                  onFinish={(values: { batchNo: string; quantity: number; supplierName?: string }) =>
                                    receivePurchaseItem.mutate({ itemId: item.id, ...values })
                                  }
                                >
                                  <Form.Item name="batchNo" rules={[{ required: true, message: "请输入批次号" }]}>
                                    <Input placeholder="批次号" />
                                  </Form.Item>
                                  <Form.Item name="quantity" rules={[{ required: true, message: "请输入入库数量" }]}>
                                    <InputNumber min={0.001} placeholder="入库数量" />
                                  </Form.Item>
                                  <Form.Item name="supplierName">
                                    <Input placeholder="供应商" />
                                  </Form.Item>
                                  <Button htmlType="submit" loading={receivePurchaseItem.isPending}>
                                    到货入库
                                  </Button>
                                </Form>
                                <Form
                                  layout="vertical"
                                  className="mt-3"
                                  onFinish={(values: { scanText: string }) => {
                                    const parsed = parseInboundScanLines(values.scanText);
                                    if (parsed.errors.length > 0) {
                                      message.error(`扫码内容有误：第 ${parsed.errors[0].line} 行 ${parsed.errors[0].message}`);
                                      return;
                                    }
                                    if (parsed.batches.length === 0) {
                                      message.error("请粘贴或扫描入库批次");
                                      return;
                                    }
                                    receivePurchaseItemBatches.mutate({ itemId: item.id, batches: parsed.batches });
                                  }}
                                >
                                  <Form.Item name="scanText" label="批量扫码入库">
                                    <Input.TextArea
                                      rows={3}
                                      placeholder="每行：批次号 数量 供应商（供应商可选），例如 B001 1 3M"
                                    />
                                  </Form.Item>
                                  <Button htmlType="submit" loading={receivePurchaseItemBatches.isPending}>
                                    批量入库
                                  </Button>
                                </Form>
                              </div>
                            );
                          })}
                        </Space>
                      )
                    }}
                  />
                </>
              )
            },
            {
              key: "movements",
              label: "锁库与流水",
              children: (
                <>
                  <Form form={orderForm} layout="inline" className="mb-4" onFinish={(values) => lockOrder.mutate(values)}>
                    <Form.Item name="orderId" rules={[{ required: true, message: "请选择订单" }]}>
                      <Select className="min-w-80" placeholder="待匹配订单" options={pendingOrderOptions} showSearch optionFilterProp="label" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<LockOutlined />} loading={lockOrder.isPending}>
                      匹配库存
                    </Button>
                  </Form>

                  <Form
                    form={movementFilterForm}
                    layout="vertical"
                    className="mb-4 rounded border border-gray-200 bg-white p-4"
                    onFinish={(values) => setMovementFilters(values)}
                  >
                    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                      <Form.Item name="productId" label="产品">
                        <Select
                          allowClear
                          placeholder="全部产品"
                          options={productOptions}
                          showSearch
                          optionFilterProp="label"
                        />
                      </Form.Item>
                      <Form.Item name="batchId" label="批次">
                        <Select
                          allowClear
                          placeholder="全部批次"
                          options={batchOptions}
                          showSearch
                          optionFilterProp="label"
                        />
                      </Form.Item>
                      <Form.Item name="movementType" label="流水类型">
                        <Select allowClear placeholder="全部类型" options={movementTypeOptions} />
                      </Form.Item>
                      <Form.Item name="orderId" label="订单">
                        <Select
                          allowClear
                          showSearch
                          optionFilterProp="label"
                          loading={movementOrdersQuery.isLoading}
                          placeholder="选择订单"
                          options={movementOrderOptions}
                        />
                      </Form.Item>
                      <Form.Item name="createdById" label="操作人">
                        <Select
                          allowClear
                          showSearch
                          filterOption={false}
                          loading={movementOperatorsQuery.isLoading}
                          onSearch={setOperatorKeyword}
                          placeholder="搜索操作人"
                          options={movementOperatorOptions}
                        />
                      </Form.Item>
                    </div>
                    <Space>
                      <Button type="primary" htmlType="submit">
                        查询流水
                      </Button>
                      <Button
                        onClick={() => {
                          movementFilterForm.resetFields();
                          setMovementFilters({});
                        }}
                      >
                        重置
                      </Button>
                    </Space>
                  </Form>

                  <div className="mb-4">
                    <Typography.Title level={5}>流水统计</Typography.Title>
                    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                      {[
                        ["入库合计", movementSummary.inbound],
                        ["出库合计", movementSummary.outbound],
                        ["锁定合计", movementSummary.locked],
                        ["释放合计", movementSummary.released],
                        ["调整合计", movementSummary.adjustments],
                        ["流水条数", movementSummary.totalRows]
                      ].map(([label, value]) => (
                        <div key={label} className="rounded border border-gray-200 bg-white px-3 py-2">
                          <Typography.Text type="secondary">{label}</Typography.Text>
                          <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Table<MovementRow>
                    rowKey="id"
                    loading={movementsQuery.isLoading}
                    dataSource={movementRows}
                    columns={[
                      { title: "类型", render: (_, row) => getInventoryMovementTypeLabel(row.movementType) },
                      { title: "产品", render: (_, row) => getInventoryProductLabel(row.productId, productMap) },
                      {
                        title: "批次",
                        render: (_, row) => {
                          const batch = batchMap.get(row.batchId);
                          return batch ? getInventoryBatchLabel(batch, productMap) : INVENTORY_BATCH_MISSING_LABEL;
                        }
                      },
                      { title: "数量", dataIndex: "quantity" },
                      { title: "时间", render: (_, row) => row.createdAt?.slice(0, 19).replace("T", " ") }
                    ]}
                  />
                </>
              )
            }
            ,
            {
              key: "split",
              label: "批次拆分",
              children: (
                <>
                  <Form form={splitForm} layout="inline" onFinish={(values) => splitBatch.mutate(values)}>
                    <Form.Item name="batchId" rules={[{ required: true, message: "请选择批次" }]}>
                      <Select className="min-w-80" placeholder="批次" options={batchOptions} showSearch optionFilterProp="label" />
                    </Form.Item>
                    <Form.Item name="quantityMeters" rules={[{ required: true, message: "请输入拆分米数" }]}>
                      <InputNumber min={0.001} placeholder="拆分米数" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={splitBatch.isPending}>
                      拆分
                    </Button>
                  </Form>
                  {lastSplitResult ? (
                    <div className="mt-4 rounded border border-blue-100 bg-blue-50 p-4">
                      <Typography.Title level={5} className="!mt-0">最近拆分结果</Typography.Title>
                      {Object.values(getInventoryBatchSplitSummary(lastSplitResult)).map((line) => (
                        <Typography.Paragraph key={line} className="!mb-1">
                          {line}
                        </Typography.Paragraph>
                      ))}
                    </div>
                  ) : null}
                </>
              )
            },
            {
              key: "stock-operations",
              label: "其他出入库",
              children: (
                <Form form={stockForm} layout="inline" onFinish={(values) => createStockOperation.mutate(values)}>
                  <Form.Item name="batchId" rules={[{ required: true, message: "请选择批次" }]}>
                    <Select className="min-w-80" placeholder="批次" options={batchOptions} showSearch optionFilterProp="label" />
                  </Form.Item>
                  <Form.Item name="movementType" rules={[{ required: true, message: "请选择类型" }]}>
                    <Select
                      className="min-w-40"
                      placeholder="类型"
                      options={[
                        { value: "COUNT_IN", label: "盘点入库" },
                        { value: "COUNT_OUT", label: "盘点出库" },
                        { value: "DAMAGE_OUT", label: "报损出库" },
                        { value: "TRANSFER_IN", label: "调拨入库" },
                        { value: "TRANSFER_OUT", label: "调拨出库" },
                        { value: "RETURN_IN", label: "退货入库" },
                        { value: "RETURN_OUT", label: "退货出库" }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="quantity" rules={[{ required: true, message: "请输入数量" }]}>
                    <InputNumber min={0.001} placeholder="数量" />
                  </Form.Item>
                  <Form.Item name="note">
                    <Input placeholder="备注" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={createStockOperation.isPending}>
                    记录
                  </Button>
                </Form>
              )
            }
          ]}
        />
        <Modal
          title="编辑供应商"
          open={Boolean(editingSupplier)}
          onCancel={() => setEditingSupplier(null)}
          onOk={() => editSupplierForm.submit()}
          confirmLoading={updateSupplier.isPending}
          destroyOnHidden
        >
          <Form form={editSupplierForm} layout="vertical" onFinish={(values) => updateSupplier.mutate(values)}>
            <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: "请输入供应商名称" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="contactName" label="联系人">
              <Input />
            </Form.Item>
            <Form.Item name="contactPhone" label="联系电话">
              <Input />
            </Form.Item>
            <Form.Item name="rating" label="评级">
              <InputNumber min={1} max={5} className="w-full" />
            </Form.Item>
            <Form.Item name="note" label="备注">
              <Input />
            </Form.Item>
            <Form.Item name="isActive" label="启用" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}
