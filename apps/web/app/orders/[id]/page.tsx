"use client";

import { App, Button, Descriptions, Form, Input, InputNumber, Layout, List, Modal, Select, Skeleton, Space, Tag, Typography } from "antd";
import { EditOutlined, MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { orderApi, productApi } from "../../../src/lib/api";
import type { OrderAuditEvent } from "../../../src/features/orders/api";
import { centsToYuan, getOrderProductLabel, yuanToCents } from "../../../src/features/orders/create-order-form";
import {
  getConstructionLocationLabel,
  getConstructionTypeLabel,
  getOrderStatusLabel,
  getPaymentTypeLabel,
  yuanCurrency
} from "../../../src/features/orders/order-display";
import { getAuditActorLabel } from "../../../src/features/audit/display";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

type OrderDetail = {
  id: string;
  storeId: string;
  orderNo: string;
  status: string;
  constructionType: string;
  constructionLocation: string;
  appointmentDate?: string | null;
  appointmentTimeSlot?: string | null;
  remark?: string | null;
  customer?: { name?: string | null; companyName?: string | null; contactPerson?: string | null };
  vehicle?: { carPlate?: string | null; carModel?: string | null; carColor?: string | null };
  items?: { id: string; productId: string; quantity: number; unitPriceCents: number; amountCents: number; product?: { name: string; brand: string; model: string } }[];
  amount?: {
    productAmountCents: number;
    laborCostCents: number;
    suggestedLaborCostCents?: number | null;
    laborCostAdjustmentReason?: string | null;
    totalAmountCents: number;
    paidAmountCents: number;
    outstandingCents: number;
  } | null;
  payments?: { id: string; paymentType: string; amountCents: number; paidAt: string; account?: { name: string } }[];
};

type ProductOption = {
  id: string;
  brand?: string | null;
  name?: string | null;
  model?: string | null;
};

type CommercialsFormValues = {
  items: { productId: string; quantity: number; unitPriceYuan: number }[];
  laborCostYuan: number;
  remark?: string;
  changeReason: string;
};

export default function OrderDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const [commercialsOpen, setCommercialsOpen] = useState(false);
  const [commercialsForm] = Form.useForm<CommercialsFormValues>();
  const orderQuery = useQuery({
    queryKey: ["order-detail", params.id],
    queryFn: () => orderApi.detail(params.id)
  });
  const auditEventsQuery = useQuery({
    queryKey: ["order-audit-events", params.id],
    queryFn: () => orderApi.auditEvents(params.id)
  });
  const order = orderQuery.data as OrderDetail | undefined;
  const productsQuery = useQuery({
    queryKey: ["products-for-order-commercials", order?.storeId],
    queryFn: () => productApi.list({ storeId: order!.storeId, page: 1, pageSize: 100, status: "ACTIVE" }),
    enabled: commercialsOpen && Boolean(order?.storeId)
  });
  const updateCommercialsMutation = useMutation({
    mutationFn: (values: CommercialsFormValues) =>
      orderApi.updateCommercials(params.id, {
        items: values.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: yuanToCents(item.unitPriceYuan)
        })),
        laborCostCents: yuanToCents(values.laborCostYuan),
        remark: values.remark,
        changeReason: values.changeReason
      }),
    onSuccess: async () => {
      message.success("订单变更已保存");
      setCommercialsOpen(false);
      commercialsForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["order-detail", params.id] });
      await queryClient.invalidateQueries({ queryKey: ["order-audit-events", params.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const productOptions = ((productsQuery.data?.items ?? []) as ProductOption[]).map((product) => ({
    label: getOrderProductLabel(product),
    value: product.id
  }));
  const canEditCommercials = order?.status === "PENDING_DISPATCH";

  const openCommercialsModal = () => {
    if (!order) return;
    commercialsForm.setFieldsValue({
      items: (order.items ?? []).map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPriceYuan: centsToYuan(item.unitPriceCents) ?? 0
      })),
      laborCostYuan: centsToYuan(order.amount?.laborCostCents) ?? 0,
      remark: order.remark ?? undefined,
      changeReason: ""
    });
    setCommercialsOpen(true);
  };

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title={order?.orderNo ?? "订单详情"}>
          {order && <Tag>{getOrderStatusLabel(order.status)}</Tag>}
          {canEditCommercials ? (
            <Button icon={<EditOutlined />} onClick={openCommercialsModal}>
              修改明细
            </Button>
          ) : null}
        </StorePageHeader>

        {orderQuery.isLoading ? (
          <Skeleton active />
        ) : (
          <>
            <Descriptions bordered column={2} className="mb-4">
              <Descriptions.Item label="客户">
                {order?.customer?.companyName ?? order?.customer?.name ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="车辆">
                {order?.vehicle?.carPlate ?? order?.vehicle?.carModel ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="施工类型">{getConstructionTypeLabel(order?.constructionType)}</Descriptions.Item>
              <Descriptions.Item label="施工地点">{getConstructionLocationLabel(order?.constructionLocation)}</Descriptions.Item>
              <Descriptions.Item label="预约日期">{order?.appointmentDate ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="预约时段">{order?.appointmentTimeSlot ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="产品费用">
                {yuanCurrency(order?.amount?.productAmountCents)}
              </Descriptions.Item>
              <Descriptions.Item label="施工人工费">
                {yuanCurrency(order?.amount?.laborCostCents)}
              </Descriptions.Item>
              <Descriptions.Item label="建议人工费">
                {order?.amount?.suggestedLaborCostCents === null || order?.amount?.suggestedLaborCostCents === undefined
                  ? "-"
                  : yuanCurrency(order.amount.suggestedLaborCostCents)}
              </Descriptions.Item>
              <Descriptions.Item label="最终人工费">
                {yuanCurrency(order?.amount?.laborCostCents)}
              </Descriptions.Item>
              <Descriptions.Item label="人工费调整原因">
                {order?.amount?.laborCostAdjustmentReason ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="订单总额">
                {yuanCurrency(order?.amount?.totalAmountCents)}
              </Descriptions.Item>
              <Descriptions.Item label="已收金额">
                {yuanCurrency(order?.amount?.paidAmountCents)}
              </Descriptions.Item>
              <Descriptions.Item label="未收金额">
                {yuanCurrency(order?.amount?.outstandingCents)}
              </Descriptions.Item>
            </Descriptions>

            <Typography.Title level={4}>产品明细</Typography.Title>
            <List
              bordered
              dataSource={order?.items ?? []}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={`${item.product?.brand ?? ""} ${item.product?.name ?? ""}`}
                    description={`${item.product?.model ?? ""} x ${item.quantity}`}
                  />
                  <div>{yuanCurrency(item.amountCents)}</div>
                </List.Item>
              )}
            />

            <Typography.Title level={4} className="!mt-6">收款记录</Typography.Title>
            <List
              bordered
              dataSource={order?.payments ?? []}
              locale={{ emptyText: "暂无收款" }}
              renderItem={(payment) => (
                <List.Item>
                  <List.Item.Meta
                    title={`${getPaymentTypeLabel(payment.paymentType)} / ${payment.account?.name ?? "-"}`}
                    description={payment.paidAt}
                  />
                  <div>{yuanCurrency(payment.amountCents)}</div>
                </List.Item>
              )}
            />

            <Typography.Title level={4} className="!mt-6">变更审计</Typography.Title>
            <List<OrderAuditEvent>
              bordered
              loading={auditEventsQuery.isLoading}
              dataSource={auditEventsQuery.data ?? []}
              locale={{ emptyText: "暂无变更记录" }}
              renderItem={(event) => (
                <List.Item>
                  <List.Item.Meta
                    title={getOrderAuditActionLabel(event.action)}
                    description={[
                      formatAuditCreatedAt(event.createdAt),
                      getAuditReason(event.metadata),
                      `操作人：${getAuditActorLabel(event)}`
                    ].filter(Boolean).join(" / ")}
                  />
                </List.Item>
              )}
            />
          </>
        )}

        <Modal
          title="修改订单明细"
          open={commercialsOpen}
          onCancel={() => setCommercialsOpen(false)}
          onOk={() => commercialsForm.submit()}
          confirmLoading={updateCommercialsMutation.isPending}
          destroyOnHidden
        >
          <Form
            form={commercialsForm}
            layout="vertical"
            onFinish={(values) => updateCommercialsMutation.mutate(values)}
          >
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => {
                    const { key, ...fieldProps } = field;
                    return (
                      <Space key={key} align="baseline" className="mb-2 flex">
                        <Form.Item
                          {...fieldProps}
                          name={[field.name, "productId"]}
                          label="产品"
                          rules={[{ required: true, message: "请选择产品" }]}
                        >
                          <Select
                            className="min-w-[260px]"
                            loading={productsQuery.isLoading}
                            options={productOptions}
                            placeholder="选择产品"
                          />
                        </Form.Item>
                        <Form.Item
                          {...fieldProps}
                          name={[field.name, "quantity"]}
                          label="数量"
                          rules={[{ required: true, message: "请输入数量" }]}
                        >
                          <InputNumber min={1} />
                        </Form.Item>
                        <Form.Item
                          {...fieldProps}
                          name={[field.name, "unitPriceYuan"]}
                          label="单价（元）"
                          rules={[{ required: true, message: "请输入单价" }]}
                        >
                          <InputNumber min={0} precision={2} />
                        </Form.Item>
                        <Button icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                      </Space>
                    );
                  })}
                  <Button icon={<PlusOutlined />} onClick={() => add({ quantity: 1, unitPriceYuan: 0 })}>
                    添加产品
                  </Button>
                </>
              )}
            </Form.List>
            <Form.Item
              name="laborCostYuan"
              label="施工人工费（元）"
              rules={[{ required: true, message: "请输入施工人工费" }]}
            >
              <InputNumber min={0} precision={2} />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item
              name="changeReason"
              label="变更原因"
              rules={[{ required: true, message: "请填写变更原因" }]}
            >
              <Input.TextArea rows={3} placeholder="说明本次修改产品、数量或金额的原因" />
            </Form.Item>
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}

function getOrderAuditActionLabel(action: string) {
  const labels: Record<string, string> = {
    ORDER_COMMERCIALS_UPDATED: "订单明细和金额变更"
  };
  return labels[action] ?? action;
}

function getAuditReason(metadata?: Record<string, unknown>) {
  return typeof metadata?.reason === "string" ? `原因：${metadata.reason}` : undefined;
}

function formatAuditCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
