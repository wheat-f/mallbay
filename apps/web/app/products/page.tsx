"use client";

import type { CreateProductPayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Modal, Select, Space, Table, Tag, Typography } from "antd";
import { EditOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { productApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type ProductRow = CreateProductPayload & {
  id: string;
  status: "ACTIVE" | "INACTIVE";
};

const CATEGORY_OPTIONS = [
  { label: "漆面保护膜", value: "PPF" },
  { label: "改色膜", value: "COLOR_FILM" },
  { label: "隔热膜", value: "HEAT_FILM" },
  { label: "改装", value: "MODIFICATION" },
  { label: "其他", value: "OTHER" }
];

export default function ProductsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<CreateProductPayload>();

  const productsQuery = useQuery({
    queryKey: ["products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, page: 1, pageSize: 100, status: "ACTIVE" }),
    enabled: Boolean(storeId)
  });

  const saveMutation = useMutation({
    mutationFn: (values: CreateProductPayload) =>
      editing ? productApi.update(editing.id, values) : productApi.create({ ...values, storeId: storeId! }),
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
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Typography.Title level={3} className="!mb-1">
              产品管理
            </Typography.Title>
            <Typography.Text type="secondary">维护可下单产品、价格和质保年限</Typography.Text>
          </div>
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
        </div>

        <Table<ProductRow>
          rowKey="id"
          loading={productsQuery.isLoading}
          dataSource={rows}
          columns={[
            { title: "品牌", dataIndex: "brand" },
            { title: "名称", dataIndex: "name" },
            { title: "型号", dataIndex: "model" },
            { title: "类别", dataIndex: "category" },
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
                      form.setFieldsValue(row);
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
          destroyOnHidden
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
              <Select options={CATEGORY_OPTIONS} />
            </Form.Item>
            <Form.Item name="specification" label="规格">
              <Input />
            </Form.Item>
            <Form.Item name="unit" label="单位" rules={[{ required: true, message: "请选择单位" }]}>
              <Select options={[
                { label: "卷", value: "ROLL" },
                { label: "米", value: "METER" },
                { label: "件", value: "PIECE" }
              ]} />
            </Form.Item>
            <Form.Item name="warrantyYears" label="质保年限">
              <InputNumber className="w-full" min={0} />
            </Form.Item>
            <Form.Item name="basePriceCents" label="基础价（分）" rules={[{ required: true, message: "请输入基础价" }]}>
              <InputNumber className="w-full" min={0} />
            </Form.Item>
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}
