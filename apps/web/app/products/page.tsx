"use client";

import type { CreateProductPayload } from "../../src/lib/api";
import type { ProductCategory, ProductStatus, ProductUnit } from "@mallbay/shared";
import { Alert, App, Button, Card, Drawer, Form, Input, InputNumber, Select, Space, Table, Tag, Tooltip } from "antd";
import { EditOutlined, PlusOutlined, SearchOutlined, StopOutlined, UploadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChangeEvent } from "react";
import { useMemo, useRef, useState } from "react";
import { productApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  getProductCategoryLabel,
  getProductDisplayName,
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
import {
  executeProductImport,
  parseProductWorkbook,
  type ProductImportExecutionResult,
  type ProductImportResult
} from "../../src/features/products/product-import";

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
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] = useState<ProductImportResult | null>(null);
  const [importExecution, setImportExecution] = useState<ProductImportExecutionResult | null>(null);

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
      if (!storeId) throw new Error("当前账号未加入门店");
      const payload = toProductPayload(storeId, values);
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

  const parseImportMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!storeId) throw new Error("当前账号未加入门店");
      return parseProductWorkbook(file, storeId);
    },
    onSuccess: (result, file) => {
      setImportFileName(file.name);
      setImportPreview(result);
      setImportExecution(null);
      setImportOpen(true);
      if (result.products.length === 0 && result.errors.length === 0) {
        message.warning("Excel 中没有可导入的产品数据");
      }
    },
    onError: (error: Error) => message.error(error.message)
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importPreview) throw new Error("请先选择并解析产品文件");
      return executeProductImport(importPreview.validRows, (product) => productApi.create(product));
    },
    onSuccess: async (result) => {
      setImportExecution(result);
      const failedRows = new Set(result.failures.map((failure) => failure.rowNumber));
      setImportPreview((current) => {
        if (!current) return current;
        const validRows = current.validRows.filter((row) => failedRows.has(row.rowNumber));
        return { ...current, validRows, products: validRows.map((row) => row.product) };
      });
      await queryClient.invalidateQueries({ queryKey: ["products", storeId] });

      if (result.failures.length > 0) {
        message.warning(`已导入 ${result.succeeded} 条，${result.failures.length} 条失败，可查看原因后重试`);
      } else if ((importPreview?.errors.length ?? 0) > 0) {
        message.warning(`已导入 ${result.succeeded} 条，校验失败的行未导入`);
      } else {
        message.success(`已导入 ${result.succeeded} 条产品档案`);
        closeImportDrawer();
      }
    },
    onError: (error: Error) => message.error(error.message)
  });

  const handleImportFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) parseImportMutation.mutate(file);
  };

  const closeImportDrawer = () => {
    setImportOpen(false);
    setImportFileName("");
    setImportPreview(null);
    setImportExecution(null);
  };

  const rows = useMemo(
    () => (productsQuery.data?.items ?? []) as ProductRow[],
    [productsQuery.data]
  );
  const filteredRows = useMemo(
    () => rows.filter((row) => !inventoryUnitFilter || row.inventoryUnit === inventoryUnitFilter || row.unit === inventoryUnitFilter),
    [inventoryUnitFilter, rows]
  );
  const productSummary = useMemo(() => {
    const categoryCount = new Set(rows.map((row) => row.category)).size;
    const inventoryWarningCount = rows.filter((row) => !row.inventoryUnit || !row.salesUnit).length;
    return {
      totalCount: rows.length,
      categoryCount,
      inventoryWarningCount,
      monthNewCount: 0
    };
  }, [rows]);

  return (
    <>
      <div className="management-page">
        <StorePageHeader title="产品档案管理" description="管理并维护车膜产品的核心参数、规格及换算规则。">
          <Button
            icon={<UploadOutlined />}
            disabled={!storeId || parseImportMutation.isPending || importMutation.isPending}
            loading={parseImportMutation.isPending}
            onClick={() => importInputRef.current?.click()}
          >
            批量导入
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="products-import-file-input"
            onChange={handleImportFileChange}
          />
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
            新增产品档案
          </Button>
        </StorePageHeader>

        <div className="management-kpi-grid">
          {[
            ["总档案数", productSummary.totalCount, "当前产品主数据"],
            ["分类数量", productSummary.categoryCount, "已覆盖产品分类"],
            ["库存预警", productSummary.inventoryWarningCount, "单位换算待完善"],
            ["本月新增", productSummary.monthNewCount, "新增产品档案"]
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
                        <div className="products-product-name">{getProductDisplayName(row)}</div>
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
                      <div className="products-product-name">{getProductDisplayName(row)}</div>
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

        <Drawer
          className="products-import-drawer"
          size="large"
          open={importOpen}
          title="批量导入产品"
          onClose={closeImportDrawer}
          closable={!importMutation.isPending}
          maskClosable={!importMutation.isPending}
          destroyOnHidden
          footer={
            <div className="products-form-drawer-footer">
              <Button disabled={importMutation.isPending} onClick={closeImportDrawer}>关闭</Button>
              <Button
                type="primary"
                loading={importMutation.isPending}
                disabled={!importPreview?.validRows.length}
                onClick={() => importMutation.mutate()}
              >
                {importExecution?.failures.length ? "重试失败项" : "确认导入"}
              </Button>
            </div>
          }
        >
          <Space orientation="vertical" size="large" className="w-full">
            <Alert
              showIcon
              type={importPreview?.errors.length || importExecution?.failures.length ? "warning" : "success"}
              title={importFileName || "产品导入文件"}
              description={
                importExecution
                  ? `本次成功 ${importExecution.succeeded} 条，失败 ${importExecution.failures.length} 条。`
                  : `校验通过 ${importPreview?.validRows.length ?? 0} 条，需修正 ${importPreview?.errors.length ?? 0} 条。确认后仅导入校验通过的数据。`
              }
            />

            <section>
              <h3 className="products-import-section-title">待导入产品</h3>
              <Table
                size="small"
                pagination={false}
                rowKey="rowNumber"
                dataSource={importPreview?.validRows ?? []}
                locale={{ emptyText: importExecution ? "没有待重试的产品" : "没有校验通过的产品" }}
                scroll={{ x: 620 }}
                columns={[
                  { title: "Excel 行", dataIndex: "rowNumber", width: 82 },
                  {
                    title: "产品",
                    width: 220,
                    render: (_, row) => getProductDisplayName(row.product)
                  },
                  {
                    title: "类别",
                    width: 110,
                    render: (_, row) => getProductCategoryLabel(row.product.category)
                  },
                  {
                    title: "单位",
                    width: 90,
                    render: (_, row) => getProductUnitLabel(row.product.unit)
                  },
                  {
                    title: "基础价",
                    align: "right",
                    width: 110,
                    render: (_, row) => formatProductPrice(row.product.basePriceCents)
                  }
                ]}
              />
            </section>

            {(importPreview?.errors.length || importExecution?.failures.length) ? (
              <section>
                <h3 className="products-import-section-title">需修正的数据</h3>
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(row) => `${row.rowNumber}-${row.message}`}
                  dataSource={[...(importPreview?.errors ?? []), ...(importExecution?.failures ?? [])]}
                  columns={[
                    { title: "Excel 行", dataIndex: "rowNumber", width: 90 },
                    { title: "原因", dataIndex: "message" }
                  ]}
                />
              </section>
            ) : null}
          </Space>
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
