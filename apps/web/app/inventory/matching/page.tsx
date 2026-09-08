"use client";

import type { ProductUnit } from "@mallbay/shared";
import { ArrowLeftOutlined, LockOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { App, Alert, Button, Card, Form, InputNumber, Select, Space, Table, Tag, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { inventoryApi, productApi } from "../../../src/lib/api";
import {
  getInventoryAllocationStatusLabel,
  getInventoryOrderCustomerLabel,
  getInventoryOrderVehicleLabel,
  getInventoryProductLabel,
  formatBatchStockLabel,
  formatPackageSnapshotLabel,
  INVENTORY_PRODUCT_MISSING_LABEL,
  type InventoryOrderLike
} from "../../../src/features/inventory/display";
import {
  buildInventoryAllocationRows,
  buildInventoryMatchRows,
  buildInventoryQuantityUnitOptions,
  convertInventoryQuantity,
  getInventoryQuantityMax,
  getInventoryQuantityStep,
  buildPurchaseRequirementFromShortages,
  type InventoryMatchInput
} from "../../../src/features/inventory/matching";
import { getProductDisplayName, getProductUnitLabel } from "../../../src/features/products/display";
import { useAuthStore } from "../../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../../src/features/permissions/use-effective-permissions";

type ProductOption = {
  id: string;
  brand?: string | null;
  name?: string | null;
  model?: string | null;
};

type PendingMatchOrderRow = InventoryOrderLike & {
  id: string;
  orderNo: string;
  status: string;
  appointmentDate?: string | null;
};

type InventoryBatchRow = {
  id: string;
  productId?: string | null;
  batchNo?: string | null;
  availableQuantity?: number | string | null;
  unit?: ProductUnit | string | null;
  packageUnit?: ProductUnit | string | null;
  packageQuantity?: number | string | null;
  baseQuantityPerPackage?: number | string | null;
};

type AvailableInventoryPreviewRow = {
  id: string;
  productLabel: string;
  unit?: ProductUnit | string | null;
  packageUnit?: ProductUnit | string | null;
  packageQuantity?: number | string | null;
  baseQuantityPerPackage?: number | string | null;
  batchNo?: string | null;
  availableQuantity?: number | string | null;
};

type AvailableInventorySummaryRow = {
  id: string;
  productLabel: string;
  unit?: ProductUnit | string | null;
  batchCount: number;
  availableQuantity: number;
  packageQuantity?: number | string | null;
  baseQuantityPerPackage?: number | string | null;
};

type InventoryOrderMatchResponse = InventoryMatchInput & {
  order?: PendingMatchOrderRow;
};

type AllocationFormValues = {
  allocations?: Array<{
    batchId?: string;
    quantity?: number;
    unit?: ProductUnit;
  }>;
};

type OutboundFormValues = {
  lines?: Array<{
    quantity?: number;
    unit?: ProductUnit;
  }>;
};

export default function InventoryMatchingPage() {
  return (
    <Suspense fallback={<div className="management-page inventory-fulfillment-shell" />}>
      <InventoryMatchingContent />
    </Suspense>
  );
}

function InventoryMatchingContent() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const permissionsQuery = useEffectivePermissions(storeId);
  const canManageInventory = hasEffectivePermission(permissionsQuery.data?.permissions, "inventory", "write", storeId);
  const [allocationForm] = Form.useForm<AllocationFormValues>();
  const [outboundForm] = Form.useForm<OutboundFormValues>();

  const productsQuery = useQuery({
    queryKey: ["inventory-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, pageSize: 100 }),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "products", "read", storeId))
  });

  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", storeId],
    queryFn: () => inventoryApi.batches({ storeId: storeId! }),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "inventory", "read", storeId))
  });

  const pendingOrdersQuery = useQuery({
    queryKey: ["inventory-pending-match-orders", storeId],
    queryFn: () => inventoryApi.pendingMatchOrders(storeId!),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "inventory", "read", storeId))
  });

  const pendingMatchRows = useMemo(
    () => (pendingOrdersQuery.data ?? []) as PendingMatchOrderRow[],
    [pendingOrdersQuery.data]
  );
  const firstPendingOrderId = pendingMatchRows[0]?.id;
  const queryOrderId = searchParams.get("orderId") ?? undefined;
  const activeSelectedOrderId = queryOrderId ?? firstPendingOrderId;

  const orderMatchQuery = useQuery({
    queryKey: ["inventory-order-match", activeSelectedOrderId],
    queryFn: () => {
      if (!activeSelectedOrderId) throw new Error("请先选择待匹配订单");
      return inventoryApi.orderMatch(activeSelectedOrderId);
    },
    enabled: Boolean(activeSelectedOrderId)
  });

  const productItems = useMemo(() => (productsQuery.data?.items ?? []) as ProductOption[], [productsQuery.data]);
  const productMap = useMemo(() => new Map(productItems.map((product) => [product.id, product])), [productItems]);
  const batchRows = useMemo(() => (batchesQuery.data ?? []) as InventoryBatchRow[], [batchesQuery.data]);
  const orderMatch = orderMatchQuery.data as InventoryOrderMatchResponse | undefined;

  const matchRows = buildInventoryMatchRows(orderMatch);
  const allocationRows = buildInventoryAllocationRows(orderMatch);
  const lockableRows = matchRows.filter((row) => row.pendingQuantity > 0);
  const completedRows = matchRows.filter((row) => row.pendingQuantity === 0 && row.outboundQuantity >= row.requiredQuantity);
  const shortageRows = matchRows.filter((row) => row.shortageQuantity > 0);
  const selectedOrder = pendingMatchRows.find((order) => order.id === activeSelectedOrderId) ?? orderMatch?.order;
  const hasPendingProducts = lockableRows.length > 0;
  const workbenchStatus = (() => {
    if (allocationRows.length > 0) return { label: "待出库", color: "processing" as const };
    if (matchRows.length > 0 && !hasPendingProducts) return { label: "已完成", color: "success" as const };
    if (shortageRows.length > 0) return { label: "需采购", color: "warning" as const };
    return { label: "可锁库", color: "success" as const };
  })();

  const availableInventoryRows: AvailableInventoryPreviewRow[] = activeSelectedOrderId
    ? matchRows.flatMap((row) =>
        row.availableBatches.map((batch) => ({
          id: `${row.orderItemId}-${batch.id}`,
          productLabel: row.productLabel,
          unit: row.unit,
          batchNo: batch.batchNo,
          availableQuantity: batch.availableQuantity,
          packageUnit: batch.packageUnit,
          packageQuantity: batch.packageQuantity,
          baseQuantityPerPackage: batch.baseQuantityPerPackage
        }))
      )
    : batchRows.slice(0, 5).map((batch) => ({
        id: batch.id,
        productLabel: getInventoryProductLabel(batch.productId, productMap),
        batchNo: batch.batchNo,
        availableQuantity: batch.availableQuantity,
        unit: batch.unit,
        packageUnit: batch.packageUnit,
        packageQuantity: batch.packageQuantity,
        baseQuantityPerPackage: batch.baseQuantityPerPackage
      }));

  const availableInventorySummaryRows = useMemo<AvailableInventorySummaryRow[]>(() => {
    const grouped = new Map<string, AvailableInventorySummaryRow>();
    for (const row of availableInventoryRows) {
      const key = `${row.productLabel}|${row.unit ?? ""}`;
      const current = grouped.get(key);
      if (current) {
        current.batchCount += 1;
        current.availableQuantity += Number(row.availableQuantity ?? 0);
        continue;
      }
      grouped.set(key, {
        id: key,
        productLabel: row.productLabel,
        unit: row.unit,
        batchCount: 1,
        availableQuantity: Number(row.availableQuantity ?? 0),
        packageQuantity: row.packageQuantity,
        baseQuantityPerPackage: row.baseQuantityPerPackage
      });
    }
    return [...grouped.values()];
  }, [availableInventoryRows]);

  const createShortagePurchaseRequirement = useMutation({
    mutationFn: () => {
      if (!storeId || !activeSelectedOrderId || shortageRows.length === 0) {
        throw new Error("当前订单没有缺货明细");
      }
      return inventoryApi.createPurchaseRequirement(
        buildPurchaseRequirementFromShortages(storeId, activeSelectedOrderId, matchRows)
      );
    },
    onSuccess: async () => {
      message.success("缺货采购需求已创建");
      await queryClient.invalidateQueries({ queryKey: ["purchase-requirements", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createOrderAllocations = useMutation({
    mutationFn: (values: AllocationFormValues) => {
      if (!activeSelectedOrderId) throw new Error("请先选择待匹配订单");
      return inventoryApi.createOrderAllocations(activeSelectedOrderId, {
        allocations: (values.allocations ?? []).map((allocation, index) => ({
          orderItemId: lockableRows[index].orderItemId,
          batchId: allocation.batchId!,
          quantity: allocation.quantity!,
          unit: allocation.unit ?? lockableRows[index].unit
        }))
      });
    },
    onSuccess: async () => {
      message.success("批次已锁定");
      allocationForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-order-match", activeSelectedOrderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const outboundSelectedOrder = useMutation({
    mutationFn: (values: OutboundFormValues) => {
      if (!activeSelectedOrderId) throw new Error("请先选择待匹配订单");
      const lines = (values.lines ?? [])
        .map((line, index) => ({
          allocationId: allocationRows[index]?.id,
          quantity: line.quantity,
          unit: line.unit ?? allocationRows[index]?.unit
        }))
        .filter((line): line is { allocationId: string; quantity: number; unit: ProductUnit } =>
          Boolean(line.allocationId) && Number(line.quantity ?? 0) > 0 && Boolean(line.unit)
        );
      if (lines.length === 0) throw new Error("请至少填写一条出库数量");
      return inventoryApi.outboundOrder(activeSelectedOrderId, { lines });
    },
    onSuccess: async () => {
      message.success("订单库存已出库");
      outboundForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-order-match", activeSelectedOrderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const releaseSelectedOrder = useMutation({
    mutationFn: () => {
      if (!activeSelectedOrderId) throw new Error("请先选择待匹配订单");
      return inventoryApi.releaseOrder(activeSelectedOrderId);
    },
    onSuccess: async () => {
      message.success("订单锁定库存已释放");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-order-match", activeSelectedOrderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const isAllocating = createOrderAllocations.isPending || orderMatchQuery.isLoading;
  const isCreatingRequirement = createShortagePurchaseRequirement.isPending;

  return (
    <div className="management-page inventory-fulfillment-shell">
      <div className="management-page-header">
        <div>
          <Typography.Title level={2} className="management-page-title">
            订单库存匹配
          </Typography.Title>
          <Typography.Text className="management-page-description">
            查看订单需求、库存建议、锁库结果和待出库状态。
          </Typography.Text>
        </div>
        <Space wrap>
          <Button href="/inventory" aria-label="返回库存总览" icon={<ArrowLeftOutlined />}>
            返回库存总览
          </Button>
        </Space>
      </div>

      {!canManageInventory ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          title="只读模式"
          description="客服可查看订单需求、库存建议和锁库结果，不能锁库、出库、释放或生成采购需求。"
        />
      ) : null}

      <section className="inventory-workspace-grid inventory-fulfillment-board">
        <div className="inventory-board-center inventory-main-stack">
          <Card
            className="inventory-prototype-card inventory-workspace-card inventory-current-order-workbench"
            title="当前订单匹配工作台"
            extra={<Tag color={workbenchStatus.color}>{workbenchStatus.label}</Tag>}
          >
            <div className="inventory-current-order-overview">
              <div className="inventory-current-order-strip">
                <span>当前订单</span>
                <strong>{selectedOrder?.orderNo ?? "请选择待匹配订单"}</strong>
                <small>
                  {selectedOrder
                    ? `${getInventoryOrderCustomerLabel(selectedOrder)} · ${getInventoryOrderVehicleLabel(selectedOrder)}`
                    : "请从库存总览的待匹配订单进入库存匹配"}
                </small>
              </div>
              <div className="inventory-outbound-summary">
                <span>已锁批次</span>
                <strong>{allocationRows.length} 个</strong>
                <span>缺货明细</span>
                <strong>{shortageRows.length} 项</strong>
                <span>待处理产品</span>
                <strong>{lockableRows.length} 项</strong>
                <span>已出库产品</span>
                <strong>{completedRows.length} 项</strong>
              </div>
              <div className="inventory-current-order-demand">
                <div className="inventory-current-order-demand-head">
                  <strong>订单产品需求</strong>
                  <span>
                    {!hasPendingProducts && matchRows.length > 0
                      ? "该订单库存流程已完成，无需继续锁库或出库。"
                      : shortageRows.length > 0
                        ? `存在 ${shortageRows.length} 项缺货，可生成采购需求单。`
                        : "库存匹配结果会优先提示可出库批次。"}
                  </span>
                </div>
                {selectedOrder ? (
                  <div className="inventory-current-order-demand-list">
                    {(selectedOrder.items ?? []).map((item, index) => (
                      <div key={`${item.productId ?? index}-${item.quantity ?? 0}`} className="inventory-current-order-demand-row">
                        <span>产品</span>
                        <strong>
                          {item.product
                            ? getProductDisplayName({
                                brand: item.product.brand ?? undefined,
                                name: item.product.name ?? undefined,
                                model: item.product.model ?? undefined
                              })
                            : INVENTORY_PRODUCT_MISSING_LABEL}
                        </strong>
                        <span>销售需求</span>
                        <strong>{item.quantity ?? 0}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="inventory-demand-empty">选择订单后显示产品、规格、需求量和库存建议。</div>
                )}
              </div>
            </div>

            <div className="inventory-lock-and-allocation-grid inventory-matching-workflow">
              <section className="inventory-lock-panel">
                <div className="inventory-section-head">
                  <div>
                    <Typography.Title level={5} className="!mb-1">选择批次并锁定库存</Typography.Title>
                    <Typography.Text type="secondary">先查看可用批次，再为每个产品选择批次和本次锁定数量。</Typography.Text>
                  </div>
                  <Button
                    icon={<ShoppingCartOutlined />}
                    disabled={!canManageInventory || !activeSelectedOrderId || !hasPendingProducts || shortageRows.length === 0 || isCreatingRequirement}
                    loading={isCreatingRequirement}
                    onClick={() => createShortagePurchaseRequirement.mutate()}
                  >
                    为缺货生成采购需求
                  </Button>
                </div>

                <Table<AvailableInventorySummaryRow>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  loading={activeSelectedOrderId ? orderMatchQuery.isLoading : batchesQuery.isLoading}
                  dataSource={availableInventorySummaryRows}
                  columns={[
                    { title: "产品", dataIndex: "productLabel" },
                    { title: "可用批次", render: (_, row) => `${row.batchCount} 个批次` },
                    {
                      title: "可用库存",
                      render: (_, row) => (
                        <Tag color={row.availableQuantity > 0 ? "success" : "default"}>
                          {formatBatchStockLabel(row)}
                        </Tag>
                      )
                    },
                    { title: "操作", render: () => <Typography.Text type="secondary">在下方选择批次</Typography.Text> }
                  ]}
                />

                {activeSelectedOrderId ? (
                  <Form form={allocationForm} layout="vertical" onFinish={(values) => createOrderAllocations.mutate(values)}>
                    <div className="inventory-lock-form-list">
                      {lockableRows.length > 0 ? (
                        lockableRows.map((row, index) => {
                          const pendingLockQuantity = row.pendingQuantity;
                          const rowStatus = row.shortageQuantity > 0
                            ? { label: "需补货", color: "error" as const }
                            : row.lockedQuantity > 0
                              ? { label: "部分已锁", color: "processing" as const }
                              : { label: "库存可用", color: "success" as const };

                          return (
                            <div key={row.orderItemId} className="inventory-allocation-editor-card">
                              <div className="inventory-allocation-editor-head">
                                <div>
                                  <Typography.Text strong>{row.productLabel}</Typography.Text>
                                  <span>按建议数量锁定，锁定后可在下方查看出库进度。</span>
                                </div>
                                <Tag color={rowStatus.color}>{rowStatus.label}</Tag>
                              </div>

                              <div className="inventory-allocation-metrics">
                                <div>
                                  <span>需求量</span>
                                  <strong>
                                    {row.salesQuantity} {getProductUnitLabel(row.salesUnit)}
                                    {row.salesUnit !== row.unit ? ` / ${row.requiredQuantity} ${getProductUnitLabel(row.unit)}` : ""}
                                  </strong>
                                </div>
                                <div>
                                  <span>已锁数量</span>
                                  <strong>{row.lockedQuantity} {getProductUnitLabel(row.unit)}</strong>
                                </div>
                                <div>
                                  <span>已出库</span>
                                  <strong>{row.outboundQuantity} {getProductUnitLabel(row.unit)}</strong>
                                </div>
                                <div>
                                  <span>待锁数量</span>
                                  <strong>{pendingLockQuantity} {getProductUnitLabel(row.unit)}</strong>
                                </div>
                                <div>
                                  <span>可用库存</span>
                                  <strong>{row.availableQuantity} {getProductUnitLabel(row.unit)}</strong>
                                </div>
                                <div>
                                  <span>缺口</span>
                                  <strong>{row.shortageQuantity} {getProductUnitLabel(row.unit)}</strong>
                                </div>
                              </div>

                              <div className="inventory-allocation-editor-grid">
                                <Form.Item
                                  label="可用批次"
                                  name={["allocations", index, "batchId"]}
                                  rules={[{ required: true, message: "请选择批次" }]}
                                  className="!mb-0"
                                >
                                  <Select
                                    showSearch
                                    optionFilterProp="label"
                                    placeholder={row.availableBatches.length > 0 ? "选择可出库批次" : "暂无可用批次"}
                                    disabled={!canManageInventory || row.availableBatches.length === 0 || pendingLockQuantity <= 0}
                                    onChange={(batchId) => {
                                      const batch = row.availableBatches.find((candidate) => candidate.id === batchId);
                                      allocationForm.setFields([
                                        { name: ["allocations", index, "unit"], value: batch?.unit ?? row.unit },
                                        { name: ["allocations", index, "quantity"], value: undefined }
                                      ]);
                                    }}
                                    options={row.availableBatches.map((batch) => ({
                                      value: batch.id,
                                      label: [
                                        batch.batchNo,
                                        formatBatchStockLabel(batch),
                                        formatPackageSnapshotLabel(batch)
                                      ].join(" · ")
                                    }))}
                                  />
                                </Form.Item>
                                <Form.Item noStyle shouldUpdate>
                                  {({ getFieldValue }) => {
                                    const batchId = getFieldValue(["allocations", index, "batchId"]);
                                    const batch = row.availableBatches.find((candidate) => candidate.id === batchId);
                                    const unit = getFieldValue(["allocations", index, "unit"]) ?? batch?.unit ?? row.unit;
                                    const pendingInBatchUnit = batch
                                      ? convertInventoryQuantity(
                                        pendingLockQuantity,
                                        row.unit,
                                        batch.unit,
                                        { baseUnit: row.unit, metersPerRoll: row.metersPerRoll, precision: row.quantityPrecision }
                                      )
                                      : pendingLockQuantity;
                                    const maxLockQuantity = batch
                                      ? getInventoryQuantityMax({
                                        availableBaseQuantity: batch.availableQuantity,
                                        requiredBaseQuantity: pendingInBatchUnit,
                                        baseUnit: batch.unit,
                                        targetUnit: unit,
                                        packageUnit: batch.packageUnit,
                                        baseQuantityPerPackage: batch.baseQuantityPerPackage,
                                        metersPerRoll: row.metersPerRoll,
                                        quantityPrecision: row.quantityPrecision
                                      })
                                      : undefined;
                                    const unitOptions = batch
                                      ? buildInventoryQuantityUnitOptions({
                                        unit: batch.unit,
                                        packageUnit: batch.packageUnit,
                                        baseQuantityPerPackage: batch.baseQuantityPerPackage,
                                        metersPerRoll: row.metersPerRoll,
                                        salesUnit: row.salesUnit
                                      })
                                      : buildInventoryQuantityUnitOptions({
                                        unit: row.unit,
                                        metersPerRoll: row.metersPerRoll,
                                        salesUnit: row.salesUnit
                                      });
                                    return <>
                                      <Form.Item
                                        label="锁定数量"
                                        name={["allocations", index, "quantity"]}
                                        rules={[{ required: true, message: "请输入数量" }]}
                                        className="!mb-0"
                                      >
                                        <InputNumber
                                          min={getInventoryQuantityStep(row.quantityPrecision)}
                                          precision={row.quantityPrecision}
                                          step={getInventoryQuantityStep(row.quantityPrecision)}
                                          max={maxLockQuantity || undefined}
                                          placeholder={batch ? `最多 ${maxLockQuantity ?? 0} ${getProductUnitLabel(unit)}` : "请先选择批次"}
                                          disabled={!canManageInventory || !batch || maxLockQuantity === undefined || maxLockQuantity <= 0}
                                        />
                                      </Form.Item>
                                      <Form.Item
                                        label="锁定单位"
                                        name={["allocations", index, "unit"]}
                                        initialValue={row.unit}
                                        rules={[{ required: true, message: "请选择单位" }]}
                                        className="!mb-0"
                                      >
                                        <Select
                                          disabled={!canManageInventory || !batch || maxLockQuantity === undefined || maxLockQuantity <= 0}
                                          options={unitOptions}
                                          onChange={() => allocationForm.setFieldValue(["allocations", index, "quantity"], undefined)}
                                        />
                                      </Form.Item>
                                    </>;
                                  }}
                                </Form.Item>
                              </div>
                            </div>
                          );
                        })
                      ) : matchRows.length > 0 ? (
                        matchRows.map((row) => (
                          <div key={row.orderItemId} className="inventory-allocation-editor-card inventory-allocation-editor-card-complete">
                            <div className="inventory-allocation-editor-head">
                              <div>
                                <Typography.Text strong>{row.productLabel}</Typography.Text>
                                <span>该产品已完成出库，无需继续锁库。</span>
                              </div>
                              <Tag color="success">已出库</Tag>
                            </div>
                            <div className="inventory-allocation-metrics">
                              <div>
                                <span>需求量</span>
                                <strong>
                                  {row.salesQuantity} {getProductUnitLabel(row.salesUnit)}
                                  {row.salesUnit !== row.unit ? ` / ${row.requiredQuantity} ${getProductUnitLabel(row.unit)}` : ""}
                                </strong>
                              </div>
                              <div>
                                <span>已锁数量</span>
                                <strong>{row.lockedQuantity} {getProductUnitLabel(row.unit)}</strong>
                              </div>
                              <div>
                                <span>已出库</span>
                                <strong>{row.outboundQuantity} {getProductUnitLabel(row.unit)}</strong>
                              </div>
                              <div>
                                <span>待锁数量</span>
                                <strong>{row.pendingQuantity} {getProductUnitLabel(row.unit)}</strong>
                              </div>
                              <div>
                                <span>缺口</span>
                                <strong>{row.shortageQuantity} {getProductUnitLabel(row.unit)}</strong>
                              </div>
                            </div>
                            <div className="inventory-demand-empty inventory-complete-note">库存匹配、锁库和出库已完成。</div>
                          </div>
                        ))
                      ) : (
                        <div className="inventory-demand-empty">当前订单暂无可锁定产品需求。</div>
                      )}
                    </div>
                    <Space wrap>
                      <Button
                        icon={<LockOutlined />}
                        disabled={!canManageInventory || !hasPendingProducts || isAllocating}
                        type="primary"
                        htmlType="submit"
                        loading={isAllocating}
                      >
                        确认锁定
                      </Button>

                    </Space>
                  </Form>
                ) : (
                  <div className="inventory-demand-empty">暂无待匹配订单。</div>
                )}
              </section>

              <section className="inventory-allocation-panel">
                <div className="inventory-section-head">
                  <div>
                    <Typography.Title level={5} className="!mb-1">已锁批次与出库</Typography.Title>
                    <Typography.Text type="secondary">当前订单锁库结果、出库进度和释放状态在这里查看。</Typography.Text>
                  </div>
                  <Button
                    danger
                    disabled={!canManageInventory || !activeSelectedOrderId || allocationRows.length === 0}
                    loading={releaseSelectedOrder.isPending}
                    onClick={() => releaseSelectedOrder.mutate()}
                  >
                    释放锁库
                  </Button>
                </div>
                <Table
                  className="inventory-tab-desktop-table inventory-allocation-desktop-table"
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={allocationRows}
                  columns={[
                    { title: "产品", dataIndex: "productLabel" },
                    { title: "批次", dataIndex: "batchLabel" },
                    { title: "锁定数量", render: (_, row) => `${row.lockedQuantity} ${getProductUnitLabel(row.unit)}` },
                    { title: "已出库", render: (_, row) => `${row.outboundQuantity} ${getProductUnitLabel(row.unit)}` },
                    { title: "待出库", render: (_, row) => `${row.remainingQuantity} ${getProductUnitLabel(row.unit)}` },
                    { title: "状态", render: (_, row) => <Tag>{getInventoryAllocationStatusLabel(row.status)}</Tag> }
                  ]}
                />
                {allocationRows.length > 0 ? (
                  <Form form={outboundForm} layout="vertical" onFinish={(values) => outboundSelectedOrder.mutate(values)}>
                    <div className="inventory-lock-form-list">
                      {allocationRows.map((row, index) => (
                        <div key={row.id} className="inventory-allocation-editor-card">
                          <div className="inventory-allocation-editor-head">
                            <div>
                              <Typography.Text strong>{row.productLabel}</Typography.Text>
                              <span>{row.batchLabel} · 待出库 {row.remainingQuantity} {getProductUnitLabel(row.unit)}</span>
                            </div>
                            <Tag>{getInventoryAllocationStatusLabel(row.status)}</Tag>
                          </div>
                          <div className="inventory-allocation-editor-grid">
                            <Form.Item noStyle shouldUpdate>
                              {({ getFieldValue }) => {
                                const unit = getFieldValue(["lines", index, "unit"]) ?? row.unit;
                                const maxOutboundQuantity = getInventoryQuantityMax({
                                  availableBaseQuantity: row.remainingQuantity,
                                  baseUnit: row.unit,
                                  targetUnit: unit,
                                  packageUnit: row.packageUnit,
                                  baseQuantityPerPackage: row.baseQuantityPerPackage,
                                  metersPerRoll: row.metersPerRoll,
                                  quantityPrecision: row.quantityPrecision
                                });
                                return <>
                                  <Form.Item
                                    label="本次出库数量"
                                    name={["lines", index, "quantity"]}
                                    rules={[{ required: true, message: "请输入出库数量" }]}
                                    className="!mb-0"
                                  >
                                    <InputNumber
                                      min={getInventoryQuantityStep(row.quantityPrecision)}
                                      precision={row.quantityPrecision}
                                      step={getInventoryQuantityStep(row.quantityPrecision)}
                                      max={maxOutboundQuantity || undefined}
                                      placeholder={`最多 ${maxOutboundQuantity ?? 0} ${getProductUnitLabel(unit)}`}
                                      disabled={!canManageInventory || !maxOutboundQuantity || maxOutboundQuantity <= 0}
                                    />
                                  </Form.Item>
                                  <Form.Item
                                    label="出库单位"
                                    name={["lines", index, "unit"]}
                                    initialValue={row.unit}
                                    rules={[{ required: true, message: "请选择单位" }]}
                                    className="!mb-0"
                                  >
                                    <Select
                                      disabled={!canManageInventory || row.remainingQuantity <= 0}
                                      options={buildInventoryQuantityUnitOptions({
                                        unit: row.unit,
                                        packageUnit: row.packageUnit,
                                        baseQuantityPerPackage: row.baseQuantityPerPackage,
                                        metersPerRoll: row.metersPerRoll,
                                        salesUnit: row.salesUnit
                                      })}
                                      onChange={() => outboundForm.setFieldValue(["lines", index, "quantity"], undefined)}
                                    />
                                  </Form.Item>
                                </>;
                              }}
                            </Form.Item>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="primary"
                      htmlType="submit"
                      disabled={!canManageInventory || !activeSelectedOrderId || allocationRows.length === 0}
                      loading={outboundSelectedOrder.isPending}
                    >
                      确认出库
                    </Button>
                  </Form>
                ) : null}
                <div className="inventory-tab-mobile-cards inventory-allocation-mobile-cards">
                  {allocationRows.length > 0 ? (
                    allocationRows.map((row) => (
                      <article key={row.id} className="inventory-tab-mobile-card inventory-allocation-mobile-card">
                        <div className="inventory-tab-mobile-card-head">
                          <strong>{row.productLabel}</strong>
                          <Tag>{getInventoryAllocationStatusLabel(row.status)}</Tag>
                        </div>
                        <dl className="inventory-tab-mobile-card-fields">
                          <div>
                            <dt>批次</dt>
                            <dd>{row.batchLabel}</dd>
                          </div>
                          <div>
                            <dt>锁定数量</dt>
                            <dd>{row.lockedQuantity} {getProductUnitLabel(row.unit)}</dd>
                          </div>
                          <div>
                            <dt>已出库</dt>
                            <dd>{row.outboundQuantity} {getProductUnitLabel(row.unit)}</dd>
                          </div>
                          <div>
                            <dt>待出库</dt>
                            <dd>{row.remainingQuantity} {getProductUnitLabel(row.unit)}</dd>
                          </div>
                        </dl>
                      </article>
                    ))
                  ) : (
                    <div className="inventory-tab-mobile-empty">暂无已锁批次</div>
                  )}
                </div>
              </section>
            </div>

            <div className="inventory-inline-shortcuts" aria-label="相关工作区">
              <Link href="/purchases/requirements" className="inventory-shortcut">
                <strong>查看采购需求</strong>
                <span>缺货需求、转单状态和采购跟进</span>
              </Link>
              <Link href="/inventory/movements" className="inventory-shortcut">
                <strong>查看库存流水</strong>
                <span>批次追溯、入库出库和异常追踪</span>
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
