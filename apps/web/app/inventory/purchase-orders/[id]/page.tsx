"use client";

import { Alert, App, Button, Card, Descriptions, Form, Input, InputNumber, Layout, Space, Table, Tag, Timeline, Typography } from "antd";
import { ArrowLeftOutlined, CheckCircleOutlined, InboxOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { inventoryApi } from "../../../../src/lib/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { StorePageHeader } from "../../../../src/features/workbench/store-page-header";
import {
  getPurchaseInboundItemDetails,
  getPurchaseOrderArrivalReminder,
  getPurchaseOrderStatusLabel,
  type PurchaseInboundItemLike
} from "../../../../src/features/inventory/display";
import { parseInboundScanLines } from "../../../../src/features/inventory/inbound-scan";

type PurchaseOrderItemRow = PurchaseInboundItemLike & {
  id: string;
  productId?: string | null;
};

type PurchaseOrderDetail = {
  id: string;
  orderNo: string;
  status: string;
  supplierName?: string | null;
  expectedAt?: string | null;
  createdAt?: string | null;
  items?: PurchaseOrderItemRow[];
};

export default function PurchaseOrderDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const purchaseOrderId = params.id;
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);

  const purchaseOrdersQuery = useQuery({
    queryKey: ["purchase-orders", storeId],
    queryFn: () => inventoryApi.purchaseOrders(storeId!),
    enabled: Boolean(storeId)
  });
  const purchaseOrder = ((purchaseOrdersQuery.data ?? []) as PurchaseOrderDetail[]).find((order) => order.id === purchaseOrderId);

  const receivePurchaseItem = useMutation({
    mutationFn: (values: { itemId: string; quantity: number; batchNo: string; supplierName?: string }) =>
      inventoryApi.receivePurchaseItem(values.itemId, {
        quantity: values.quantity,
        batchNo: values.batchNo,
        supplierName: values.supplierName
      }),
    onSuccess: async () => {
      message.success("采购明细已入库");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const receivePurchaseItemBatches = useMutation({
    mutationFn: (values: { itemId: string; batches: Array<{ quantity: number; batchNo: string; supplierName?: string }> }) =>
      inventoryApi.receivePurchaseItemBatches(values.itemId, values.batches),
    onSuccess: async (result) => {
      if (result.failed.length > 0) {
        message.warning(`批量入库完成，成功 ${result.received.length} 行，失败 ${result.failed.length} 行`);
      } else {
        message.success("批量入库已完成");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-batches", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["inventory-movements", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const approvePurchaseOrder = useMutation({
    mutationFn: (id: string) => inventoryApi.approvePurchaseOrder(id),
    onSuccess: async () => {
      message.success("采购订单已审批通过");
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const cancelPurchaseOrder = useMutation({
    mutationFn: (values: { id: string; reason: string }) => inventoryApi.cancelPurchaseOrder(values.id, { reason: values.reason }),
    onSuccess: async () => {
      message.success("采购订单已取消");
      await queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const handleCancelPurchaseOrder = () => {
    if (!purchaseOrder) return;
    const reason = window.prompt("请输入取消原因");
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      message.error("请输入取消原因");
      return;
    }
    cancelPurchaseOrder.mutate({ id: purchaseOrder.id, reason: trimmedReason });
  };

  const items = purchaseOrder?.items ?? [];
  const purchasedQuantity = items.reduce((sum, item) => sum + toNumber(item.quantity), 0);
  const receivedQuantity = items.reduce((sum, item) => sum + toNumber(item.receivedQuantity), 0);
  const arrivalReminder = purchaseOrder ? getPurchaseOrderArrivalReminder(purchaseOrder) : "-";

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title="采购订单详情" description="核对采购清单、到货风险和入库批次">
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/inventory")}>
            返回库存采购
          </Button>
        </StorePageHeader>

        {!purchaseOrder && !purchaseOrdersQuery.isLoading ? (
          <Alert type="warning" showIcon message="采购订单未找到" description="请从库存采购页重新进入采购订单详情。" />
        ) : null}

        {purchaseOrder ? (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["采购单号", purchaseOrder.orderNo, "采购订单唯一业务编号"],
                ["采购状态", getPurchaseOrderStatusLabel(purchaseOrder.status), arrivalReminder],
                ["采购数量", purchasedQuantity, `已入库 ${receivedQuantity}`],
                ["采购明细", items.length, "按产品和批次验收入库"]
              ].map(([label, value, description]) => (
                <Card key={label} size="small">
                  <Typography.Text type="secondary">{label}</Typography.Text>
                  <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
                  <Typography.Text type="secondary" className="text-xs">
                    {description}
                  </Typography.Text>
                </Card>
              ))}
            </div>

            <Card className="mb-4" title="基本信息">
              <Descriptions bordered column={{ xs: 1, md: 2, xl: 4 }}>
                <Descriptions.Item label="采购单号">{purchaseOrder.orderNo}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag>{getPurchaseOrderStatusLabel(purchaseOrder.status)}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="供应商">{purchaseOrder.supplierName ?? "-"}</Descriptions.Item>
                <Descriptions.Item label="预计到货">{formatDate(purchaseOrder.expectedAt)}</Descriptions.Item>
              </Descriptions>
              <Space className="mt-4" wrap>
                {purchaseOrder.status === "DRAFT" ? (
                  <Button
                    icon={<CheckCircleOutlined />}
                    type="primary"
                    loading={approvePurchaseOrder.isPending}
                    onClick={() => approvePurchaseOrder.mutate(purchaseOrder.id)}
                  >
                    审批通过
                  </Button>
                ) : null}
                {purchaseOrder.status === "DRAFT" || purchaseOrder.status === "ORDERED" ? (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    loading={cancelPurchaseOrder.isPending}
                    onClick={handleCancelPurchaseOrder}
                  >
                    取消采购单
                  </Button>
                ) : null}
              </Space>
            </Card>

            <Card className="mb-4" title="采购清单与到货验收">
              <Table<PurchaseOrderItemRow>
                rowKey="id"
                pagination={false}
                dataSource={items}
                columns={[
                  { title: "产品", render: (_, row) => getPurchaseInboundItemDetails(row).product },
                  { title: "类别", render: (_, row) => getPurchaseInboundItemDetails(row).category },
                  { title: "规格", render: (_, row) => getPurchaseInboundItemDetails(row).specification },
                  { title: "质保", render: (_, row) => getPurchaseInboundItemDetails(row).warranty },
                  { title: "数量", render: (_, row) => getPurchaseInboundItemDetails(row).quantity },
                  { title: "入库批次", render: (_, row) => getPurchaseInboundItemDetails(row).batches }
                ]}
                expandable={{
                  expandedRowRender: (item) => (
                    <Space direction="vertical" className="w-full" size="middle">
                      <Form
                        layout="inline"
                        initialValues={{ supplierName: purchaseOrder.supplierName ?? undefined }}
                        onFinish={(values: { batchNo: string; quantity: number; supplierName?: string }) =>
                          receivePurchaseItem.mutate({ itemId: item.id, ...values })
                        }
                      >
                        <Form.Item name="batchNo" rules={[{ required: true, message: "请输入批次号" }]}>
                          <Input placeholder="批次号" />
                        </Form.Item>
                        <Form.Item name="quantity" rules={[{ required: true, message: "请输入入库数量" }]}>
                          <InputNumber min={0.001} placeholder="入库数量" />
                        </Form.Item>
                        <Form.Item name="supplierName">
                          <Input placeholder="供应商" />
                        </Form.Item>
                        <Button htmlType="submit" icon={<InboxOutlined />} loading={receivePurchaseItem.isPending}>
                          到货入库
                        </Button>
                      </Form>
                      <Form
                        layout="vertical"
                        onFinish={(values: { scanText: string }) => {
                          const parsed = parseInboundScanLines(values.scanText);
                          if (parsed.errors.length > 0) {
                            message.error(`扫码内容有误：第 ${parsed.errors[0].line} 行 ${parsed.errors[0].message}`);
                            return;
                          }
                          if (parsed.batches.length === 0) {
                            message.error("请粘贴或扫描入库批次");
                            return;
                          }
                          receivePurchaseItemBatches.mutate({ itemId: item.id, batches: parsed.batches });
                        }}
                      >
                        <Form.Item name="scanText" label="批量扫码入库">
                          <Input.TextArea rows={3} placeholder="每行：批次号 数量 供应商（供应商可选），例如 B001 1 3M" />
                        </Form.Item>
                        <Button htmlType="submit" loading={receivePurchaseItemBatches.isPending}>
                          批量入库
                        </Button>
                      </Form>
                    </Space>
                  )
                }}
              />
            </Card>

            <Card title="流转日志">
              <Timeline
                items={[
                  { color: "green", children: `采购单创建 ${formatDateTime(purchaseOrder.createdAt)}` },
                  { color: purchaseOrder.status === "DRAFT" ? "gray" : "blue", children: `审批状态：${getPurchaseOrderStatusLabel(purchaseOrder.status)}` },
                  { color: arrivalReminder.includes("逾期") ? "red" : "blue", children: `到货提醒：${arrivalReminder}` },
                  { color: receivedQuantity >= purchasedQuantity && purchasedQuantity > 0 ? "green" : "gray", children: `入库进度：${receivedQuantity}/${purchasedQuantity}` }
                ]}
              />
            </Card>
          </>
        ) : null}
      </Layout.Content>
    </Layout>
  );
}

function toNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function formatDateTime(value?: string | null) {
  return value ? value.slice(0, 19).replace("T", " ") : "-";
}
