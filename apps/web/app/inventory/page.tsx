"use client";

import type { InventoryBatchSummary } from "@mallbay/shared";
import type { CreateInventoryBatchPayload, CreatePurchaseOrderPayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Table, Tabs, Typography } from "antd";
import { InboxOutlined, LockOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type MovementRow = {
  id: string;
  movementType: string;
  productId: string;
  batchId: string;
  quantity: number;
  createdAt: string;
};

export default function InventoryPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [batchForm] = Form.useForm<CreateInventoryBatchPayload>();
  const [purchaseForm] = Form.useForm<CreatePurchaseOrderPayload & { productId: string; quantity: number }>();
  const [orderForm] = Form.useForm<{ orderId: string }>();

  const batchesQuery = useQuery({
    queryKey: ["inventory-batches", storeId],
    queryFn: () => inventoryApi.batches({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const movementsQuery = useQuery({
    queryKey: ["inventory-movements", storeId],
    queryFn: () => inventoryApi.movements({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const purchaseOrdersQuery = useQuery({
    queryKey: ["purchase-orders", storeId],
    queryFn: () => inventoryApi.purchaseOrders(storeId!),
    enabled: Boolean(storeId)
  });

  const createBatch = useMutation({
    mutationFn: (values: CreateInventoryBatchPayload) => inventoryApi.createBatch({ ...values, storeId: storeId! }),
    onSuccess: async () => {
      message.success("批次已入库");
      batchForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createPurchase = useMutation({
    mutationFn: (values: CreatePurchaseOrderPayload & { productId: string; quantity: number }) =>
      inventoryApi.createPurchaseOrder({
        storeId: storeId!,
        supplierName: values.supplierName,
        expectedAt: values.expectedAt,
        items: [{ productId: values.productId, quantity: values.quantity }]
      }),
    onSuccess: async () => {
      message.success("采购需求已创建");
      purchaseForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const lockOrder = useMutation({
    mutationFn: (values: { orderId: string }) => inventoryApi.lockOrder(values.orderId),
    onSuccess: async () => {
      message.success("订单库存匹配完成");
      orderForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4">
          <Typography.Title level={3} className="!mb-1">库存采购</Typography.Title>
          <Typography.Text type="secondary">管理产品批次、采购需求、订单锁库和库存流水</Typography.Text>
        </div>

        <Tabs
          items={[
            {
              key: "batches",
              label: "库存批次",
              children: (
                <>
                  <Form form={batchForm} layout="inline" className="mb-4" onFinish={(values) => createBatch.mutate(values)}>
                    <Form.Item name="productId" rules={[{ required: true, message: "请输入产品 ID" }]}>
                      <Input placeholder="产品 ID" />
                    </Form.Item>
                    <Form.Item name="batchNo" rules={[{ required: true, message: "请输入批次号" }]}>
                      <Input placeholder="批次号" />
                    </Form.Item>
                    <Form.Item name="supplierName">
                      <Input placeholder="供应商" />
                    </Form.Item>
                    <Form.Item name="totalQuantity" rules={[{ required: true, message: "请输入数量" }]}>
                      <InputNumber min={1} placeholder="数量" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<InboxOutlined />} loading={createBatch.isPending}>
                      入库
                    </Button>
                  </Form>

                  <Table<InventoryBatchSummary>
                    rowKey="id"
                    loading={batchesQuery.isLoading}
                    dataSource={batchesQuery.data ?? []}
                    columns={[
                      { title: "批次号", dataIndex: "batchNo" },
                      { title: "产品", dataIndex: "productId" },
                      { title: "供应商", dataIndex: "supplierName" },
                      { title: "总量", dataIndex: "totalQuantity" },
                      { title: "可用", dataIndex: "availableQuantity" },
                      { title: "已锁", dataIndex: "lockedQuantity" }
                    ]}
                  />
                </>
              )
            },
            {
              key: "purchase",
              label: "采购需求",
              children: (
                <>
                  <Form form={purchaseForm} layout="inline" className="mb-4" onFinish={(values) => createPurchase.mutate(values)}>
                    <Form.Item name="supplierName">
                      <Input placeholder="供应商" />
                    </Form.Item>
                    <Form.Item name="productId" rules={[{ required: true, message: "请输入产品 ID" }]}>
                      <Input placeholder="产品 ID" />
                    </Form.Item>
                    <Form.Item name="quantity" rules={[{ required: true, message: "请输入采购数量" }]}>
                      <InputNumber min={1} placeholder="数量" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<ShoppingCartOutlined />} loading={createPurchase.isPending}>
                      创建
                    </Button>
                  </Form>

                  <Table
                    rowKey="id"
                    loading={purchaseOrdersQuery.isLoading}
                    dataSource={(purchaseOrdersQuery.data ?? []) as Array<{ id: string; orderNo: string; status: string; supplierName?: string }>}
                    columns={[
                      { title: "采购单号", dataIndex: "orderNo" },
                      { title: "供应商", dataIndex: "supplierName" },
                      { title: "状态", dataIndex: "status" }
                    ]}
                  />
                </>
              )
            },
            {
              key: "movements",
              label: "锁库与流水",
              children: (
                <>
                  <Form form={orderForm} layout="inline" className="mb-4" onFinish={(values) => lockOrder.mutate(values)}>
                    <Form.Item name="orderId" rules={[{ required: true, message: "请输入订单 ID" }]}>
                      <Input placeholder="订单 ID" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<LockOutlined />} loading={lockOrder.isPending}>
                      匹配库存
                    </Button>
                  </Form>

                  <Table<MovementRow>
                    rowKey="id"
                    loading={movementsQuery.isLoading}
                    dataSource={(movementsQuery.data ?? []) as MovementRow[]}
                    columns={[
                      { title: "类型", dataIndex: "movementType" },
                      { title: "产品", dataIndex: "productId" },
                      { title: "批次", dataIndex: "batchId" },
                      { title: "数量", dataIndex: "quantity" },
                      { title: "时间", render: (_, row) => row.createdAt?.slice(0, 19).replace("T", " ") }
                    ]}
                  />
                </>
              )
            }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
