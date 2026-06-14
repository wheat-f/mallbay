"use client";

import type { CreateProductPayload } from "../../src/lib/api";
import type { ProductCategory, ProductStatus, ProductUnit } from "@mallbay/shared";
import { App, Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Table, Tag, Tooltip } from "antd";
import { EditOutlined, PlusOutlined, SearchOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { productApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  getProductCategoryLabel,
  getProductInventorySpecLabel,
  getProductUnitLabel,
  PRODUCT_CATEGORY_OPTIONS,
  PRODUCT_UNIT_OPTIONS
} from "../../src/features/products/display";
import {
  toProductFormValues,
  toProductPayload,
  type ProductFormValues
} from "../../src/features/products/product-form";

type ProductRow = CreateProductPayload & {
  id: string;
  status: "ACTIVE" | "INACTIVE";
};

export default function ProductsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory>();
  const [statusFilter, setStatusFilter] = useState<ProductStatus>("ACTIVE");
  const [inventoryUnitFilter, setInventoryUnitFilter] = useState<ProductUnit>();
  const [form] = Form.useForm<ProductFormValues>();

  const productsQuery = useQuery({
    queryKey: ["products", storeId, search, categoryFilter, statusFilter],
    queryFn: () =>
      productApi.list({
        storeId: storeId!,
        page: 1,
        pageSize: 100,
        q: search,
        category: categoryFilter,
        status: statusFilter
      }),
    enabled: Boolean(storeId)
  });

  const saveMutation = useMutation({
    mutationFn: (values: ProductFormValues) => {
      const payload = toProductPayload(storeId!, values);
      return editing ? productApi.update(editing.id, payload) : productApi.create(payload);
    },
    onSuccess: async () => {
      message.success("产品已保存");
      setOpen(false);
      setEditing(null);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["products", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) => productApi.remove(id),
    onSuccess: async () => {
      message.success("产品已停用");
      await queryClient.invalidateQueries({ queryKey: ["products", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const rows = useMemo(
    () => (productsQuery.data?.items ?? []) as ProductRow[],
    [productsQuery.data]
  );
  const filteredRows = useMemo(
    () => rows.filter((row) => !inventoryUnitFilter || row.inventoryUnit === inventoryUnitFilter || row.unit === inventoryUnitFilter),
    [inventoryUnitFilter, rows]
  );
  const productSummary = useMemo(() => {
    const ppfCount = rows.filter((row) => row.category === "PPF").length;
    const heatFilmCount = rows.filter((row) => row.category === "HEAT_FILM").length;
    const rollCount = rows.filter((row) => row.unit === "ROLL" || row.inventoryUnit === "ROLL").length;
    const warrantyCount = rows.filter((row) => (row.warrantyYears ?? 0) > 0).length;
    return {
      activeCount: rows.filter((row) => row.status === "ACTIVE").length,
      ppfCount,
      heatFilmCount,
      rollCount,
      warrantyCount
    };
  }, [rows]);

  return (
    <>
      <div className="management-page">
        <StorePageHeader title="产品管理" description="维护可下单产品、价格、规格和质保年限">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!storeId}
            onClick={() => {
              setEditing(null);
              form.resetFields();
              setOpen(true);
            }}
          >
            新建产品
          </Button>
        </StorePageHeader>

        <div className="management-kpi-grid management-kpi-grid-five">
          {[
            ["启用产品", productSummary.activeCount, "当前可用于下单"],
            ["漆面保护膜", productSummary.ppfCount, "PPF 产品档案"],
            ["玻璃膜", productSummary.heatFilmCount, "玻璃膜产品档案"],
            ["卷材规格", productSummary.rollCount, "支持库存单位换算"],
            ["质保产品", productSummary.warrantyCount, "已配置质保年限"]
          ].map(([label, value, description]) => (
            <Card key={label} className="management-kpi-card">
              <div className="management-kpi-label">{label}</div>
              <div className="management-kpi-value">{value}</div>
              <div className="management-kpi-desc">{description}</div>
            </Card>
          ))}
        </div>

        <section className="products-filter-card management-filter-card">
          <div className="products-filter-grid management-filter-grid">
            <div className="orders-filter-item products-filter-search">
              <span className="orders-filter-label">快速搜索</span>
              <Input.Search
                prefix={<SearchOutlined />}
                allowClear
                placeholder="品牌、产品名称、型号或规格"
                onSearch={setSearch}
              />
            </div>
            <div className="orders-filter-item">
              <span className="orders-filter-label">产品类别</span>
              <Select
                allowClear
                placeholder="全部类别"
                value={categoryFilter}
                onChange={(value) => setCategoryFilter(value)}
                options={PRODUCT_CATEGORY_OPTIONS}
              />
            </div>
            <div className="orders-filter-item">
              <span className="orders-filter-label">启用状态</span>
              <Select
                value={statusFilter}
                onChange={(value) => setStatusFilter(value)}
                options={[
                  { label: "启用", value: "ACTIVE" },
                  { label: "停用", value: "INACTIVE" }
                ]}
              />
            </div>
            <div className="orders-filter-item">
              <span className="orders-filter-label">库存单位</span>
              <Select
                allowClear
                placeholder="全部单位"
                value={inventoryUnitFilter}
                onChange={(value) => setInventoryUnitFilter(value)}
                options={PRODUCT_UNIT_OPTIONS}
              />
            </div>
            <div className="orders-filter-item">
              <span className="orders-filter-label">筛选结果</span>
              <div className="customers-filter-result">{filteredRows.length} / {rows.length} 条</div>
            </div>
          </div>
        </section>

        <Card className="management-table-card products-table-card">
          <div className="products-mobile-cards">
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => (
                <article key={row.id} className="products-mobile-card">
                  <div className="products-mobile-card-head">
                    <div className="products-product-cell">
                      <div className="products-product-icon">{row.brand.slice(0, 1).toUpperCase()}</div>
                      <div className="min-w-0">
                        <div className="products-product-name">{row.brand} / {row.name}</div>
                        <div className="products-product-model">型号：{row.model}</div>
                      </div>
                    </div>
                    <Tag color={row.status === "ACTIVE" ? "success" : "default"}>
                      {row.status === "ACTIVE" ? "启用" : "停用"}
                    </Tag>
                  </div>
                  <dl>
                    <div>
                      <dt>类别</dt>
                      <dd><Tag color={getProductCategoryTagColor(row.category)}>{getProductCategoryLabel(row.category)}</Tag></dd>
                    </div>
                    <div>
                      <dt>规格</dt>
                      <dd>{getProductInventorySpecLabel(row)}</dd>
                    </div>
                    <div>
                      <dt>单位</dt>
                      <dd>
                        <Space size={4} wrap>
                          <Tag>{getProductUnitLabel(row.salesUnit ?? row.unit)}</Tag>
                          <Tag>{getProductUnitLabel(row.inventoryUnit ?? row.unit)}</Tag>
                        </Space>
                      </dd>
                    </div>
                    <div>
                      <dt>质保</dt>
                      <dd>{getProductWarrantyLabel(row.warrantyYears)}</dd>
                    </div>
                    <div>
                      <dt>基础价</dt>
                      <dd><strong>{formatProductPrice(row.basePriceCents)}</strong></dd>
                    </div>
                  </dl>
                  <div className="products-mobile-actions">
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditing(row);
                        form.setFieldsValue(toProductFormValues(row));
                        setOpen(true);
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      size="small"
                      danger
                      icon={<StopOutlined />}
                      onClick={() => disableMutation.mutate(row.id)}
                    >
                      停用
                    </Button>
                  </div>
                </article>
              ))
            ) : (
              <div className="products-mobile-empty">暂无产品数据</div>
            )}
          </div>
          <Table<ProductRow>
            className="products-desktop-table"
            rowKey="id"
            loading={productsQuery.isLoading}
            dataSource={filteredRows}
            scroll={{ x: 1080 }}
            columns={[
              {
                title: "产品信息",
                width: 260,
                render: (_, row) => (
                  <div className="products-product-cell">
                    <div className="products-product-icon">{row.brand.slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="products-product-name">{row.brand} / {row.name}</div>
                      <div className="products-product-model">型号：{row.model}</div>
                    </div>
                  </div>
                )
              },
              {
                title: "产品类别",
                width: 120,
                render: (_, row) => <Tag color={getProductCategoryTagColor(row.category)}>{getProductCategoryLabel(row.category)}</Tag>
              },
              {
                title: "规格与换算",
                width: 310,
                render: (_, row) => <span className="products-muted">{getProductInventorySpecLabel(row)}</span>
              },
              {
                title: "销售/库存单位",
                width: 130,
                render: (_, row) => (
                  <Space size={4} wrap>
                    <Tag>{getProductUnitLabel(row.salesUnit ?? row.unit)}</Tag>
                    <Tag>{getProductUnitLabel(row.inventoryUnit ?? row.unit)}</Tag>
                  </Space>
                )
              },
              {
                title: "质保年限",
                width: 100,
                render: (_, row) => getProductWarrantyLabel(row.warrantyYears)
              },
              {
                title: "基础价",
                width: 110,
                align: "right",
                render: (_, row) => <strong>{formatProductPrice(row.basePriceCents)}</strong>
              },
              {
                title: "状态",
                width: 90,
                render: (_, row) => (
                  <Tag color={row.status === "ACTIVE" ? "success" : "default"}>
                    {row.status === "ACTIVE" ? "启用" : "停用"}
                  </Tag>
                )
              },
              {
                title: "操作",
                width: 90,
                align: "center",
                render: (_, row) => (
                  <Space size={4}>
                    <Tooltip title="编辑产品">
                      <Button
                        aria-label="编辑产品"
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setEditing(row);
                          form.setFieldsValue(toProductFormValues(row));
                          setOpen(true);
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="停用产品">
                      <Button
                        aria-label="停用产品"
                        type="text"
                        danger
                        icon={<StopOutlined />}
                        onClick={() => disableMutation.mutate(row.id)}
                      />
                    </Tooltip>
                  </Space>
                )
              }
            ]}
          />
        </Card>
        </div>

        <Drawer
          className="products-form-drawer"
          open={open}
          title={editing ? "编辑产品" : "新建产品"}
          onClose={() => setOpen(false)}
          destroyOnHidden
          footer={
            <div className="products-form-drawer-footer">
              <Button onClick={() => setOpen(false)}>取消</Button>
              <Button type="primary" loading={saveMutation.isPending} onClick={() => form.submit()}>
                保存产品
              </Button>
            </div>
          }
        >
          <Form form={form} layout="vertical" onFinish={(values) => saveMutation.mutate(values)}>
            <Form.Item name="brand" label="品牌" rules={[{ required: true, message: "请输入品牌" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="model" label="型号" rules={[{ required: true, message: "请输入型号" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="category" label="类别" rules={[{ required: true, message: "请选择类别" }]}>
              <Select options={PRODUCT_CATEGORY_OPTIONS} />
            </Form.Item>
            <Form.Item name="specification" label="规格">
              <Input />
            </Form.Item>
            <Form.Item name="unit" label="单位" rules={[{ required: true, message: "请选择单位" }]}>
              <Select options={PRODUCT_UNIT_OPTIONS} />
            </Form.Item>
            <Form.Item name="inventoryUnit" label="库存单位">
              <Select options={PRODUCT_UNIT_OPTIONS} allowClear />
            </Form.Item>
            <Form.Item name="salesUnit" label="销售单位">
              <Select options={PRODUCT_UNIT_OPTIONS} allowClear />
            </Form.Item>
            <Form.Item name="rollWidthMeters" label="卷宽（米）">
              <InputNumber className="w-full" min={0} precision={3} />
            </Form.Item>
            <Form.Item name="rollLengthMeters" label="卷长（米）">
              <InputNumber className="w-full" min={0} precision={3} />
            </Form.Item>
            <Form.Item name="metersPerRoll" label="每卷米数">
              <InputNumber className="w-full" min={0} precision={3} />
            </Form.Item>
            <Form.Item name="quantityPrecision" label="数量精度">
              <InputNumber className="w-full" min={0} max={6} />
            </Form.Item>
            <Form.Item name="warrantyYears" label="质保年限">
              <InputNumber className="w-full" min={0} />
            </Form.Item>
            <Form.Item name="basePriceYuan" label="基础价（元）" rules={[{ required: true, message: "请输入基础价" }]}>
              <InputNumber className="w-full" min={0} precision={2} />
            </Form.Item>
          </Form>
        </Drawer>
    </>
  );
}

function formatProductPrice(value: number) {
  return `¥${(value / 100).toFixed(2)}`;
}

function getProductWarrantyLabel(value?: number | null) {
  if (!value) return <span className="products-muted">未配置</span>;
  return <Tag color="blue">{value} 年</Tag>;
}

function getProductCategoryTagColor(category: ProductCategory | string) {
  const colors: Record<string, string> = {
    PPF: "blue",
    COLOR_FILM: "purple",
    HEAT_FILM: "cyan",
    MODIFICATION: "orange",
    OTHER: "default"
  };
  return colors[category] ?? "default";
}
