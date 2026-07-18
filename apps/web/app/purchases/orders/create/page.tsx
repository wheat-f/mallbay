"use client";

import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Table, Tag, message } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, MinusCircleOutlined, PlusOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { purchaseApi } from "../../../../src/lib/api";
import { storeApi } from "../../../../src/features/stores/api";
import { getPurchaseRequirementSourceOrderLabel, getPurchaseRequirementStatusLabel } from "../../../../src/features/inventory/display";
import { PurchaseModuleNav } from "../../../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../../src/stores/auth-store";

type SupplierOption = {
  id?: string;
  name?: string | null;
  isActive?: boolean;
};

type RequirementItemRow = {
  id?: string | null;
  productId?: string | null;
  requiredQuantity?: number | string | null;
  requiredUnit?: string | null;
  product?: {
    brand?: string | null;
    name?: string | null;
    model?: string | null;
    specification?: string | null;
  } | null;
};

type PurchaseRequirementRow = {
  id: string;
  status?: string | null;
  sourceOrderId?: string | null;
  sourceOrder?: Parameters<typeof getPurchaseRequirementSourceOrderLabel>[0]["sourceOrder"];
  items?: RequirementItemRow[];
  purchaseOrders?: Array<{
    status?: string | null;
    items?: Array<{
      purchaseRequirementItemId?: string | null;
      productId?: string | null;
      quantity?: number | string | null;
    }>;
  }>;
  createdAt?: string | null;
};

type SupplierAllocationFormRow = {
  supplierName?: string;
  expectedAt?: string;
  items?: Record<string, number | undefined>;
  unitCostYuan?: Record<string, number | undefined>;
};

type CreateOrderValues = {
  purchaserId?: string;
  supplierAllocations?: SupplierAllocationFormRow[];
};

type RemainingRequirementItem = RequirementItemRow & {
  remainingQuantity: number;
};

