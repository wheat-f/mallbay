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
  INVENTORY_PRODUCT_MISSING_LABEL,
  type InventoryOrderLike
} from "../../../src/features/inventory/display";
import {
  buildInventoryAllocationRows,
  buildInventoryMatchRows,
  buildPurchaseRequirementFromShortages,
  type InventoryMatchInput
} from "../../../src/features/inventory/matching";
import { getProductDisplayName, getProductUnitLabel } from "../../../src/features/products/display";
import { useAuthStore } from "../../../src/stores/auth-store";

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
};

type AvailableInventoryPreviewRow = {
  id: string;
  productLabel: string;
  unit?: ProductUnit;
  batchNo?: string | null;
  availableQuantity?: number | string | null;
};

type InventoryOrderMatchResponse = InventoryMatchInput & {
  order?: PendingMatchOrderRow;
};

type AllocationFormValues = {
  allocations?: Array<{
    batchId?: string;
    quantity?: number;
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
  const canManageInventory = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const [allocationForm] = Form.useForm<AllocationFormValues>();

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

  const pendingOrdersQuery = useQuery({
    queryKey: ["inventory-pending-match-orders", storeId],
    queryFn: () => inventoryApi.pendingMatchOrders(storeId!),
    enabled: Boolean(storeId)
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
          availableQuantity: batch.availableQuantity
        }))
      )
    : batchRows.slice(0, 5).map((batch) => ({
        id: batch.id,
        productLabel: getInventoryProductLabel(batch.productId, productMap),
        batchNo: batch.batchNo,
        availableQuantity: batch.availableQuantity
      }));

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

  const lockOrder = useMutation({
    mutationFn: (orderId: string) => inventoryApi.lockOrder(orderId),
    onSuccess: async () => {
      message.success("订单库存匹配完成");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-order-match", activeSelectedOrderId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
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
          quantity: allocation.quantity!
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
    mutationFn: () => {
      if (!activeSelectedOrderId) throw new Error("请先选择待匹配订单");
      return inventoryApi.outboundOrder(activeSelectedOrderId);
    },
    onSuccess: async () => {
      message.success("订单库存已出库");
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
                        <span>需求量</span>
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

                <Table<AvailableInventoryPreviewRow>
                  rowKey="id"
                  size="small"
                  pagination={false}
                  loading={activeSelectedOrderId ? orderMatchQuery.isLoading : batchesQuery.isLoading}
                  dataSource={availableInventoryRows}
                  columns={[
                    { title: "批次号", dataIndex: "batchNo" },
                    { title: "产品", dataIndex: "productLabel" },
                    {
                      title: "可用",
                      render: (_, row) => (
                        <Tag color={Number(row.availableQuantity) > 0 ? "success" : "default"}>
                          {row.availableQuantity ?? 0}
                          {row.unit ? ` ${getProductUnitLabel(row.unit)}` : ""}
                        </Tag>
                      )
                    }
                  ]}
                />

                {activeSelectedOrderId ? (
                  <Form form={allocationForm} layout="vertical" onFinish={(values) => createOrderAllocations.mutate(values)}>
                    <div className="inventory-lock-form-list">
                      {lockableRows.length > 0 ? (
                        lockableRows.map((row, index) => {
                          const pendingLockQuantity = row.pendingQuantity;
                          const maxLockQuantity = Math.min(row.availableQuantity, pendingLockQuantity || row.availableQuantity);
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
                                  <strong>{row.requiredQuantity} {getProductUnitLabel(row.unit)}</strong>
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
                                    options={row.availableBatches.map((batch) => ({
                                      value: batch.id,
                                      label: `${batch.batchNo} · 可用 ${batch.availableQuantity} ${getProductUnitLabel(row.unit)}`
                                    }))}
                                  />
                                </Form.Item>
                                <Form.Item
                                  label="锁定数量"
                                  name={["allocations", index, "quantity"]}
                                  rules={[{ required: true, message: "请输入数量" }]}
                                  className="!mb-0"
                                >
                                  <InputNumber
                                    min={0.001}
                                    max={maxLockQuantity || undefined}
                                    placeholder="输入本次锁定数量"
                                    disabled={!canManageInventory || row.availableQuantity <= 0 || pendingLockQuantity <= 0}
                                  />
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
                                <strong>{row.requiredQuantity} {getProductUnitLabel(row.unit)}</strong>
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
                      <Button
                        disabled={!canManageInventory || !activeSelectedOrderId || !hasPendingProducts}
                        loading={lockOrder.isPending}
                        onClick={() => activeSelectedOrderId && lockOrder.mutate(activeSelectedOrderId)}
                      >
                        自动匹配库存
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
                  <Space wrap>
                    <Button
                      disabled={!canManageInventory || !activeSelectedOrderId || allocationRows.length === 0}
                      loading={outboundSelectedOrder.isPending}
                      onClick={() => outboundSelectedOrder.mutate()}
                    >
                      确认出库
                    </Button>
                    <Button
                      danger
                      disabled={!canManageInventory || !activeSelectedOrderId || allocationRows.length === 0}
                      loading={releaseSelectedOrder.isPending}
                      onClick={() => releaseSelectedOrder.mutate()}
                    >
                      释放锁库
                    </Button>
                  </Space>
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
                    { title: "锁定数量", dataIndex: "lockedQuantity" },
                    { title: "已出库", dataIndex: "outboundQuantity" },
                    { title: "剩余锁定", dataIndex: "remainingQuantity" },
                    { title: "状态", render: (_, row) => <Tag>{getInventoryAllocationStatusLabel(row.status)}</Tag> }
                  ]}
                />
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
                            <dd>{row.lockedQuantity}</dd>
                          </div>
                          <div>
                            <dt>已出库</dt>
                            <dd>{row.outboundQuantity}</dd>
                          </div>
                          <div>
                            <dt>剩余锁定</dt>
                            <dd>{row.remainingQuantity}</dd>
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
              <Link href="/inventory/adjustments" className="inventory-shortcut">
                <strong>进入库存调整工作台</strong>
                <span>单位转换、盘点报损和调拨</span>
              </Link>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
