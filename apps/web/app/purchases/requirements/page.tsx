"use client";

import type { ProductUnit } from "@mallbay/shared";
import { Alert, Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Table, Tag, message } from "antd";
import { ArrowLeftOutlined, DeleteOutlined, FileTextOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { purchaseApi } from "../../../src/lib/api";
import { productApi } from "../../../src/features/products/api";
import {
  getPurchaseRequirementItemsSummary,
  getPurchaseRequirementSourceOrderLabel,
  getPurchaseRequirementStatusLabel
} from "../../../src/features/inventory/display";
import { getProductDisplayName, PRODUCT_UNIT_OPTIONS } from "../../../src/features/products/display";
import { PurchaseModuleNav } from "../../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../../src/features/permissions/use-effective-permissions";

type ProductOption = {
  id: string;
  brand?: string;
  name?: string;
  model?: string;
  unit?: ProductUnit;
  inventoryUnit?: ProductUnit | null;
};

type PurchaseRequirementRow = {
  id: string;
  status?: string | null;
  sourceOrderId?: string | null;
  sourceOrder?: Parameters<typeof getPurchaseRequirementSourceOrderLabel>[0]["sourceOrder"];
  items?: Array<{
    productId?: string | null;
    requiredQuantity?: number | string | null;
    requiredUnit?: ProductUnit | string | null;
  }>;
  purchaseOrders?: Array<{
    id?: string | null;
    orderNo?: string | null;
    supplierName?: string | null;
    status?: string | null;
  }>;
  createdAt?: string | null;
};

export default function PurchaseRequirementsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createRequirementForm] = Form.useForm();
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [keyword, setKeyword] = useState("");
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const permissionsQuery = useEffectivePermissions(storeId);
  const canManagePurchase = hasEffectivePermission(permissionsQuery.data?.permissions, "purchase", "write", storeId);

  const requirementsQuery = useQuery({
    queryKey: ["purchase-requirements", storeId],
    queryFn: () => purchaseApi.requirements(storeId!),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "purchase", "read", storeId))
  });
  const productsQuery = useQuery({
    queryKey: ["purchase-requirement-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, page: 1, pageSize: 200 }),
    enabled: Boolean(storeId) && canManagePurchase
  });
  const rows = useMemo(() => (requirementsQuery.data ?? []) as PurchaseRequirementRow[], [requirementsQuery.data]);
  const productItems = useMemo(() => (productsQuery.data?.items ?? []) as ProductOption[], [productsQuery.data]);
  const productLookup = useMemo(() => {
    const lookup = new Map<string, ProductOption>();
    for (const product of productItems) lookup.set(product.id, product);
    return lookup;
  }, [productItems]);
  const filteredRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (kw) {
        const text = [
          getPurchaseRequirementSourceOrderLabel(row),
          getPurchaseRequirementItemsSummary(row, productLookup),
          ...(row.purchaseOrders ?? []).map((o) => o.orderNo)
        ].filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(kw)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, keyword, productLookup]);
  const productOptions = productItems.map((product) => ({
    value: product.id,
    label: getProductDisplayName(product)
  }));
  const createRequirement = useMutation({
    mutationFn: (values: { items: Array<{ productId: string; requiredQuantity: number; requiredUnit: ProductUnit }> }) => {
      if (!storeId) throw new Error("请先选择门店");
      return purchaseApi.createRequirement({
        storeId,
        items: values.items
      });
    },
    onSuccess: async () => {
      message.success("采购需求已创建");
      createRequirementForm.resetFields();
      setIsCreateDrawerOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-requirements", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchases-overview", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page purchases-requirements-page">
      <StorePageHeader title="采购需求" description="查看缺货需求、人工采购申请，并将待处理需求转为采购订单。">
        <Button type="primary" icon={<PlusOutlined />} disabled={!canManagePurchase} onClick={() => setIsCreateDrawerOpen(true)}>
          新建采购需求
        </Button>
      </StorePageHeader>

      {!canManagePurchase ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          title="只读模式"
          description="客服可查看采购相关信息，不能创建采购需求或转采购订单。"
        />
      ) : null}

      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="requirements" />
        <div className="purchase-module-content">
          {requirementsQuery.isError ? <Alert type="error" showIcon title="采购需求加载失败，请稍后刷新" className="mb-3" /> : null}
          <Card className="management-table-card purchase-requirement-list-card" title="采购需求列表">
            <div className="management-table-toolbar finance-list-toolbar">
              <div className="mb-segmented-tabs" role="tablist" aria-label="采购需求状态">
                {[
                  { key: "ALL", label: "全部" },
                  { key: "OPEN", label: "待采购" },
                  { key: "PARTIAL_ORDERED", label: "部分转单" },
                  { key: "ORDERED", label: "已转单" }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === tab.key}
                    className={`mb-segmented-tab${statusFilter === tab.key ? " is-active" : ""}`}
                    onClick={() => setStatusFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="finance-list-toolbar-actions">
                <Input.Search
                  allowClear
                  prefix={<SearchOutlined />}
                  placeholder="搜索关联单号或产品明细"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  style={{ width: 220 }}
                />
                <Button icon={<ReloadOutlined />} onClick={() => { setStatusFilter("ALL"); setKeyword(""); }}>
                  重置
                </Button>
              </div>
            </div>
            <Table<PurchaseRequirementRow>
              className="purchase-requirement-list"
              rowKey="id"
              loading={requirementsQuery.isLoading}
              dataSource={filteredRows}
              pagination={{ pageSize: 10 }}
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
                { title: "状态", render: (_, row) => <Tag>{getPurchaseRequirementStatusLabel(row.status)}</Tag> },
                { title: "需求明细", render: (_, row) => getPurchaseRequirementItemsSummary(row, productLookup) },
                {
                  title: "已关联采购单",
                  render: (_, row) => (
                    <Space orientation="vertical" size={2}>
                      {(row.purchaseOrders ?? []).length > 0 ? row.purchaseOrders?.map((order) => (
                        <Button key={order.id ?? order.orderNo} type="link" size="small" onClick={() => order.id && router.push(`/purchases/orders/${order.id}`)}>
                          {order.orderNo ?? "未编号采购单"}
                        </Button>
                      )) : <span>尚未生成采购单</span>}
                    </Space>
                  )
                },
                {
                  title: "操作",
                  width: 150,
                  render: (_, row) => (
                    <PurchaseRequirementOrderAction
                      row={row}
                      canManagePurchase={canManagePurchase}
                      onCreateOrder={(row) => router.push(`/purchases/orders/create?requirementId=${row.id}`)}
                    />
                  )
                }
              ]}
            />
          </Card>
        </div>
      </div>

      <Drawer
        title="新建采购需求"
        size={520}
        open={isCreateDrawerOpen}
        onClose={() => setIsCreateDrawerOpen(false)}
        destroyOnHidden
      >
        <Form
          form={createRequirementForm}
          layout="vertical"
          className="purchases-requirement-create-form"
          initialValues={{ items: [{ requiredUnit: "ROLL" }] }}
          onFinish={(values: { items: Array<{ productId: string; requiredQuantity: number; requiredUnit: ProductUnit }> }) => createRequirement.mutate(values)}
        >
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                {fields.map(({ key, name, ...field }) => (
                  <Card key={key} size="small" title={`需求明细 ${name + 1}`} extra={fields.length > 1 ? (
                    <Button type="text" danger icon={<DeleteOutlined />} aria-label={`删除需求明细 ${name + 1}`} onClick={() => remove(name)} />
                  ) : null}>
                    <Form.Item {...field} name={[name, "productId"]} label="选择采购产品" rules={[{ required: true, message: "请选择采购产品" }]}>
                      <Select showSearch optionFilterProp="label" loading={productsQuery.isLoading} placeholder="按品牌、名称或型号搜索" options={productOptions} />
                    </Form.Item>
                    <Space.Compact block>
                      <Form.Item {...field} name={[name, "requiredQuantity"]} label="需求数量" rules={[{ required: true, message: "请输入需求数量" }]} style={{ flex: 1 }}>
                        <InputNumber className="w-full" min={0.001} placeholder="输入采购数量" />
                      </Form.Item>
                      <Form.Item {...field} name={[name, "requiredUnit"]} label="需求单位" rules={[{ required: true, message: "请选择需求单位" }]} style={{ width: 150 }}>
                        <Select options={PRODUCT_UNIT_OPTIONS} />
                      </Form.Item>
                    </Space.Compact>
                  </Card>
                ))}
                <Button icon={<PlusOutlined />} onClick={() => add({ requiredUnit: "ROLL" })}>
                  添加产品
                </Button>
              </Space>
            )}
          </Form.List>
          <div className="purchases-requirement-create-actions">
            <Button onClick={() => setIsCreateDrawerOpen(false)}>取消</Button>
            <Button type="primary" htmlType="submit" loading={createRequirement.isPending}>
              提交采购需求
            </Button>
          </div>
        </Form>
      </Drawer>

    </div>
  );
}

function PurchaseRequirementOrderAction({
  row,
  canManagePurchase,
  onCreateOrder
}: {
  row: PurchaseRequirementRow;
  canManagePurchase: boolean;
  onCreateOrder: (row: PurchaseRequirementRow) => void;
}) {
  const canCreate = row.status === "OPEN" || row.status === "PARTIAL_ORDERED";

  return (
    <Button
      icon={<FileTextOutlined />}
      disabled={!canManagePurchase || !canCreate}
      onClick={() => onCreateOrder(row)}
    >
      生成采购单
    </Button>
  );
}
