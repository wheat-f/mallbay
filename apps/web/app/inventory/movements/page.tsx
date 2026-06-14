"use client";

import type { InventoryBatchSummary, InventoryMovementType, ProductUnit } from "@mallbay/shared";
import {
  AlertOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  DatabaseOutlined,
  DownloadOutlined,
  PlusOutlined,
  SearchOutlined
} from "@ant-design/icons";
import { Button, Card, DatePicker, Form, Input, Select, Table, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { inventoryApi, productApi, userApi } from "../../../src/lib/api";
import {
  getInventoryBatchLabel,
  getInventoryMovementSummary,
  getInventoryMovementTypeLabel,
  getInventoryProductLabel,
  INVENTORY_BATCH_MISSING_LABEL,
  INVENTORY_MOVEMENT_TYPE_LABEL
} from "../../../src/features/inventory/display";
import { getProductDisplayName, getProductUnitLabel } from "../../../src/features/products/display";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

const { RangePicker } = DatePicker;

type ProductOption = {
  id: string;
  brand?: string | null;
  name?: string | null;
  model?: string | null;
  inventoryUnit?: ProductUnit | null;
  unit?: ProductUnit | null;
  specification?: string | null;
};

type OperatorOption = {
  id: string;
  username: string;
  nickname?: string | null;
};

type MovementRow = {
  id: string;
  movementType?: InventoryMovementType | string | null;
  productId?: string | null;
  batchId?: string | null;
  quantity?: number | string | null;
  unit?: ProductUnit | string | null;
  balanceQuantity?: number | string | null;
  orderId?: string | null;
  sourceOrderNo?: string | null;
  sourceNo?: string | null;
  note?: string | null;
  createdAt?: string | null;
  createdById?: string | null;
  createdBy?: {
    username?: string | null;
    nickname?: string | null;
  } | null;
  product?: {
    brand?: string | null;
    name?: string | null;
    model?: string | null;
    inventoryUnit?: ProductUnit | string | null;
    unit?: ProductUnit | string | null;
    specification?: string | null;
  } | null;
  batch?: {
    batchNo?: string | null;
    unit?: ProductUnit | string | null;
    availableQuantity?: number | string | null;
  } | null;
  order?: {
    orderNo?: string | null;
  } | null;
};

type MovementFilterValues = {
  productId?: string;
  batchId?: string;
  movementType?: InventoryMovementType;
  orderId?: string;
  createdById?: string;
  dateRange?: unknown;
};

export default function InventoryMovementsPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [filterForm] = Form.useForm<MovementFilterValues>();
  const [movementFilters, setMovementFilters] = useState<Omit<MovementFilterValues, "dateRange">>({});
  const [operatorKeyword, setOperatorKeyword] = useState("");

  const productsQuery = useQuery({
    queryKey: ["inventory-movement-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", storeId],
    queryFn: () => inventoryApi.batches({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const movementsQuery = useQuery({
    queryKey: ["inventory-movements", storeId, movementFilters],
    queryFn: () => inventoryApi.movements({ storeId: storeId!, ...movementFilters }),
    enabled: Boolean(storeId)
  });
  const movementOperatorsQuery = useQuery({
    queryKey: ["inventory-movement-ledger-operators", operatorKeyword],
    queryFn: () => userApi.searchUsers(operatorKeyword.trim()),
    enabled: operatorKeyword.trim().length > 0
  });

  const productItems = useMemo(() => (productsQuery.data?.items ?? []) as ProductOption[], [productsQuery.data]);
  const productMap = useMemo(() => new Map(productItems.map((product) => [product.id, product])), [productItems]);
  const batchRows = useMemo(() => batchesQuery.data ?? [], [batchesQuery.data]);
  const batchMap = useMemo(() => new Map(batchRows.map((batch) => [batch.id, batch])), [batchRows]);
  const movementRows = useMemo(() => (movementsQuery.data ?? []) as MovementRow[], [movementsQuery.data]);
  const movementSummary = getInventoryMovementSummary(movementRows);
  const anomalyRows = movementRows.filter(isAnomalyMovement);
  const traceRows = movementRows.slice(0, 5);
  const isMovementsLoading = movementsQuery.isLoading;

  const productOptions = productItems.map((product) => ({
    value: product.id,
    label: getProductDisplayName({
      brand: product.brand ?? undefined,
      name: product.name ?? undefined,
      model: product.model ?? undefined
    }) || product.id
  }));
  const batchOptions = batchRows.map((batch) => ({
    value: batch.id,
    label: getInventoryBatchLabel(batch, productMap)
  }));
  const movementTypeOptions = (Object.entries(INVENTORY_MOVEMENT_TYPE_LABEL) as Array<[InventoryMovementType, string]>).map(
    ([value, label]) => ({ value, label })
  );
  const movementOperatorOptions = ((movementOperatorsQuery.data ?? []) as OperatorOption[]).map((operator) => ({
    value: operator.id,
    label: [operator.nickname, `@${operator.username}`].filter(Boolean).join(" ")
  }));

  const applyFilters = ({ dateRange: _dateRange, ...values }: MovementFilterValues) => {
    setMovementFilters(removeEmptyFilters(values));
  };

  return (
    <div className="movement-ledger-page">
      <StorePageHeader title="库存流水" description="追踪入库、出库、锁库、调拨、报损和盘点调整的完整批次链路">
        <Button icon={<DownloadOutlined />}>导出报表</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/inventory")}>
          新增入库
        </Button>
      </StorePageHeader>

      <section className="movement-kpi-grid">
        <MovementKpiCard
          icon={<ArrowDownOutlined />}
          label="今日入库总量"
          value={movementSummary.inbound}
          unit="件"
          tone="success"
          description="采购、盘点和退货入库"
        />
        <MovementKpiCard
          icon={<ArrowUpOutlined />}
          label="今日出库总量"
          value={movementSummary.outbound}
          unit="件"
          tone="primary"
          description="订单出库、报损和调拨"
        />
        <MovementKpiCard
          icon={<AlertOutlined />}
          label="异常波动笔数"
          value={anomalyRows.length.toString()}
          unit="笔"
          tone="danger"
          description="盘点、报损和单位转换"
        />
      </section>

      <Card className="movement-filter-panel">
        <Form form={filterForm} layout="vertical" onFinish={applyFilters}>
          <div className="movement-filter-grid">
            <Form.Item name="productId" label="产品名称 / 规格">
              <Select allowClear showSearch optionFilterProp="label" placeholder="输入关键字搜索..." options={productOptions} />
            </Form.Item>
            <Form.Item name="movementType" label="流动类型">
              <Select allowClear placeholder="全部类型" options={movementTypeOptions} />
            </Form.Item>
            <Form.Item name="dateRange" label="日期范围">
              <RangePicker className="w-full" />
            </Form.Item>
            <Form.Item name="batchId" label="批次号">
              <Select allowClear showSearch optionFilterProp="label" placeholder="输入完整批次号" options={batchOptions} />
            </Form.Item>
            <Form.Item name="orderId" label="关联单号">
              <Input placeholder="输入订单号或采购单号" />
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
          <div className="movement-filter-actions">
            <Button
              onClick={() => {
                filterForm.resetFields();
                setMovementFilters({});
              }}
            >
              重置
            </Button>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              查询流水
            </Button>
          </div>
        </Form>
      </Card>

      <div className="movement-workspace-grid">
        <Card className="movement-ledger-table">
          <div className="movement-ledger-mobile-cards">
            {movementRows.length > 0 ? (
              movementRows.map((row) => (
                <article className="movement-ledger-mobile-card" key={row.id}>
                  <div className="movement-ledger-mobile-card-head">
                    <div>
                      <strong>{getMovementProductLabel(row, productMap)}</strong>
                      <span>{getMovementProductSpec(row, productMap)}</span>
                    </div>
                    <span className={`movement-type-pill movement-type-${getMovementTone(row.movementType)}`}>
                      {getInventoryMovementTypeLabel(row.movementType)}
                    </span>
                  </div>
                  <dl className="movement-ledger-mobile-card-fields">
                    <div>
                      <dt>变动时间</dt>
                      <dd>{formatDateTime(row.createdAt)}</dd>
                    </div>
                    <div>
                      <dt>批次号</dt>
                      <dd>{getMovementBatchNo(row, batchMap)}</dd>
                    </div>
                    <div>
                      <dt>变动数量</dt>
                      <dd className={`movement-quantity movement-quantity-${getMovementDirection(row.movementType)}`}>{formatSignedQuantity(row)}</dd>
                    </div>
                    <div>
                      <dt>单位</dt>
                      <dd>{getMovementUnitLabel(row, batchMap, productMap)}</dd>
                    </div>
                    <div>
                      <dt>结存数量</dt>
                      <dd>{row.balanceQuantity ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>关联单号</dt>
                      <dd>{getMovementSourceLabel(row)}</dd>
                    </div>
                    <div>
                      <dt>操作人</dt>
                      <dd>{getMovementOperatorLabel(row)}</dd>
                    </div>
                    <div>
                      <dt>备注</dt>
                      <dd>{row.note || "无备注"}</dd>
                    </div>
                  </dl>
                </article>
              ))
            ) : (
              <div className="movement-ledger-mobile-empty">
                {isMovementsLoading ? "正在加载库存流水..." : "暂无库存流水"}
              </div>
            )}
          </div>
          <Table<MovementRow>
            className="movement-ledger-desktop-table"
            rowKey={(row) => row.id}
            loading={isMovementsLoading}
            dataSource={movementRows}
            scroll={{ x: 1180 }}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            columns={[
              {
                title: "变动时间",
                width: 170,
                render: (_, row) => formatDateTime(row.createdAt)
              },
              {
                title: "产品/规格",
                width: 240,
                render: (_, row) => (
                  <div className="movement-product-cell">
                    <strong>{getMovementProductLabel(row, productMap)}</strong>
                    <span>{getMovementProductSpec(row, productMap)}</span>
                  </div>
                )
              },
              {
                title: "批次号",
                width: 190,
                render: (_, row) => <span className="movement-batch-link">{getMovementBatchNo(row, batchMap)}</span>
              },
              {
                title: "变动类型",
                width: 130,
                align: "center",
                render: (_, row) => (
                  <span className={`movement-type-pill movement-type-${getMovementTone(row.movementType)}`}>
                    {getInventoryMovementTypeLabel(row.movementType)}
                  </span>
                )
              },
              {
                title: "变动数量",
                width: 120,
                align: "right",
                render: (_, row) => <span className={`movement-quantity movement-quantity-${getMovementDirection(row.movementType)}`}>{formatSignedQuantity(row)}</span>
              },
              {
                title: "单位",
                width: 90,
                render: (_, row) => getMovementUnitLabel(row, batchMap, productMap)
              },
              {
                title: "结存数量",
                width: 120,
                align: "right",
                render: (_, row) => <strong>{row.balanceQuantity ?? "-"}</strong>
              },
              {
                title: "关联单号",
                width: 170,
                render: (_, row) => <span className="movement-source-link">{getMovementSourceLabel(row)}</span>
              },
              {
                title: "操作人",
                width: 140,
                render: (_, row) => getMovementOperatorLabel(row)
              },
              {
                title: "备注",
                width: 220,
                render: (_, row) => row.note || "无备注"
              }
            ]}
          />
        </Card>

        <aside className="movement-side-stack">
          <Card className="movement-alert-panel" title="近期异常提醒">
            {anomalyRows.length ? (
              <div className="movement-alert-list">
                {anomalyRows.slice(0, 4).map((row) => (
                  <div key={row.id} className="movement-alert-item">
                    <span>{getInventoryMovementTypeLabel(row.movementType)}</span>
                    <strong>{getMovementBatchNo(row, batchMap)}</strong>
                    <p>{row.note || "请复核批次数量、关联单据和操作人。"}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Typography.Text type="secondary">暂无异常波动</Typography.Text>
            )}
          </Card>

          <Card className="movement-trace-panel" title="批次追踪">
            <div className="movement-trace-list">
              {traceRows.map((row) => (
                <div key={row.id} className="movement-trace-item">
                  <DatabaseOutlined />
                  <div>
                    <strong>{getMovementBatchNo(row, batchMap)}</strong>
                    <span>{getInventoryMovementTypeLabel(row.movementType)} / {formatSignedQuantity(row)}</span>
                    <p>{formatDateTime(row.createdAt)} · {getMovementOperatorLabel(row)}</p>
                  </div>
                </div>
              ))}
              {traceRows.length === 0 ? <Typography.Text type="secondary">暂无批次流水</Typography.Text> : null}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function MovementKpiCard({
  icon,
  label,
  value,
  unit,
  tone,
  description
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  tone: "success" | "primary" | "danger";
  description: string;
}) {
  return (
    <Card className={`movement-kpi-card movement-kpi-${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}<em>{unit}</em></strong>
        <p>{description}</p>
      </div>
      <div className="movement-kpi-icon">{icon}</div>
    </Card>
  );
}

function removeEmptyFilters(values: Omit<MovementFilterValues, "dateRange">) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== "")
  ) as Omit<MovementFilterValues, "dateRange">;
}

function getMovementProductLabel(row: MovementRow, productMap: Map<string, ProductOption>) {
  if (row.product) {
    return getProductDisplayName({
      brand: row.product.brand ?? undefined,
      name: row.product.name ?? undefined,
      model: row.product.model ?? undefined
    }) || "产品未命名";
  }
  return getInventoryProductLabel(row.productId, productMap);
}

function getMovementProductSpec(row: MovementRow, productMap: Map<string, ProductOption>) {
  const product = row.productId ? productMap.get(row.productId) : undefined;
  const specification = row.product?.specification ?? product?.specification;
  const unit = row.product?.inventoryUnit ?? row.product?.unit ?? product?.inventoryUnit ?? product?.unit;
  return [specification, unit ? getProductUnitLabel(unit) : undefined].filter(Boolean).join(" / ") || "规格未加载";
}

function getMovementBatchNo(row: MovementRow, batchMap: Map<string, InventoryBatchSummary>) {
  if (row.batch?.batchNo) return row.batch.batchNo;
  const batch = row.batchId ? batchMap.get(row.batchId) : undefined;
  return batch?.batchNo ?? INVENTORY_BATCH_MISSING_LABEL;
}

function getMovementUnitLabel(
  row: MovementRow,
  batchMap: Map<string, InventoryBatchSummary>,
  productMap: Map<string, ProductOption>
) {
  const batch = row.batchId ? batchMap.get(row.batchId) : undefined;
  const product = row.productId ? productMap.get(row.productId) : undefined;
  const unit = row.unit ?? row.batch?.unit ?? batch?.unit ?? row.product?.inventoryUnit ?? row.product?.unit ?? product?.inventoryUnit ?? product?.unit;
  return unit ? getProductUnitLabel(unit) : "-";
}

function getMovementSourceLabel(row: MovementRow) {
  return row.order?.orderNo ?? row.sourceOrderNo ?? row.sourceNo ?? (row.orderId ? "关联单据未加载" : "手工调整");
}

function getMovementOperatorLabel(row: MovementRow) {
  if (row.createdBy) {
    return [row.createdBy.nickname, row.createdBy.username ? `@${row.createdBy.username}` : undefined].filter(Boolean).join(" ");
  }
  return row.createdById ? "操作人未加载" : "系统";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return value.slice(0, 19).replace("T", " ");
}

function formatSignedQuantity(row: MovementRow) {
  const quantity = Number(row.quantity ?? 0);
  const direction = getMovementDirection(row.movementType);
  const prefix = direction === "inbound" ? "+" : direction === "outbound" ? "-" : "";
  return `${prefix}${Number.isInteger(quantity) ? quantity : quantity.toFixed(3)}`;
}

function getMovementDirection(type?: string | null) {
  if (["PURCHASE_IN", "COUNT_IN", "TRANSFER_IN", "RETURN_IN"].includes(type ?? "")) return "inbound";
  if (["ORDER_OUT", "COUNT_OUT", "DAMAGE_OUT", "TRANSFER_OUT", "RETURN_OUT", "DAMAGE"].includes(type ?? "")) return "outbound";
  return "neutral";
}

function getMovementTone(type?: string | null) {
  if (["PURCHASE_IN", "COUNT_IN", "RETURN_IN"].includes(type ?? "")) return "success";
  if (["ORDER_OUT", "ORDER_LOCK", "STOCK_RELEASE"].includes(type ?? "")) return "primary";
  if (isAnomalyMovement({ movementType: type })) return "danger";
  return "neutral";
}

function isAnomalyMovement(row: { movementType?: string | null }) {
  return ["COUNT_OUT", "DAMAGE_OUT", "DAMAGE", "STOCK_ADJUST", "UNIT_CONVERSION", "BATCH_SPLIT"].includes(row.movementType ?? "");
}
