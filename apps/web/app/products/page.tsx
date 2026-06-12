"use client";

import type { CreateProductPayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Modal, Select, Space, Table, Tag, Typography } from "antd";
import { EditOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  const [form] = Form.useForm<ProductFormValues>();

  const productsQuery = useQuery({
    queryKey: ["products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, page: 1, pageSize: 100, status: "ACTIVE" }),
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

  const rows = (productsQuery.data?.items ?? []) as ProductRow[];

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title="产品管理" description="维护可下单产品、价格和质保年限">
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

        <Table<ProductRow>
          rowKey="id"
          loading={productsQuery.isLoading}
          dataSource={rows}
          columns={[
            { title: "品牌", dataIndex: "brand" },
            { title: "名称", dataIndex: "name" },
            { title: "型号", dataIndex: "model" },
            { title: "类别", render: (_, row) => getProductCategoryLabel(row.category) },
            { title: "单位", render: (_, row) => getProductUnitLabel(row.unit) },
            { title: "库存规格", render: (_, row) => getProductInventorySpecLabel(row) },
            { title: "基础价", render: (_, row) => `￥${(row.basePriceCents / 100).toFixed(2)}` },
            {
              title: "状态",
              render: (_, row) => (
                <Tag color={row.status === "ACTIVE" ? "success" : "default"}>
                  {row.status === "ACTIVE" ? "启用" : "停用"}
                </Tag>
              )
            },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditing(row);
                      form.setFieldsValue(toProductFormValues(row));
                      setOpen(true);
                    }}
                  />
                  <Button
                    size="small"
                    danger
                    icon={<StopOutlined />}
                    onClick={() => disableMutation.mutate(row.id)}
                  />
                </Space>
              )
            }
          ]}
        />

        <Modal
          open={open}
          title={editing ? "编辑产品" : "新建产品"}
          onCancel={() => setOpen(false)}
          onOk={() => form.submit()}
          confirmLoading={saveMutation.isPending}
          forceRender
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
        </Modal>
      </Layout.Content>
    </Layout>
  );
}
