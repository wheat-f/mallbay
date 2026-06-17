"use client";

import type { ProductUnit } from "@mallbay/shared";
import { ArrowLeftOutlined, LockOutlined, SearchOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { App, Alert, Button, Card, Form, Input, InputNumber, Select, Space, Table, Tag, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { inventoryApi, productApi } from "../../../src/lib/api";
import {
  getInventoryAllocationStatusLabel,
  getInventoryOrderCustomerLabel,
  getInventoryOrderItemsSummary,
  getInventoryOrderVehicleLabel,
  getInventoryProductLabel,
  INVENTORY_PRODUCT_MISSING_LABEL,
  type InventoryOrderLike
} from "../../../src/features/inventory/display";
import {
  buildInventoryAllocationRows,
  buildInventoryMatchRows,
  buildPurchaseRequirementFromShortages,
  filterInventoryBatches,
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

type AllocationFormValues = {
  allocations?: Array<{
    batchId?: string;
    quantity?: number;
  }>;
};

export default function InventoryMatchingPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManageInventory = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const [allocationForm] = Form.useForm<AllocationFormValues>();
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [inventorySearch, setInventorySearch] = useState("");
  const [batchSearchByOrderItem, setBatchSearchByOrderItem] = useState<Record<string, string>>({});

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
  const activeSelectedOrderId = selectedOrderId ?? firstPendingOrderId;

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

  const filteredPendingMatchRows = useMemo(() => {
    const keyword = inventorySearch.trim().toLowerCase();
    if (!keyword) return pendingMatchRows;
    return pendingMatchRows.filter((order) =>
      [
        order.orderNo,
        getInventoryOrderCustomerLabel(order),
        getInventoryOrderVehicleLabel(order),
        getInventoryOrderItemsSummary(order)
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [inventorySearch, pendingMatchRows]);

  const matchRows = buildInventoryMatchRows(orderMatchQuery.data as InventoryMatchInput | undefined);
  const allocationRows = buildInventoryAllocationRows(orderMatchQuery.data as InventoryMatchInput | undefined);
  const shortageRows = matchRows.filter((row) => row.shortageQuantity > 0);
  const selectedOrder = pendingMatchRows.find((order) => order.id === activeSelectedOrderId);

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
          orderItemId: matchRows[index].orderItemId,
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

  const handleSelectedOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    setBatchSearchByOrderItem({});
  };

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
          message="只读模式"
          description="客服可查看订单需求、库存建议和锁库结果，不能锁库、出库、释放或生成采购需求。"
        />
      ) : null}

      <section className="inventory-workspace-grid inventory-fulfillment-board">
        <div className="inventory-board-rail inventory-rail-stack">
          <Card
            className="inventory-prototype-card inventory-workspace-card"
            title="待匹配订单"
            extra={<Tag color="warning">{filteredPendingMatchRows.length} 笔等待</Tag>}
          >
            <Space direction="vertical" className="w-full" size="middle">
              <Input
                prefix={<SearchOutlined />}
                allowClear
                placeholder="搜索订单、车辆或客户..."
                value={inventorySearch}
                onChange={(event) => setInventorySearch(event.target.value)}
              />
              {filteredPendingMatchRows.length > 0 ? (
                <Space direction="vertical" className="w-full" size="small">
                  {filteredPendingMatchRows.slice(0, 6).map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      className={order.id === activeSelectedOrderId ? "inventory-order-card is-active" : "inventory-order-card"}
                      onClick={() => handleSelectedOrderChange(order.id)}
                    >
                      <span className="inventory-order-title">{order.orderNo}</span>
                      <span>{getInventoryOrderCustomerLabel(order)}</span>
                      <span>{getInventoryOrderVehicleLabel(order)}</span>
                      <small>{getInventoryOrderItemsSummary(order)}</small>
                    </button>
                  ))}
                </Space>
              ) : (
                <Typography.Text type="secondary">暂无待匹配订单</Typography.Text>
              )}
            </Space>
          </Card>

          <Card className="inventory-prototype-card inventory-workspace-card inventory-demand-card" title="订单产品需求">
            <Space direction="vertical" className="w-full" size="middle">
              <Typography.Text type="secondary">
                当前订单：{selectedOrder?.orderNo ?? "请选择待匹配订单"}
              </Typography.Text>
              {selectedOrder ? (
                <div className="inventory-demand-box">
                  {(selectedOrder.items ?? []).map((item, index) => (
                    <div key={`${item.productId ?? index}-${item.quantity ?? 0}`} className="inventory-demand-row">
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
              <div className={shortageRows.length > 0 ? "inventory-demand-hint is-warning" : "inventory-demand-hint"}>
                {shortageRows.length > 0 ? `存在 ${shortageRows.length} 项缺货，可生成采购需求单。` : "库存匹配结果会优先提示可出库批次。"}
              </div>
            </Space>
          </Card>
        </div>

        <div className="inventory-board-center inventory-main-stack">
          <Card
            className="inventory-prototype-card inventory-workspace-card inventory-current-order-workbench"
            title="当前订单匹配工作台"
            extra={<Tag color={shortageRows.length > 0 ? "warning" : "success"}>{shortageRows.length > 0 ? "需采购" : "可锁库"}</Tag>}
          >
            <div className="inventory-current-order-overview">
              <div className="inventory-current-order-strip">
                <span>当前订单</span>
                <strong>{selectedOrder?.orderNo ?? "请选择待匹配订单"}</strong>
                <small>
                  {selectedOrder
                    ? `${getInventoryOrderCustomerLabel(selectedOrder)} · ${getInventoryOrderVehicleLabel(selectedOrder)}`
                    : "先从左侧订单队列选择需要匹配库存的订单"}
                </small>
              </div>
              <div className="inventory-outbound-summary">
                <span>已锁批次</span>
                <strong>{allocationRows.length} 个</strong>
                <span>缺货明细</span>
                <strong>{shortageRows.length} 项</strong>
                <span>待选产品</span>
                <strong>{matchRows.length} 项</strong>
              </div>
            </div>

            <div className="inventory-lock-and-allocation-grid">
              <section className="inventory-lock-panel">
                <div className="inventory-section-head">
                  <div>
                    <Typography.Title level={5} className="!mb-1">库存建议与批次锁定</Typography.Title>
                    <Typography.Text type="secondary">查看当前订单可用批次，直接完成批次选择和锁库。</Typography.Text>
                  </div>
                  <Button
                    icon={<ShoppingCartOutlined />}
                    disabled={!canManageInventory || !activeSelectedOrderId || shortageRows.length === 0 || isCreatingRequirement}
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
                      {matchRows.length > 0 ? (
                        matchRows.map((row, index) => (
                          <div key={row.orderItemId} className="inventory-nested-panel">
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
                                <InputNumber min={0.001} max={row.availableQuantity || undefined} placeholder="锁定数量" disabled={!canManageInventory} />
                              </Form.Item>
                            </Space>
                          </div>
                        ))
                      ) : (
                        <div className="inventory-demand-empty">当前订单暂无可锁定产品需求。</div>
                      )}
                    </div>
                    <Space wrap>
                      <Button
                        icon={<LockOutlined />}
                        disabled={!canManageInventory || isAllocating}
                        type="primary"
                        htmlType="submit"
                        loading={isAllocating}
                      >
                        确认锁定
                      </Button>
                      <Button
                        disabled={!canManageInventory || !activeSelectedOrderId}
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
                    <Typography.Title level={5} className="!mb-1">已锁批次</Typography.Title>
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
