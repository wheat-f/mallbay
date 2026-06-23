"use client";

import type { ProductUnit } from "@mallbay/shared";
import { Alert, AutoComplete, Button, Card, DatePicker, Empty, Form, InputNumber, Select, Tag, message } from "antd";
import { ArrowLeftOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { purchaseApi } from "../../../src/lib/api";
import {
  getInventoryOrderCustomerLabel,
  getInventoryOrderItemsSummary,
  getInventoryOrderVehicleLabel,
  getInventoryProductLabel,
  getPurchaseRequirementStatusLabel
} from "../../../src/features/inventory/display";
import { productApi } from "../../../src/features/products/api";
import { getProductDisplayName, getProductUnitLabel, PRODUCT_UNIT_OPTIONS } from "../../../src/features/products/display";
import { PurchaseModuleNav } from "../../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

type PurchaseRequirementRow = {
  id: string;
  status?: string;
  sourceOrderId?: string | null;
  sourceOrder?: {
    orderNo?: string | null;
    customer?: Parameters<typeof getInventoryOrderCustomerLabel>[0]["customer"];
    vehicle?: Parameters<typeof getInventoryOrderVehicleLabel>[0]["vehicle"];
    items?: Parameters<typeof getInventoryOrderItemsSummary>[0]["items"];
  } | null;
  items?: Array<{
    productId?: string | null;
    requiredQuantity?: number | string | null;
    requiredUnit?: ProductUnit | string | null;
  }>;
  purchaseOrders?: PurchaseRequirementOrderSummary[];
};

type PurchaseRequirementOrderSummary = {
  id: string;
  orderNo?: string | null;
  supplierName?: string | null;
  status?: string | null;
  expectedAt?: string | null;
};

type ProductOption = {
  id: string;
  brand?: string;
  name?: string;
  model?: string;
  unit?: ProductUnit;
  inventoryUnit?: ProductUnit | null;
};

type SupplierOption = {
  id: string;
  name: string;
};

export default function PurchaseRequirementsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createRequirementForm] = Form.useForm();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManagePurchase = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const requirementsQuery = useQuery({
    queryKey: ["purchase-requirements", storeId],
    queryFn: () => purchaseApi.requirements(storeId!),
    enabled: Boolean(storeId)
  });
  const productsQuery = useQuery({
    queryKey: ["purchase-requirement-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, page: 1, pageSize: 200 }),
    enabled: Boolean(storeId) && canManagePurchase
  });
  const suppliersQuery = useQuery({
    queryKey: ["purchase-requirement-suppliers", storeId],
    queryFn: () => purchaseApi.suppliers(storeId!),
    enabled: Boolean(storeId) && canManagePurchase
  });
  const productItems = useMemo(() => (productsQuery.data?.items ?? []) as ProductOption[], [productsQuery.data]);
  const productLookup = useMemo(() => new Map(productItems.map((product) => [product.id, product])), [productItems]);
  const productOptions = productItems.map((product) => ({
    value: product.id,
    label: getProductDisplayName(product)
  }));
  const supplierOptions = ((suppliersQuery.data ?? []) as SupplierOption[]).map((supplier) => ({
    value: supplier.name,
    label: supplier.name
  }));
  const createRequirement = useMutation({
    mutationFn: (values: { productId: string; requiredQuantity: number; requiredUnit: ProductUnit }) => {
      if (!storeId) throw new Error("请先选择门店");
      return purchaseApi.createRequirement({
        storeId,
        items: [
          {
            productId: values.productId,
            requiredQuantity: values.requiredQuantity,
            requiredUnit: values.requiredUnit
          }
        ]
      });
    },
    onSuccess: async () => {
      message.success("采购需求已创建");
      createRequirementForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-requirements", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchases-overview", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });
  const createOrder = useMutation({
    mutationFn: (values: { id: string; supplierName: string; expectedAt?: unknown }) =>
      purchaseApi.createPurchaseOrderFromRequirement(values.id, {
        supplierName: values.supplierName.trim(),
        expectedAt: formatDatePickerValue(values.expectedAt)
      }),
    onSuccess: async () => {
      message.success("采购订单已创建");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-requirements", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchases-overview", storeId] })
      ]);
      router.push("/purchases/orders");
    },
    onError: (error: Error) => message.error(error.message)
  });
  const rows = (requirementsQuery.data ?? []) as PurchaseRequirementRow[];

  return (
    <div className="management-page purchases-requirements-page">
      <StorePageHeader title="采购需求" description="查看缺货需求、人工采购申请和采购转单状态。">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/purchases")}>返回采购总览</Button>
      </StorePageHeader>

      {!canManagePurchase ? (
        <Alert className="management-readonly-alert" type="info" showIcon message="只读模式" description="客服可查看采购需求来源和状态，不能创建采购订单。" />
      ) : null}

      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="requirements" />
        <div className="purchase-module-content">
          {canManagePurchase ? (
            <Card className="management-filter-card purchases-requirement-create-card" title="新建采购需求">
              <Form
                form={createRequirementForm}
                layout="vertical"
                className="purchases-requirement-create-form"
                initialValues={{ requiredUnit: "ROLL" }}
                onFinish={(values: { productId: string; requiredQuantity: number; requiredUnit: ProductUnit }) => createRequirement.mutate(values)}
              >
                <Form.Item name="productId" label="选择采购产品" rules={[{ required: true, message: "请选择采购产品" }]}>
                  <Select showSearch optionFilterProp="label" loading={productsQuery.isLoading} placeholder="按品牌、名称或型号搜索" options={productOptions} />
                </Form.Item>
                <Form.Item name="requiredQuantity" label="需求数量" rules={[{ required: true, message: "请输入需求数量" }]}>
                  <InputNumber className="w-full" min={0.001} placeholder="输入采购数量" />
                </Form.Item>
                <Form.Item name="requiredUnit" label="需求单位" rules={[{ required: true, message: "请选择需求单位" }]}>
                  <Select options={PRODUCT_UNIT_OPTIONS} />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={createRequirement.isPending}>
                  提交采购需求
                </Button>
              </Form>
            </Card>
          ) : null}

          <Card className="management-table-card purchase-requirement-list-card" title="采购需求列表">
            <div className="purchase-requirement-list">
              {requirementsQuery.isLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div className="purchase-requirement-card is-loading" key={index}>
                    <span />
                    <span />
                    <span />
                  </div>
                ))
              ) : null}
              {!requirementsQuery.isLoading && rows.length === 0 ? (
                <Empty description="暂无采购需求" />
              ) : null}
              {!requirementsQuery.isLoading ? rows.map((row) => {
                const source = formatPurchaseRequirementSource(row);
                const items = formatPurchaseRequirementItems(row, productLookup);
                const relatedPurchaseOrders = row.purchaseOrders ?? [];
                const canCreateOrder = canManagePurchase && canCreatePurchaseOrderFromRequirement(row);

                return (
                  <article className="purchase-requirement-card" key={row.id}>
                    <div className="purchase-requirement-summary">
                      <div className="purchase-requirement-card-head">
                        <div>
                          <span>需求来源</span>
                          <strong>{source.title}</strong>
                        </div>
                        <Tag>{getPurchaseRequirementStatusLabel(row.status)}</Tag>
                      </div>
                      <div className="purchase-requirement-card-body">
                        <section className="purchase-requirement-info-block">
                          <span>客户 / 车辆</span>
                          <p>{source.meta}</p>
                          <small>{source.detail}</small>
                        </section>
                        <section className="purchase-requirement-info-block">
                          <span>产品需求</span>
                          <ul>
                            {items.map((item, index) => (
                              <li key={`${row.id}-item-${index}`}>
                                <strong>{item.name}</strong>
                                <em>{item.quantity}</em>
                              </li>
                            ))}
                          </ul>
                        </section>
                      </div>
                    </div>
                    <div className="purchase-requirement-action-panel">
                      <PurchaseRequirementOrderAction
                        row={row}
                        canCreateOrder={canCreateOrder}
                        relatedPurchaseOrders={relatedPurchaseOrders}
                        supplierOptions={supplierOptions}
                        loading={createOrder.isPending}
                        submitLabel={relatedPurchaseOrders.length > 0 ? "继续生成采购单" : "生成采购订单"}
                        onOpenOrder={(order) => router.push(`/purchases/orders/${order.id}`)}
                        onSubmit={(values) => createOrder.mutate(values)}
                      />
                    </div>
                  </article>
                );
              }) : null}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PurchaseRequirementOrderAction({
  row,
  canCreateOrder,
  relatedPurchaseOrders,
  supplierOptions,
  loading,
  submitLabel,
  onOpenOrder,
  onSubmit
}: {
  row: PurchaseRequirementRow;
  canCreateOrder: boolean;
  relatedPurchaseOrders: PurchaseRequirementOrderSummary[];
  supplierOptions: Array<{ value: string; label: string }>;
  loading: boolean;
  submitLabel: string;
  onOpenOrder: (order: PurchaseRequirementOrderSummary) => void;
  onSubmit: (values: { id: string; supplierName: string; expectedAt?: unknown }) => void;
}) {
  const [form] = Form.useForm();
  return (
    <div className="purchase-requirement-order-stack">
      {relatedPurchaseOrders.length > 0 ? (
        <section className="purchase-requirement-related-orders">
          <span>{relatedPurchaseOrders.length > 1 ? `已生成 ${relatedPurchaseOrders.length} 张采购单` : "需求已转采购单"}</span>
          <div>
            {relatedPurchaseOrders.map((order) => (
              <button key={order.id} type="button" onClick={() => onOpenOrder(order)}>
                <strong>{order.orderNo ?? "未编号采购单"}</strong>
                <small>{[order.supplierName ?? "供应商待确认", getPurchaseRequirementOrderStatusLabel(order.status)].join(" · ")}</small>
                <em>查看采购单</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {canCreateOrder ? (
        <Form
          form={form}
          layout="inline"
          className="purchase-order-inline-form"
          onFinish={(values: { supplierName?: string; expectedAt?: unknown }) => {
            const supplierName = values.supplierName?.trim();
            if (!supplierName) return;
            onSubmit({ id: row.id, supplierName, expectedAt: values.expectedAt });
          }}
        >
          <Form.Item name="supplierName" label="转采购单设置" rules={[{ required: true, message: "请输入供应商" }]}>
            <AutoComplete
              options={supplierOptions}
              placeholder="供应商"
              filterOption={(inputValue, option) =>
                String(option?.value ?? "").toLowerCase().includes(inputValue.toLowerCase())
              }
            />
          </Form.Item>
          <Form.Item name="expectedAt" label="预计到货">
            <DatePicker />
          </Form.Item>
          <Button
            icon={<ShoppingCartOutlined />}
            size="small"
            type="primary"
            htmlType="submit"
            loading={loading}
          >
            {submitLabel}
          </Button>
        </Form>
      ) : relatedPurchaseOrders.length === 0 ? (
        <div className="purchase-requirement-order-note">当前角色只能查看采购需求和采购单。</div>
      ) : null}
    </div>
  );
}

function formatDatePickerValue(value: unknown) {
  if (!value) return undefined;
  if (typeof value === "object" && value !== null && "format" in value && typeof value.format === "function") {
    return value.format("YYYY-MM-DD");
  }
  return String(value);
}

function formatPurchaseRequirementSource(row: PurchaseRequirementRow) {
  const order = row.sourceOrder;
  if (!order) {
    return {
      title: row.sourceOrderId ? "关联订单待确认" : "手工创建",
      meta: row.sourceOrderId ? "订单信息同步中" : "人工采购需求",
      detail: row.sourceOrderId ? "请稍后刷新查看客户、车辆和产品来源。" : "由采购人员手动补充采购需求。"
    };
  }

  return {
    title: order.orderNo ?? "关联订单待确认",
    meta: [getInventoryOrderCustomerLabel(order), getInventoryOrderVehicleLabel(order)].filter((part) => part && part !== "-").join(" / ") || "客户和车辆信息待确认",
    detail: getInventoryOrderItemsSummary(order)
  };
}

function formatPurchaseRequirementItems(row: PurchaseRequirementRow, products: Map<string, ProductOption>) {
  const items = row.items ?? [];
  if (items.length === 0) {
    return [{ name: "产品需求待确认", quantity: "-" }];
  }

  return items.map((item) => ({
    name: getInventoryProductLabel(item.productId, products),
    quantity: [
      `x ${item.requiredQuantity ?? 0}`,
      item.requiredUnit ? getProductUnitLabel(item.requiredUnit) : undefined
    ].filter(Boolean).join(" ")
  }));
}

function canCreatePurchaseOrderFromRequirement(row: PurchaseRequirementRow) {
  return row.status === "OPEN" || row.status === "PARTIAL_ORDERED";
}

function getPurchaseRequirementOrderStatusLabel(status?: string | null) {
  if (!status) return "状态待确认";
  const labels: Record<string, string> = {
    DRAFT: "草稿",
    ORDERED: "已下单",
    PARTIAL_RECEIVED: "部分入库",
    RECEIVED: "已入库",
    CANCELLED: "已取消"
  };
  return labels[status] ?? "状态待确认";
}
