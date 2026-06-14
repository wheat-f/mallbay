"use client";

import type { InventoryBatchSummary, InventoryMovementType, ProductUnit } from "@mallbay/shared";
import { App, Button, Card, Form, Input, InputNumber, Select, Table } from "antd";
import {
  ArrowLeftOutlined,
  CheckOutlined,
  DeleteOutlined,
  ScissorOutlined,
  SwapOutlined,
  TruckOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { inventoryApi, productApi } from "../../../src/lib/api";
import { getInventoryBatchLabel, getInventoryProductLabel } from "../../../src/features/inventory/display";
import { getProductUnitLabel } from "../../../src/features/products/display";
import { useAuthStore } from "../../../src/stores/auth-store";

type ProductOption = {
  id: string;
  brand?: string | null;
  name?: string | null;
  model?: string | null;
  inventoryUnit?: ProductUnit | null;
  metersPerRoll?: number | string | null;
};

type ConversionFormValues = {
  batchId: string;
  quantity: number;
  convertedQuantity: number;
};

type SplitFormValues = {
  batchId: string;
  quantityMeters: number;
};

type StockOperationFormValues = {
  batchId: string;
  movementType: InventoryMovementType;
  quantity: number;
  note?: string;
};

type TransferFormValues = {
  batchId: string;
  quantity: number;
  fromWarehouse?: string;
  toWarehouse?: string;
};

export default function InventoryAdjustmentsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [conversionForm] = Form.useForm<ConversionFormValues>();
  const [splitForm] = Form.useForm<SplitFormValues>();
  const [stockForm] = Form.useForm<StockOperationFormValues>();
  const [transferForm] = Form.useForm<TransferFormValues>();

  const productsQuery = useQuery({
    queryKey: ["inventory-adjustment-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", storeId],
    queryFn: () => inventoryApi.batches({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const productItems = useMemo(() => (productsQuery.data?.items ?? []) as ProductOption[], [productsQuery.data]);
  const productMap = useMemo(
    () => new Map(productItems.map((product) => [product.id, product])),
    [productItems]
  );
  const batchRows = useMemo(() => batchesQuery.data ?? [], [batchesQuery.data]);
  const batchOptions = batchRows.map((batch) => ({
    value: batch.id,
    label: getInventoryBatchLabel(batch, productMap)
  }));
  const rollBatchOptions = batchRows
    .filter((batch) => batch.unit === "ROLL")
    .map((batch) => ({
      value: batch.id,
      label: getInventoryBatchLabel(batch, productMap)
    }));

  const invalidateInventory = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
      queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
    ]);

  const convertBatch = useMutation({
    mutationFn: (values: ConversionFormValues) =>
      inventoryApi.convertBatch(values.batchId, {
        fromUnit: "ROLL",
        toUnit: "METER",
        quantity: values.quantity,
        convertedQuantity: values.convertedQuantity
      }),
    onSuccess: async () => {
      message.success("单位转换已记录");
      conversionForm.resetFields();
      await invalidateInventory();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const splitBatch = useMutation({
    mutationFn: (values: SplitFormValues) =>
      inventoryApi.splitBatch(values.batchId, { quantityMeters: values.quantityMeters }),
    onSuccess: async () => {
      message.success("拆分记录已生成");
      splitForm.resetFields();
      await invalidateInventory();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createStockOperation = useMutation({
    mutationFn: (values: StockOperationFormValues) => inventoryApi.createStockOperation(values),
    onSuccess: async () => {
      message.success("库存调整已记录");
      stockForm.resetFields();
      await invalidateInventory();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createTransferOperation = useMutation({
    mutationFn: (values: TransferFormValues) =>
      inventoryApi.createStockOperation({
        batchId: values.batchId,
        movementType: "TRANSFER_OUT",
        quantity: values.quantity,
        note: [values.fromWarehouse, values.toWarehouse].filter(Boolean).join(" -> ") || "调拨出库"
      }),
    onSuccess: async () => {
      message.success("调拨记录已提交");
      transferForm.resetFields();
      await invalidateInventory();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const adjustmentMetrics = getAdjustmentMetrics(batchRows);

  return (
    <div className="management-page adjustment-workspace-page">
      <header className="adjustment-topbar">
        <div>
          <button type="button" aria-label="返回库存管理" onClick={() => router.push("/inventory")}>
            <ArrowLeftOutlined />
          </button>
          <div>
            <h1>库存调整操作</h1>
            <span>库存管理 / 单位转换与调整</span>
          </div>
        </div>
        <div>
          <Button onClick={() => router.push("/inventory")}>取消操作</Button>
          <Button type="primary" icon={<CheckOutlined />} onClick={() => stockForm.submit()}>
            确认提交
          </Button>
        </div>
      </header>

      <main className="adjustment-canvas">
        <section className="adjustment-metric-strip">
          {[
            ["可调整批次", adjustmentMetrics.batchCount],
            ["卷材批次", adjustmentMetrics.rollBatchCount],
            ["米制库存", adjustmentMetrics.meterQuantity],
            ["低库存批次", adjustmentMetrics.lowStockCount]
          ].map(([label, value]) => (
            <Card key={label} className="adjustment-metric-card">
              <span>{label}</span>
              <strong>{value}</strong>
            </Card>
          ))}
        </section>

        <Card className="adjustment-panel adjustment-conversion-panel">
          <div className="adjustment-section-title">
            <ScissorOutlined />
            <h2>单位转换与拆分</h2>
          </div>
          <div className="adjustment-conversion-grid">
            <Form
              form={conversionForm}
              layout="vertical"
              className="adjustment-form"
              onFinish={(values) => convertBatch.mutate(values)}
            >
              <Form.Item name="batchId" label="选择批次" rules={[{ required: true, message: "请选择批次" }]}>
                <Select showSearch optionFilterProp="label" placeholder="选择卷单位批次" options={rollBatchOptions} />
              </Form.Item>
              <Form.Item name="quantity" label="原库存状态" rules={[{ required: true, message: "请输入卷数" }]}>
                <span className="adjustment-unit-input">
                  <InputNumber min={1} precision={0} placeholder="1" className="w-full" />
                  <span>卷</span>
                </span>
              </Form.Item>
              <Form.Item name="convertedQuantity" label="转换后米数" rules={[{ required: true, message: "请输入米数" }]}>
                <span className="adjustment-unit-input">
                  <InputNumber min={1} precision={0} placeholder="15" className="w-full" />
                  <span>米</span>
                </span>
              </Form.Item>
              <Button htmlType="submit" icon={<SwapOutlined />} loading={convertBatch.isPending}>
                添加转换记录
              </Button>
            </Form>

            <Form
              form={splitForm}
              layout="vertical"
              className="adjustment-form adjustment-split-form"
              onFinish={(values) => splitBatch.mutate(values)}
            >
              <Form.Item name="batchId" label="拆分批次" rules={[{ required: true, message: "请选择批次" }]}>
                <Select showSearch optionFilterProp="label" placeholder="选择批次" options={rollBatchOptions} />
              </Form.Item>
              <Form.Item name="quantityMeters" label="拆分长度" rules={[{ required: true, message: "请输入拆分长度" }]}>
                <span className="adjustment-unit-input">
                  <InputNumber min={0.001} precision={3} placeholder="30" className="w-full" />
                  <span>米</span>
                </span>
              </Form.Item>
              <Form.Item label="新批次后缀">
                <Input value="-S01" disabled />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<ScissorOutlined />} loading={splitBatch.isPending}>
                添加拆分记录
              </Button>
            </Form>
          </div>
        </Card>

        <Card className="adjustment-panel adjustment-count-table">
          <div className="adjustment-section-title">
            <CheckOutlined />
            <h2>库存盘点与报损</h2>
          </div>
          <div className="adjustment-count-mobile-cards">
            {batchRows.slice(0, 6).map((row) => (
              <article className="adjustment-count-mobile-card" key={row.id}>
                <div className="adjustment-count-mobile-card-head">
                  <div>
                    <strong>{row.batchNo}</strong>
                    <span>{getInventoryProductLabel(row.productId, productMap)}</span>
                  </div>
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </div>
                <dl className="adjustment-count-mobile-card-fields">
                  <div>
                    <dt>系统库存</dt>
                    <dd>{row.availableQuantity ?? 0} {getProductUnitLabel(row.unit)}</dd>
                  </div>
                  <div>
                    <dt>差异</dt>
                    <dd className="adjustment-diff-value">0 {getProductUnitLabel(row.unit)}</dd>
                  </div>
                </dl>
                <div className="adjustment-count-mobile-controls">
                  <label>
                    <span>实际盘点</span>
                    <span className="adjustment-unit-input">
                      <InputNumber min={0} defaultValue={Number(row.availableQuantity ?? 0)} />
                      <span>{getProductUnitLabel(row.unit)}</span>
                    </span>
                  </label>
                  <label>
                    <span>原因说明</span>
                    <Select
                      className="w-full"
                      defaultValue="COUNT_OUT"
                      options={[
                        { value: "COUNT_OUT", label: "盘点误差" },
                        { value: "DAMAGE_OUT", label: "施工损耗" },
                        { value: "RETURN_OUT", label: "退货出库" }
                      ]}
                    />
                  </label>
                </div>
              </article>
            ))}
            {batchRows.length === 0 ? <div className="adjustment-count-mobile-empty">暂无可盘点批次</div> : null}
          </div>
          <Table<InventoryBatchSummary>
            className="adjustment-count-desktop-table"
            rowKey="id"
            loading={batchesQuery.isLoading}
            dataSource={batchRows.slice(0, 6)}
            pagination={false}
            columns={[
              {
                title: "批次号 / 物料",
                render: (_, row) => (
                  <div className="adjustment-batch-cell">
                    <strong>{row.batchNo}</strong>
                    <span>{getInventoryProductLabel(row.productId, productMap)}</span>
                  </div>
                )
              },
              {
                title: "系统库存",
                render: (_, row) => `${row.availableQuantity ?? 0} ${getProductUnitLabel(row.unit)}`
              },
              {
                title: "实际盘点",
                render: (_, row) => (
                  <span className="adjustment-unit-input">
                    <InputNumber min={0} defaultValue={Number(row.availableQuantity ?? 0)} />
                    <span>{getProductUnitLabel(row.unit)}</span>
                  </span>
                )
              },
              {
                title: "差异",
                render: (_, row) => <span className="adjustment-diff-value">0 {getProductUnitLabel(row.unit)}</span>
              },
              {
                title: "原因说明",
                render: () => (
                  <Select
                    className="w-full"
                    defaultValue="COUNT_OUT"
                    options={[
                      { value: "COUNT_OUT", label: "盘点误差" },
                      { value: "DAMAGE_OUT", label: "施工损耗" },
                      { value: "RETURN_OUT", label: "退货出库" }
                    ]}
                  />
                )
              },
              {
                title: "操作",
                render: () => (
                  <Button type="text" danger icon={<DeleteOutlined />} />
                )
              }
            ]}
          />

          <Form
            form={stockForm}
            layout="inline"
            className="adjustment-stock-form"
            onFinish={(values) => createStockOperation.mutate(values)}
          >
            <Form.Item name="batchId" rules={[{ required: true, message: "请选择批次" }]}>
              <Select showSearch optionFilterProp="label" placeholder="批次" options={batchOptions} />
            </Form.Item>
            <Form.Item name="movementType" rules={[{ required: true, message: "请选择类型" }]}>
              <Select
                placeholder="调整类型"
                options={[
                  { value: "COUNT_IN", label: "盘点入库" },
                  { value: "COUNT_OUT", label: "盘点出库" },
                  { value: "DAMAGE_OUT", label: "报损出库" },
                  { value: "RETURN_IN", label: "退货入库" },
                  { value: "RETURN_OUT", label: "退货出库" }
                ]}
              />
            </Form.Item>
            <Form.Item name="quantity" rules={[{ required: true, message: "请输入数量" }]}>
              <InputNumber min={0.001} placeholder="数量" />
            </Form.Item>
            <Form.Item name="note">
              <Input placeholder="原因说明" />
            </Form.Item>
            <Button htmlType="submit" type="primary" loading={createStockOperation.isPending}>
              提交盘点差异
            </Button>
          </Form>
        </Card>

        <Card className="adjustment-panel adjustment-transfer-panel">
          <div className="adjustment-section-title">
            <TruckOutlined />
            <h2>调拨管理</h2>
          </div>
          <Form
            form={transferForm}
            layout="vertical"
            className="adjustment-transfer-form"
            onFinish={(values) => createTransferOperation.mutate(values)}
          >
            <Form.Item name="batchId" label="调拨批次" rules={[{ required: true, message: "请选择批次" }]}>
              <Select showSearch optionFilterProp="label" placeholder="选择批次" options={batchOptions} />
            </Form.Item>
            <Form.Item name="fromWarehouse" label="调出仓库">
              <Select
                placeholder="主仓库（A区）"
                options={[
                  { value: "主仓库（A区）", label: "主仓库（A区）" },
                  { value: "门店缓存区", label: "门店缓存区" }
                ]}
              />
            </Form.Item>
            <Form.Item name="toWarehouse" label="调入仓库">
              <Select
                placeholder="施工车间缓存区"
                options={[
                  { value: "施工车间缓存区", label: "施工车间缓存区" },
                  { value: "主仓库（B区）", label: "主仓库（B区）" }
                ]}
              />
            </Form.Item>
            <Form.Item name="quantity" label="调拨数量" rules={[{ required: true, message: "请输入调拨数量" }]}>
              <InputNumber min={0.001} placeholder="数量" className="w-full" />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<TruckOutlined />} loading={createTransferOperation.isPending}>
              提交调拨
            </Button>
          </Form>
        </Card>
      </main>
    </div>
  );
}

function getAdjustmentMetrics(rows: InventoryBatchSummary[]) {
  return {
    batchCount: rows.length,
    rollBatchCount: rows.filter((row) => row.unit === "ROLL").length,
    meterQuantity: formatQuantity(
      rows.filter((row) => row.unit === "METER").reduce((total, row) => total + Number(row.availableQuantity ?? 0), 0)
    ),
    lowStockCount: rows.filter((row) => Number(row.availableQuantity ?? 0) <= 1).length
  };
}

function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