export default function PurchaseOrderCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<CreateOrderValues>();
  const [selectedRequirementId, setSelectedRequirementId] = useState<string>();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManagePurchase = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const canAssignPurchaser = user?.storeMember?.position === "MANAGER";

  const requirementsQuery = useQuery({
    queryKey: ["purchase-requirements", storeId],
    queryFn: () => purchaseApi.requirements(storeId!),
    enabled: Boolean(storeId)
  });
  const suppliersQuery = useQuery({
    queryKey: ["purchase-suppliers", storeId],
    queryFn: () => purchaseApi.suppliers(storeId!),
    enabled: Boolean(storeId) && canManagePurchase
  });
  const storeMembersQuery = useQuery({
    queryKey: ["purchase-order-members", storeId],
    queryFn: () => storeApi.myStore(storeId!),
    enabled: Boolean(storeId)
  });

  const rows = (requirementsQuery.data ?? []) as PurchaseRequirementRow[];
  const unorderedRequirements = rows.filter((row) => row.status === "OPEN" || row.status === "PARTIAL_ORDERED");
  const displayRequirements = rows.filter((row) => row.status !== "CANCELLED");
  const selectedRequirement = unorderedRequirements.find((row) => row.id === selectedRequirementId);
  const remainingItems = useMemo(() => getRemainingRequirementItems(selectedRequirement), [selectedRequirement]);
  const remainingQuantity = remainingItems.reduce((sum, item) => sum + item.remainingQuantity, 0);
  const supplierAllocations = Form.useWatch("supplierAllocations", form) ?? [];
  const allocationTotal = getAllocationTotal(supplierAllocations);
  const hasOverAllocatedItem = remainingItems.some((item) => {
    const itemId = item.id ?? "";
    const allocated = supplierAllocations.reduce((sum, allocation) => sum + Number(allocation?.items?.[itemId] ?? 0), 0);
    return allocated > item.remainingQuantity;
  });
  const supplierOptions = ((suppliersQuery.data ?? []) as SupplierOption[])
    .filter((supplier) => Boolean(supplier.name) && supplier.isActive !== false)
    .map((supplier) => ({
      value: supplier.name as string,
      label: supplier.name as string
    }));
  const purchaserOptions = useMemo(() => {
    const eligible = (storeMembersQuery.data?.members ?? [])
      .filter((member) => ["MANAGER", "PURCHASING"].includes(member.position))
      .map((member) => ({ value: member.user.id, label: member.user.nickname ?? member.user.username }));
    if (user?.id && !eligible.some((option) => option.value === user.id)) {
      eligible.unshift({ value: user.id, label: user.nickname ?? user.username ?? "当前登录人" });
    }
    return eligible;
  }, [storeMembersQuery.data?.members, user?.id, user?.nickname, user?.username]);
  const canSubmit = canManagePurchase &&
    Boolean(selectedRequirementId) &&
    remainingItems.length > 0 &&
    allocationTotal > 0 &&
    allocationTotal <= remainingQuantity &&
    !hasOverAllocatedItem;

  useEffect(() => {
    const requirementId = new URLSearchParams(window.location.search).get("requirementId");
    if (requirementId) setSelectedRequirementId(requirementId);
  }, []);

  useEffect(() => {
    form.setFieldsValue({ purchaserId: user?.id, supplierAllocations: [{}] });
  }, [form, selectedRequirementId, user?.id]);

  const createOrderFromRequirement = useMutation({
    mutationFn: (values: CreateOrderValues) => {
      if (!selectedRequirementId) throw new Error("请选择未生成订购的采购需求");
      const supplierAllocationsPayload = buildSupplierAllocationsPayload(values.supplierAllocations ?? [], remainingItems);
      if (supplierAllocationsPayload.length === 0) throw new Error("请填写供应商和采购数量");
      if (allocationTotal > remainingQuantity || hasOverAllocatedItem) throw new Error("采购数量不能超过需求剩余数量");
      return purchaseApi.createPurchaseOrderFromRequirement(selectedRequirementId, {
        purchaserId: values.purchaserId,
        supplierAllocations: supplierAllocationsPayload
      });
    },
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

  return (
    <div className="management-page purchases-orders-page">
      <StorePageHeader title="从采购需求创建采购订单" description="选择待下单或部分下单的采购需求，按供应商拆分采购数量后生成采购订单。">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/purchases/orders")}>返回采购订单</Button>
      </StorePageHeader>

      {!canManagePurchase ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          title="只读模式"
          description="客服可查看采购需求，不能创建采购订单。"
        />
      ) : null}

      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="orders" />
        <div className="purchase-module-content">
          <div className="purchase-order-create-grid">
            <Card className="management-table-card" title="请选择未生成订购的采购需求">
              <Table<PurchaseRequirementRow>
                rowKey="id"
                loading={requirementsQuery.isLoading}
                dataSource={displayRequirements}
                pagination={{ pageSize: 8 }}
                rowSelection={{
                  type: "radio",
                  selectedRowKeys: selectedRequirementId ? [selectedRequirementId] : [],
                  onChange: (keys) => setSelectedRequirementId(String(keys[0])),
                  getCheckboxProps: (row) => ({
                    disabled: !canSelectRequirement(row)
                  })
                }}
                onRow={(row) => ({
                  onClick: () => {
                    if (canSelectRequirement(row)) setSelectedRequirementId(row.id);
                  }
                })}
                columns={[
                  {
                    title: "需求来源",
                    render: (_, row) => (
                      <Space orientation="vertical" size={2}>
                        <span>{getPurchaseRequirementSourceOrderLabel(row)}</span>
                        <small>{row.createdAt ? row.createdAt.slice(0, 10) : "创建时间待确认"}</small>
                      </Space>
                    )
                  },
                  { title: "状态", render: (_, row) => <Tag color={canSelectRequirement(row) ? "blue" : "default"}>{getPurchaseRequirementStatusLabel(row.status)}</Tag> },
                  {
                    title: "需求明细",
                    render: (_, row) => (row.items ?? [])
                      .map((item) => `${getRequirementItemLabel(item)} × ${item.requiredQuantity ?? 0} ${item.requiredUnit ?? ""}`)
                      .join("；") || "暂无需求明细"
                  },
                  { title: "选择状态", render: (_, row) => canSelectRequirement(row) ? "可生成采购单" : "已完成，不可选择" }
                ]}
              />
            </Card>

            <Card className="purchase-order-create-panel" title="生成采购订单">
              <Space className="purchase-order-create-selected" orientation="vertical" size={6}>
                <span>已选择需求</span>
                <strong>{selectedRequirement ? (selectedRequirement.items ?? []).map((item) => `${getRequirementItemLabel(item)} × ${item.requiredQuantity ?? 0} ${item.requiredUnit ?? ""}`).join("；") : "尚未选择"}</strong>
                <small>{selectedRequirement ? getPurchaseRequirementSourceOrderLabel(selectedRequirement) : "请先在左侧列表选择需求"}</small>
              </Space>

              <div className="purchase-order-create-autofill">
                <span>采购数量</span>
                <strong>已分配 {allocationTotal} / 可采购 {remainingQuantity}</strong>
                <small>{allocationTotal > remainingQuantity || hasOverAllocatedItem ? "采购数量不能超过需求剩余数量" : "可拆分给多个供应商生成多张采购订单"}</small>
              </div>

              <Form
                form={form}
                layout="vertical"
                initialValues={{ purchaserId: user?.id, supplierAllocations: [{}] }}
                onFinish={(values) => createOrderFromRequirement.mutate(values)}
              >
                <Form.Item
                  name="purchaserId"
                  label="采购员"
                  rules={[{ required: true, message: "请选择采购员" }]}
                  extra={canAssignPurchaser ? "默认当前登录人；店长可调整为本店采购员。" : "默认当前登录人。"}
                >
                  <Select
                    loading={storeMembersQuery.isLoading}
                    disabled={!canAssignPurchaser}
                    options={purchaserOptions}
                    placeholder="选择采购员"
                  />
                </Form.Item>
                <Form.List name="supplierAllocations">
                  {(fields, { add, remove }) => (
                    <div className="purchase-order-supplier-allocations">
                      {fields.map((field, index) => (
                        <div key={field.key} className="purchase-order-supplier-allocation">
                          <div className="purchase-order-supplier-allocation-head">
                            <strong>供应商 {index + 1}</strong>
                            {fields.length > 1 ? (
                              <Button type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                            ) : null}
                          </div>
                          <Form.Item
                            name={[field.name, "supplierName"]}
                            label="供应商"
                            rules={[{ required: true, message: "请选择供应商" }]}
                          >
                            <Select
                              showSearch
                              optionFilterProp="label"
                              placeholder="选择供应商"
                              options={supplierOptions}
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, "expectedAt"]}
                            label="预计到货日"
                            rules={[{ required: true, message: "请选择预计到货日" }]}
                          >
                            <Input type="date" />
                          </Form.Item>
                          {remainingItems.map((item) => {
                            const itemId = item.id ?? "";
                            return (
                              <div key={itemId} className="purchase-allocation-item-price-fields">
                                <Form.Item
                                  name={[field.name, "items", itemId]}
                                  label={`${getRequirementItemLabel(item)}（剩余 ${item.remainingQuantity} ${item.requiredUnit ?? ""}）`}
                                >
                                  <InputNumber className="w-full" min={0} max={item.remainingQuantity} placeholder="采购数量" />
                                </Form.Item>
                                <Form.Item
                                  name={[field.name, "unitCostYuan", itemId]}
                                  label="采购含税单价（元）"
                                >
                                  <InputNumber className="w-full" min={0} precision={2} placeholder="可留空，入库时可补录" />
                                </Form.Item>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                      <Button block icon={<PlusOutlined />} onClick={() => add()}>
                        添加供应商
                      </Button>
                    </div>
                  )}
                </Form.List>

                <Button
                  block
                  type="primary"
                  htmlType="submit"
                  icon={selectedRequirementId ? <ShoppingCartOutlined /> : <CheckCircleOutlined />}
                  disabled={!canSubmit}
                  loading={createOrderFromRequirement.isPending}
                >
                  生成采购订单
                </Button>
              </Form>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function canSelectRequirement(row: PurchaseRequirementRow) {
  return row.status === "OPEN" || row.status === "PARTIAL_ORDERED";
}

function getRemainingRequirementItems(requirement?: PurchaseRequirementRow): RemainingRequirementItem[] {
  if (!requirement) return [];
  return (requirement.items ?? [])
    .map((item) => {
      const requiredQuantity = toNumber(item.requiredQuantity);
      const orderedQuantity = (requirement.purchaseOrders ?? [])
        .filter((order) => order.status !== "CANCELLED")
        .flatMap((order) => order.items ?? [])
        .filter((orderItem) => orderItem.purchaseRequirementItemId
          ? orderItem.purchaseRequirementItemId === item.id
          : orderItem.productId === item.productId)
        .reduce((sum, orderItem) => sum + toNumber(orderItem.quantity), 0);
      return {
        ...item,
        remainingQuantity: Math.max(0, requiredQuantity - orderedQuantity)
      };
    })
    .filter((item) => item.id && item.remainingQuantity > 0);
}

function getAllocationTotal(allocations: SupplierAllocationFormRow[]) {
  return allocations.reduce((total: number, allocation) => {
    const itemQuantities = Object.values(allocation?.items ?? {});
    return total + itemQuantities.reduce((sum: number, quantity) => sum + toNumber(quantity), 0);
  }, 0);
}

function buildSupplierAllocationsPayload(
  allocations: SupplierAllocationFormRow[],
  remainingItems: RemainingRequirementItem[]
) {
  return allocations
    .map((allocation) => ({
      supplierName: allocation.supplierName ?? "",
      expectedAt: allocation.expectedAt,
      items: remainingItems
        .map((item) => ({
          purchaseRequirementItemId: item.id ?? "",
          quantity: toNumber(allocation.items?.[item.id ?? ""]),
          unitCostCents: toOptionalMoneyCents(allocation.unitCostYuan?.[item.id ?? ""])
        }))
        .filter((item) => item.purchaseRequirementItemId && item.quantity > 0)
    }))
    .filter((allocation) => allocation.supplierName && allocation.items.length > 0);
}

function toNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
}

function toOptionalMoneyCents(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return undefined;
  return Math.round(Number(value) * 100);
}

function getRequirementItemLabel(item: RequirementItemRow) {
  const product = item.product;
  const label = [product?.brand, product?.name, product?.model, product?.specification]
    .filter(Boolean)
    .join(" / ");
  return label || "产品信息待确认";
}
