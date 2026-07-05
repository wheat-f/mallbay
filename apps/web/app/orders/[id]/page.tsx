"use client";

import { App, Button, Card, Checkbox, Drawer, Form, Input, InputNumber, Select, Skeleton, Tag, Typography } from "antd";
import {
  ArrowLeftOutlined,
  CarOutlined,
  CheckCircleOutlined,
  CreditCardOutlined,
  CustomerServiceOutlined,
  EditOutlined,
  FileTextOutlined,
  InboxOutlined,
  LinkOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  UserOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { orderApi, productApi } from "../../../src/lib/api";
import type { OrderAuditEvent } from "../../../src/features/orders/api";
import { centsToYuan, getOrderProductLabel, yuanToCents } from "../../../src/features/orders/create-order-form";
import { getFulfillmentInventoryStatus, getFulfillmentInventorySummary } from "../../../src/features/orders/fulfillment";
import {
  getConstructionLocationLabel,
  getConstructionTypeLabel,
  getOrderStatusLabel,
  getPaymentTypeLabel,
  yuanCurrency
} from "../../../src/features/orders/order-display";
import { getAuditActorLabel } from "../../../src/features/audit/display";

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
  items?: {
    id: string;
    productId: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
    product?: { name: string; brand: string; model: string };
    inventoryAllocations?: Array<{
      lockedQuantity?: number | string | null;
      outboundQuantity?: number | string | null;
      status?: string | null;
    }>;
  }[];
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

type FulfillmentChecklist = {
  customerConfirmed: boolean;
  scheduleNotified: boolean;
  commercialConfirmed: boolean;
};

type FulfillmentDraft = {
  checklist: FulfillmentChecklist;
  note: string;
};

const emptyFulfillmentChecklist: FulfillmentChecklist = {
  customerConfirmed: false,
  scheduleNotified: false,
  commercialConfirmed: false
};

export default function OrderDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [commercialsOpen, setCommercialsOpen] = useState(false);
  const [returnDrawerOpen, setReturnDrawerOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [fulfillmentDrawerOpen, setFulfillmentDrawerOpen] = useState(false);
  const [fulfillmentChecklist, setFulfillmentChecklist] = useState<FulfillmentChecklist>(emptyFulfillmentChecklist);
  const [fulfillmentNote, setFulfillmentNote] = useState("");
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
  const returnToPendingMutation = useMutation({
    mutationFn: () =>
      orderApi.returnToPendingDispatch(params.id, {
        reason: returnReason.trim()
      }),
    onSuccess: async () => {
      message.success("订单已反审核退回修改");
      setReturnDrawerOpen(false);
      setReturnReason("");
      await queryClient.invalidateQueries({ queryKey: ["order-detail", params.id] });
      await queryClient.invalidateQueries({ queryKey: ["order-audit-events", params.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const productOptions = ((productsQuery.data?.items ?? []) as ProductOption[]).map((product) => ({
    label: getOrderProductLabel(product),
    value: product.id
  }));
  const hasEditableOutstandingAmount = (order?.amount?.outstandingCents ?? 0) > 0;
  const canEditCommercials = Boolean(order && order.status === "PENDING_DISPATCH" && hasEditableOutstandingAmount);
  const canReturnToPendingForEdit = Boolean(
    order && order.status !== "PENDING_DISPATCH" && order.status !== "CANCELLED" && hasEditableOutstandingAmount
  );
  const shouldShowFulfillmentConfirmation = order?.status === "PENDING_DISPATCH";
  const orderSteps = getOrderSteps(order?.status);
  const fulfillmentInventorySummary = getFulfillmentInventorySummary(order?.items ?? []);
  const fulfillmentCanEnterConstruction = fulfillmentInventorySummary.canEnterConstruction;
  const fulfillmentPrimaryActionLabel = fulfillmentCanEnterConstruction ? "确认提交，进入施工派工" : "确认提交，进入库房匹配";
  const fulfillmentPrimaryActionHint = fulfillmentCanEnterConstruction
    ? "货品已完成库房匹配，可直接进入施工派工。"
    : "货品仍需库房匹配，提交后进入库存匹配。";
  const fulfillmentChecklistItems = getFulfillmentChecklistItems(fulfillmentChecklist);

  useEffect(() => {
    const draft = loadFulfillmentDraft(params.id);
    setFulfillmentChecklist(draft?.checklist ?? emptyFulfillmentChecklist);
    setFulfillmentNote(draft?.note ?? "");
  }, [params.id]);

  const openCommercialsDrawer = () => {
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

  const openFulfillmentDrawer = () => {
    const draft = loadFulfillmentDraft(params.id);
    setFulfillmentChecklist(draft?.checklist ?? emptyFulfillmentChecklist);
    setFulfillmentNote(draft?.note ?? "");
    setFulfillmentDrawerOpen(true);
  };

  const saveCurrentFulfillmentDraft = () => {
    saveFulfillmentDraft(params.id, {
      checklist: fulfillmentChecklist,
      note: fulfillmentNote
    });
    message.info("已暂存本次核对草稿");
    setFulfillmentDrawerOpen(false);
  };

  const continueFulfillmentFlow = () => {
    clearFulfillmentDraft(params.id);
    router.push(fulfillmentCanEnterConstruction ? "/construction/assignments" : `/inventory/matching?orderId=${params.id}`);
  };

  const openOrderPaymentEntry = () => {
    if (!order) {
      router.push("/finance?section=ledger&action=record-payment");
      return;
    }
    router.push(`/finance?section=ledger&action=record-payment&orderId=${order.id}`);
  };

  const openOrderInvoiceEntry = () => {
    if (!order) {
      router.push("/invoices?action=create-invoice");
      return;
    }
    router.push(`/invoices?action=create-invoice&orderId=${order.id}`);
  };

  return (
    <>
      <div className="management-page">
        {orderQuery.isLoading ? (
          <Skeleton active />
        ) : (
          <>
            <section className="order-detail-hero">
              <div className="order-detail-title-row">
                <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/orders")}>
                  返回订单列表
                </Button>
                <div>
                  <span className="order-detail-eyebrow">销售订单详情</span>
                  <h1>
                    订单 {order?.orderNo ?? "-"}
                    {order ? <Tag>{getOrderStatusLabel(order.status)}</Tag> : null}
                  </h1>
                  <p>
                    {[
                      getCustomerName(order),
                      getVehicleLabel(order),
                      order?.appointmentDate ? `预约 ${formatDateOnly(order.appointmentDate)}` : undefined
                    ].filter(Boolean).join(" / ") || "客户、车辆和预约信息待完善"}
                  </p>
                </div>
              </div>
              <div className="order-detail-actions">
                {canEditCommercials ? (
                  <Button icon={<EditOutlined />} onClick={openCommercialsDrawer}>
                    修改订单
                  </Button>
                ) : null}
                {canReturnToPendingForEdit ? (
                  <Button icon={<EditOutlined />} onClick={() => setReturnDrawerOpen(true)}>
                    反审核退回修改
                  </Button>
                ) : null}
                {shouldShowFulfillmentConfirmation ? (
                  <Button type="primary" icon={<CheckCircleOutlined />} onClick={openFulfillmentDrawer}>
                    确认派工流转
                  </Button>
                ) : null}
                <Button icon={<CreditCardOutlined />} onClick={openOrderPaymentEntry}>
                  记录收款
                </Button>
                <Button icon={<FileTextOutlined />} onClick={openOrderInvoiceEntry}>
                  申请发票
                </Button>
              </div>
            </section>

            <section className="order-detail-stepper">
              {orderSteps.map((step, index) => (
                <div key={step.label} className={`order-step-item ${step.state}`}>
                  {index < orderSteps.length - 1 ? <div className="order-step-line" /> : null}
                  <div className="order-step-dot">
                    {step.state === "done" ? <CheckCircleOutlined /> : index + 1}
                  </div>
                  <strong>{step.label}</strong>
                  <span>{step.description}</span>
                </div>
              ))}
            </section>

            <section className="management-kpi-grid">
              {[
                ["产品费用", yuanCurrency(order?.amount?.productAmountCents), `${order?.items?.length ?? 0} 项产品`],
                ["施工人工费", yuanCurrency(order?.amount?.laborCostCents), "按订单最终金额计"],
                ["已收金额", yuanCurrency(order?.amount?.paidAmountCents), "定金与收款累计"],
                ["待收金额", yuanCurrency(order?.amount?.outstandingCents), "交付前需核对"]
              ].map(([label, value, description]) => (
                <Card key={label} className="management-kpi-card">
                  <div className="management-kpi-label">{label}</div>
                  <div className="management-kpi-value">{value}</div>
                  <div className="management-kpi-desc">{description}</div>
                </Card>
              ))}
            </section>

            <section className="order-detail-bento">
              <div className="order-bento-column">
                <Card className="order-detail-card order-customer-card" title={<><UserOutlined />客户信息</>}>
                  <div className="order-info-grid">
                    <span>客户</span><strong>{getCustomerName(order)}</strong>
                    <span>车辆</span><strong>{getVehicleLabel(order)}</strong>
                    <span>施工类型</span><strong>{getConstructionTypeLabel(order?.constructionType)}</strong>
                    <span>施工地点</span><strong>{getConstructionLocationLabel(order?.constructionLocation)}</strong>
                    <span>预约日期</span><strong>{formatDateOnly(order?.appointmentDate)}</strong>
                    <span>预约时段</span><strong>{order?.appointmentTimeSlot ?? "-"}</strong>
                  </div>
                  <div className="order-vehicle-strip">
                    <span><CarOutlined /></span>
                    <div>
                      <strong>{order?.vehicle?.carPlate ?? "车辆待完善"}</strong>
                      <p>{[order?.vehicle?.carModel, order?.vehicle?.carColor].filter(Boolean).join(" / ") || "车型颜色待完善"}</p>
                    </div>
                  </div>
                </Card>

                <Card className="order-detail-card order-product-card" title={<><InboxOutlined />商品清单</>}>
                  <div className="order-product-list">
                    {(order?.items ?? []).map((item) => (
                      <div key={item.id} className="order-product-row">
                        <div>
                          <strong>{`${item.product?.brand ?? ""} ${item.product?.name ?? ""}`.trim() || "未命名产品"}</strong>
                          <p>{`${item.product?.model ?? ""} x ${item.quantity}`}</p>
                        </div>
                        <b>{yuanCurrency(item.amountCents)}</b>
                      </div>
                    ))}
                    {(order?.items ?? []).length === 0 ? <Typography.Text type="secondary">暂无产品明细</Typography.Text> : null}
                  </div>
                  <div className="order-total-panel">
                    <div><span>商品小计</span><strong>{yuanCurrency(order?.amount?.productAmountCents)}</strong></div>
                    <div><span>工时费</span><strong>{yuanCurrency(order?.amount?.laborCostCents)}</strong></div>
                    <div><span>订单总计</span><strong>{yuanCurrency(order?.amount?.totalAmountCents)}</strong></div>
                  </div>
                  {canEditCommercials ? (
                    <Typography.Text type="secondary">收款未完全确认前可修改产品清单</Typography.Text>
                  ) : null}
                </Card>
              </div>

              <div className="order-bento-column">
                <Card className="order-detail-card order-construction-card" title={<><ToolOutlined />施工详情</>}>
                  <div className="order-info-grid">
                    <span>施工类型</span><strong>{getConstructionTypeLabel(order?.constructionType)}</strong>
                    <span>施工地点</span><strong>{getConstructionLocationLabel(order?.constructionLocation)}</strong>
                    <span>建议人工费</span>
                    <strong>
                      {order?.amount?.suggestedLaborCostCents === null || order?.amount?.suggestedLaborCostCents === undefined
                        ? "-"
                        : yuanCurrency(order.amount.suggestedLaborCostCents)}
                    </strong>
                    <span>最终人工费</span><strong>{yuanCurrency(order?.amount?.laborCostCents)}</strong>
                    <span>人工费调整原因</span><strong>{order?.amount?.laborCostAdjustmentReason ?? "-"}</strong>
                    <span>备注</span><strong>{order?.remark ?? "-"}</strong>
                  </div>
                  {shouldShowFulfillmentConfirmation ? (
                    <div className="order-fulfillment-panel">
                      <Tag color="processing">待派工</Tag>
                      <h3>确认提交派工与库房匹配</h3>
                      <p>订单创建后需要核对客户、车辆、产品和施工要求，再进入库房匹配与施工派工。</p>
                      {fulfillmentChecklistItems.map((item) => (
                        <div key={item.key} className={`order-check-row ${item.checked ? "is-checked" : "is-pending"}`}>
                          {item.checked ? <CheckCircleOutlined /> : <MinusCircleOutlined />}
                          <span>{item.summary}</span>
                        </div>
                      ))}
                      <div className="order-check-row is-checked">
                        <CheckCircleOutlined />
                        <span>货品状态：{fulfillmentInventorySummary.label}</span>
                      </div>
                      <div className="order-next-actions">
                        <Button block type="primary" icon={<CheckCircleOutlined />} onClick={openFulfillmentDrawer}>
                          打开确认流转
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Card>
              </div>

              <div className="order-bento-column">
                <Card className="order-detail-card order-payment-card" title={<><CreditCardOutlined />收款记录</>}>
                  <div className="order-payment-summary">
                    <div>
                      <span>待收尾款</span>
                      <strong>{yuanCurrency(order?.amount?.outstandingCents)}</strong>
                    </div>
                    <div>
                      <span>已收金额</span>
                      <strong>{yuanCurrency(order?.amount?.paidAmountCents)}</strong>
                    </div>
                  </div>
                  <div className="order-product-list">
                    {(order?.payments ?? []).map((payment) => (
                      <div key={payment.id} className="order-payment-row">
                        <span><CreditCardOutlined /></span>
                        <div>
                          <strong>{`${getPaymentTypeLabel(payment.paymentType)} / ${payment.account?.name ?? "-"}`}</strong>
                          <p>{payment.paidAt}</p>
                        </div>
                        <b>{yuanCurrency(payment.amountCents)}</b>
                      </div>
                    ))}
                    {(order?.payments ?? []).length === 0 ? <Typography.Text type="secondary">暂无收款</Typography.Text> : null}
                  </div>
                </Card>

                <Card className="order-detail-card order-related-card" title={<><LinkOutlined />相关单据</>}>
                  <div className="order-related-list">
                    <Button className="order-related-link" type="text" onClick={openOrderInvoiceEntry}>
                      <span><FileTextOutlined /></span>
                      <strong>发票记录</strong>
                      <Tag>未开票</Tag>
                    </Button>
                    <Button className="order-related-link" type="text" onClick={() => router.push("/warranties")}>
                      <span><SafetyCertificateOutlined /></span>
                      <strong>电子质保单</strong>
                      <RightOutlined />
                    </Button>
                    <Button className="order-related-link" type="text" onClick={() => router.push("/after-sales")}>
                      <span><CustomerServiceOutlined /></span>
                      <strong>售后记录</strong>
                      <RightOutlined />
                    </Button>
                  </div>
                </Card>

                <Card className="order-detail-card order-audit-card" title={<><FileTextOutlined />变更审计</>}>
                  <div className="order-audit-timeline">
                    {auditEventsQuery.isLoading ? <Typography.Text type="secondary">加载中...</Typography.Text> : null}
                    {(auditEventsQuery.data ?? []).map((event: OrderAuditEvent) => (
                      <div key={event.id}>
                        <i />
                        <strong>{getOrderAuditActionLabel(event.action)}</strong>
                        <span>
                          {[
                            formatAuditCreatedAt(event.createdAt),
                            getAuditReason(event.metadata),
                            `操作人：${getAuditActorLabel(event)}`
                          ].filter(Boolean).join(" / ")}
                        </span>
                      </div>
                    ))}
                    {!auditEventsQuery.isLoading && (auditEventsQuery.data ?? []).length === 0 ? (
                      <Typography.Text type="secondary">暂无变更记录</Typography.Text>
                    ) : null}
                  </div>
                </Card>
              </div>
            </section>
          </>
        )}
      </div>

        <Drawer
          title="修改订单明细"
          open={commercialsOpen}
          onClose={() => setCommercialsOpen(false)}
          rootClassName="order-commercials-drawer"
          destroyOnHidden
          footer={(
            <div className="order-commercials-drawer-footer">
              <Button onClick={() => setCommercialsOpen(false)}>取消</Button>
              <Button
                type="primary"
                loading={updateCommercialsMutation.isPending}
                onClick={() => commercialsForm.submit()}
              >
                保存变更
              </Button>
            </div>
          )}
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
                      <div key={key} className="order-commercials-item-grid">
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
                          <InputNumber min={1} className="w-full" />
                        </Form.Item>
                        <Form.Item
                          {...fieldProps}
                          name={[field.name, "unitPriceYuan"]}
                          label="单价（元）"
                          rules={[{ required: true, message: "请输入单价" }]}
                        >
                          <InputNumber min={0} precision={2} className="w-full" />
                        </Form.Item>
                        <Button icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                      </div>
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
        </Drawer>

        <Drawer
          title="反审核退回修改"
          open={returnDrawerOpen}
          onClose={() => setReturnDrawerOpen(false)}
          rootClassName="order-commercials-drawer"
          destroyOnHidden
          footer={(
            <div className="order-commercials-drawer-footer">
              <Button onClick={() => setReturnDrawerOpen(false)}>取消</Button>
              <Button
                type="primary"
                loading={returnToPendingMutation.isPending}
                disabled={!returnReason.trim()}
                onClick={() => returnToPendingMutation.mutate()}
              >
                确认退回
              </Button>
            </div>
          )}
        >
          <div className="order-return-drawer-body">
            <Typography.Paragraph>
              订单将退回待派工状态，退回后可重新修改产品、数量、价格和施工人工费。
            </Typography.Paragraph>
            <Input.TextArea
              rows={4}
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              placeholder="请填写反审核退回原因"
            />
            <Typography.Text type="secondary">
              审计动作：ORDER_RETURNED_TO_PENDING_DISPATCH
            </Typography.Text>
          </div>
        </Drawer>

        <Drawer
          title={<span className="order-fulfillment-drawer-title"><CheckCircleOutlined />确认提交派工与库房匹配</span>}
          open={fulfillmentDrawerOpen}
          onClose={() => setFulfillmentDrawerOpen(false)}
          rootClassName="order-fulfillment-drawer"
          destroyOnHidden
          footer={(
            <div className="order-fulfillment-drawer-footer">
              <Button onClick={saveCurrentFulfillmentDraft}>
                暂存草稿
              </Button>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={continueFulfillmentFlow}>
                {fulfillmentPrimaryActionLabel}
              </Button>
            </div>
          )}
        >
          <div className="order-fulfillment-drawer-body">
            <section className="order-fulfillment-drawer-section">
              <div className="order-fulfillment-section-head">
                <i />
                <h3>订单概览</h3>
              </div>
              <div className="order-fulfillment-summary-grid">
                <div>
                  <span>订单号</span>
                  <strong>{order?.orderNo ?? "-"}</strong>
                </div>
                <div>
                  <span>客户姓名</span>
                  <strong>{getCustomerName(order)}</strong>
                </div>
                <div>
                  <span>车型</span>
                  <strong>{getVehicleLabel(order)}</strong>
                </div>
                <div>
                  <span>施工类型</span>
                  <strong>{getConstructionTypeLabel(order?.constructionType)}</strong>
                </div>
                <div className="order-fulfillment-summary-wide">
                  <span>预约施工日期</span>
                  <strong>{[formatDateOnly(order?.appointmentDate), order?.appointmentTimeSlot].filter(Boolean).join(" ") || "-"}</strong>
                </div>
              </div>
            </section>

            <section className="order-fulfillment-drawer-section">
              <div className="order-fulfillment-section-head">
                <i />
                <h3>履约流转路径</h3>
              </div>
              <div className="order-fulfillment-flow-steps">
                <div className="order-fulfillment-flow-step is-active">
                  <span>1</span>
                  <div>
                    <strong>确认提交</strong>
                    <p>完成订单、客户、产品和施工要求核对。</p>
                  </div>
                </div>
                <div className={`order-fulfillment-flow-step ${fulfillmentCanEnterConstruction ? "is-active" : "is-next"}`}>
                  <span>2</span>
                  <div>
                    <strong>库房匹配</strong>
                    <p>{fulfillmentCanEnterConstruction ? "货品已完成匹配，可进入施工派工。" : "提交后进入库存匹配，确认现货或触发采购补货。"}</p>
                  </div>
                </div>
                <div className={`order-fulfillment-flow-step ${fulfillmentCanEnterConstruction ? "is-next" : ""}`}>
                  <span>3</span>
                  <div>
                    <strong>施工派工</strong>
                    <p>{fulfillmentCanEnterConstruction ? "下一步选择施工人员并确认派工。" : "库房匹配完成后再进入施工派工。"}</p>
                  </div>
                </div>
              </div>
              <Typography.Text type="secondary">{fulfillmentPrimaryActionHint}</Typography.Text>
            </section>

            <section className="order-fulfillment-drawer-section">
              <div className="order-fulfillment-section-head order-fulfillment-section-between">
                <span><i /> <h3>货品匹配预检</h3></span>
                <b>共 {order?.items?.length ?? 0} 项货品</b>
              </div>
              <div className="order-fulfillment-product-list">
                {(order?.items ?? []).map((item) => {
                  const inventoryStatus = getFulfillmentInventoryStatus(item);

                  return (
                    <div key={item.id} className="order-fulfillment-product-row">
                      <span><InboxOutlined /></span>
                      <div>
                        <strong>{`${item.product?.brand ?? ""} ${item.product?.name ?? ""}`.trim() || "未命名产品"}</strong>
                        <p>{item.product?.model ?? "型号待完善"}</p>
                      </div>
                      <b>x{item.quantity}</b>
                      <Tag color={inventoryStatus.color}>{inventoryStatus.label}</Tag>
                    </div>
                  );
                })}
                {(order?.items ?? []).length === 0 ? <Typography.Text type="secondary">暂无产品明细，提交前请先补齐商品清单。</Typography.Text> : null}
              </div>
            </section>

            <section className="order-fulfillment-drawer-section order-fulfillment-checklist">
              <Checkbox
                checked={fulfillmentChecklist.customerConfirmed}
                onChange={(event) =>
                  setFulfillmentChecklist((current) => ({ ...current, customerConfirmed: event.target.checked }))
                }
              >
                <strong>已核对客户信息及施工要求</strong>
                <span>确认施工部位、产品型号、特殊工艺和客户偏好已完成沟通。</span>
              </Checkbox>
              <Checkbox
                checked={fulfillmentChecklist.scheduleNotified}
                onChange={(event) =>
                  setFulfillmentChecklist((current) => ({ ...current, scheduleNotified: event.target.checked }))
                }
              >
                <strong>已告知客户施工时间及注意事项</strong>
                <span>包含工期预估、车辆交接流程以及施工期间的必要提醒。</span>
              </Checkbox>
              <Checkbox
                checked={fulfillmentChecklist.commercialConfirmed}
                onChange={(event) =>
                  setFulfillmentChecklist((current) => ({ ...current, commercialConfirmed: event.target.checked }))
                }
              >
                <strong>产品、数量、单价和人工费已确认</strong>
                <span>提交后将进入库房备货与施工派工，请确保价格和数量准确。</span>
              </Checkbox>
            </section>

            <section className="order-fulfillment-drawer-section">
              <div className="order-fulfillment-section-head">
                <i />
                <h3>给库房/施工主管的补充建议</h3>
              </div>
              <Input.TextArea
                rows={5}
                value={fulfillmentNote}
                onChange={(event) => setFulfillmentNote(event.target.value)}
                placeholder="例如：客户要求特别注意前保险杠合缝处、需库房优先调配 A 库物料等..."
              />
            </section>
          </div>
        </Drawer>
    </>
  );
}

function getFulfillmentDraftKey(orderId: string) {
  return `mallbay-order-fulfillment-draft:${orderId}`;
}

function loadFulfillmentDraft(orderId: string): FulfillmentDraft | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = localStorage.getItem(getFulfillmentDraftKey(orderId));
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Partial<FulfillmentDraft>;
    return {
      checklist: {
        customerConfirmed: parsed.checklist?.customerConfirmed === true,
        scheduleNotified: parsed.checklist?.scheduleNotified === true,
        commercialConfirmed: parsed.checklist?.commercialConfirmed === true
      },
      note: typeof parsed.note === "string" ? parsed.note : ""
    };
  } catch {
    return undefined;
  }
}

function saveFulfillmentDraft(orderId: string, draft: FulfillmentDraft) {
  if (typeof window === "undefined") return;
  localStorage.setItem(getFulfillmentDraftKey(orderId), JSON.stringify(draft));
}

function clearFulfillmentDraft(orderId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(getFulfillmentDraftKey(orderId));
}

function getFulfillmentChecklistItems(checklist: FulfillmentChecklist) {
  return [
    {
      key: "customerConfirmed",
      checked: checklist.customerConfirmed,
      summary: checklist.customerConfirmed ? "客户、车辆和施工要求已核对" : "待核对客户、车辆和施工要求"
    },
    {
      key: "commercialConfirmed",
      checked: checklist.commercialConfirmed,
      summary: checklist.commercialConfirmed ? "产品、数量、单价和人工费已确认" : "待确认产品、数量、单价和人工费"
    },
    {
      key: "scheduleNotified",
      checked: checklist.scheduleNotified,
      summary: checklist.scheduleNotified ? "施工时间、交车流程和注意事项已告知" : "待告知施工时间、交车流程和注意事项"
    }
  ];
}

function getOrderAuditActionLabel(action: string) {
  const labels: Record<string, string> = {
    ORDER_COMMERCIALS_UPDATED: "订单明细和金额变更"
  };
  return labels[action] ?? "订单操作记录";
}

function getCustomerName(order?: OrderDetail) {
  return order?.customer?.companyName ?? order?.customer?.name ?? order?.customer?.contactPerson ?? "-";
}

function getVehicleLabel(order?: OrderDetail) {
  const vehicle = order?.vehicle;
  return [vehicle?.carPlate, vehicle?.carModel, vehicle?.carColor].filter(Boolean).join(" / ") || "-";
}

function formatDateOnly(value?: string | null) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

function getOrderSteps(status?: string) {
  const currentIndex = getOrderWorkflowIndex(status);
  const steps = ["订单确认", "库房匹配", "施工派工", "施工交付", "质保售后"];

  return steps.map((label, index) => ({
    label,
    description: index < currentIndex ? "已完成" : index === currentIndex ? "当前阶段" : "待处理",
    state: index < currentIndex ? "done" : index === currentIndex ? "active" : "pending"
  }));
}

function getOrderWorkflowIndex(status?: string) {
  const workflowIndexByStatus: Record<string, number> = {
    DRAFT: 0,
    PENDING_PAYMENT: 0,
    PENDING_DISPATCH: 1,
    DISPATCHED: 2,
    IN_CONSTRUCTION: 3,
    COMPLETED: 4,
    WARRANTIED: 4,
    CANCELLED: 0
  };
  return workflowIndexByStatus[status ?? "PENDING_DISPATCH"] ?? 0;
}

function getAuditReason(metadata?: Record<string, unknown>) {
  return typeof metadata?.reason === "string" ? `原因：${metadata.reason}` : undefined;
}

function formatAuditCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
