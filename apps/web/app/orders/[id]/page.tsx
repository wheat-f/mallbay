"use client";

import { Alert, App, Button, Card, Checkbox, Drawer, Form, Input, InputNumber, Select, Skeleton, Tag, Typography } from "antd";
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
import { getProductUnitLabel } from "../../../src/features/products/display";
import { OrderPaymentDrawer } from "../../../src/features/orders/order-payment-drawer";
import { useAuthStore } from "../../../src/stores/auth-store";

type OrderDetail = {
  id: string;
  storeId: string;
  salesPersonId: string;
  salesPerson?: { id: string; username?: string | null; nickname?: string | null } | null;
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
    constructionChargeCents?: number | null;
    suggestedConstructionChargeCents?: number | null;
    constructionChargeAdjustmentReason?: string | null;
    totalAmountCents: number;
    paidAmountCents: number;
    outstandingCents: number;
    pricingCalculationId?: string | null;
    pricingMode?: "LEGACY" | "ACTIVE";
    pricingRuleSetVersion?: number | null;
    pricingInputHash?: string | null;
    pricingOutputSnapshot?: {
      calculation?: { suggestedProductAmountCents?: number; suggestedLaborCostCents?: number; suggestedTotalCents?: number; appliedRules?: Array<{ ruleName?: string; group?: string }> };
    } | null;
  } | null;
  payments?: { id: string; paymentType: string; amountCents: number; paidAt: string; account?: { name: string } }[];
  amendmentRequests?: Array<{
    id: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "CANCELLED";
    reason: string;
    reviewNote?: string | null;
    createdAt: string;
  }>;
};

type ProductOption = {
  id: string;
  brand?: string | null;
  name?: string | null;
  model?: string | null;
  unit?: string | null;
  salesUnit?: string | null;
};

type ProductSelectOption = {
  label: string;
  value: string;
  product: ProductOption;
};

type CommercialsFormValues = {
  items: { id?: string; productId: string; quantity: number; unitPriceYuan: number }[];
  constructionChargeYuan: number;
  remark?: string;
  changeReason: string;
};

type AmendmentFormValues = { reason: string };
type AmendmentReviewFormValues = { action: "APPROVE" | "REJECT"; reviewNote: string };

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

const commercialEditableStatuses = ["PENDING_DISPATCH", "DISPATCHED", "IN_CONSTRUCTION", "COMPLETED", "WARRANTIED"] as const;

export default function OrderDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [commercialsOpen, setCommercialsOpen] = useState(false);
  const [amendmentOpen, setAmendmentOpen] = useState(false);
  const [amendmentReviewOpen, setAmendmentReviewOpen] = useState(false);
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [fulfillmentDrawerOpen, setFulfillmentDrawerOpen] = useState(false);
  const [fulfillmentChecklist, setFulfillmentChecklist] = useState<FulfillmentChecklist>(emptyFulfillmentChecklist);
  const [fulfillmentNote, setFulfillmentNote] = useState("");
  const [commercialsForm] = Form.useForm<CommercialsFormValues>();
  const [amendmentForm] = Form.useForm<AmendmentFormValues>();
  const [amendmentReviewForm] = Form.useForm<AmendmentReviewFormValues>();
  const commercialItems = Form.useWatch("items", commercialsForm);
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
    mutationFn: (values: CommercialsFormValues) => {
      const constructionChargeCents = yuanToCents(values.constructionChargeYuan);
      return orderApi.updateCommercials(params.id, {
        items: values.items.map((item) => ({
          id: item.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPriceCents: yuanToCents(item.unitPriceYuan)
        })),
        constructionChargeCents,
        laborCostCents: constructionChargeCents,
        ...(hasApprovedAmendment ? {} : { remark: values.remark }),
        changeReason: values.changeReason
      });
    },
    onSuccess: async () => {
      message.success("订单变更已保存");
      setCommercialsOpen(false);
      commercialsForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["order-detail", params.id] });
      await queryClient.invalidateQueries({ queryKey: ["order-audit-events", params.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const amendmentRequestMutation = useMutation({
    mutationFn: (values: AmendmentFormValues) => orderApi.createAmendmentRequest(params.id, values),
    onSuccess: async () => {
      message.success("改单申请已提交，等待财务审批");
      amendmentForm.resetFields();
      setAmendmentOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["order-detail", params.id] });
      await queryClient.invalidateQueries({ queryKey: ["order-audit-events", params.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const productOptions: ProductSelectOption[] = ((productsQuery.data?.items ?? []) as ProductOption[]).map((product) => ({
    label: `${getOrderProductLabel(product)}（销售单位：${getProductUnitLabel(resolveProductSalesUnit(product))}）`,
    value: product.id,
    product
  }));
  const hasEditableOutstandingAmount = (order?.amount?.outstandingCents ?? 0) > 0;
  const pendingAmendment = order?.amendmentRequests?.find((request) => request.status === "PENDING");
  const latestRejectedAmendment = order?.amendmentRequests?.find((request) => request.status === "REJECTED");
  const hasPendingAmendment = Boolean(pendingAmendment);
  const hasApprovedAmendment = order?.amendmentRequests?.some((request) => request.status === "APPROVED") ?? false;
  const hasCompletedAmendment = order?.amendmentRequests?.some((request) => request.status === "COMPLETED") ?? false;
  const canManageOrderAmendment = Boolean(
    order && user && (
      user.isAuditor ||
      user.storeMember?.position === "MANAGER" ||
      user.storeMember?.position === "CUSTOMER_SERVICE" ||
      (user.storeMember?.position === "SALES" && user.id === order.salesPersonId)
    )
  );
  const canRequestAmendment = Boolean(
    order
      && canManageOrderAmendment
      && !hasEditableOutstandingAmount
      && !hasPendingAmendment
      && !hasApprovedAmendment
      && !hasCompletedAmendment
  );
  const canReviewAmendment = Boolean(
    pendingAmendment && (user?.isAuditor || user?.storeMember?.position === "FINANCE")
  );
  const canOperateFulfillment = Boolean(
    order && user && (
      user.storeMember?.position === "MANAGER" ||
      user.storeMember?.position === "CUSTOMER_SERVICE" ||
      (user.storeMember?.position === "SALES" && user.id === order.salesPersonId)
    )
  );
  const amendmentReviewMutation = useMutation({
    mutationFn: (values: AmendmentReviewFormValues) =>
      orderApi.reviewAmendmentRequest(params.id, pendingAmendment!.id, values),
    onSuccess: async (_response, values) => {
      message.success(values.action === "APPROVE" ? "改单申请已批准，订单已开放修改" : "改单申请已驳回");
      amendmentReviewForm.resetFields();
      setAmendmentReviewOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["order-detail", params.id] });
      await queryClient.invalidateQueries({ queryKey: ["order-audit-events", params.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const canEditCommercials = Boolean(
    order
      && commercialEditableStatuses.includes(order.status as (typeof commercialEditableStatuses)[number])
      && canManageOrderAmendment
      && (hasEditableOutstandingAmount || hasApprovedAmendment)
      && (order.amount?.pricingMode !== "ACTIVE" || hasApprovedAmendment)
  );
  const shouldShowFulfillmentConfirmation = order?.status === "PENDING_DISPATCH" && canOperateFulfillment;
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
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceYuan: centsToYuan(item.unitPriceCents) ?? 0
      })),
      constructionChargeYuan: centsToYuan(order.amount?.constructionChargeCents ?? order.amount?.laborCostCents) ?? 0,
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
    setPaymentDrawerOpen(true);
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
                {canRequestAmendment ? (
                  <Button icon={<FileTextOutlined />} onClick={() => setAmendmentOpen(true)}>
                    申请结算后金额修改
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
                ["施工收费", yuanCurrency(order?.amount?.constructionChargeCents ?? order?.amount?.laborCostCents), "按订单最终收费计"],
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
                    <span>销售员</span><strong>{getSalesPersonName(order)}</strong>
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
                    <div><span>施工收费</span><strong>{yuanCurrency(order?.amount?.constructionChargeCents ?? order?.amount?.laborCostCents)}</strong></div>
                    <div><span>订单总计</span><strong>{yuanCurrency(order?.amount?.totalAmountCents)}</strong></div>
                  </div>
                  {canEditCommercials ? (
                    <Typography.Text type="secondary">收款未完全确认前可修改产品清单</Typography.Text>
                  ) : order?.amount?.pricingMode === "ACTIVE" ? (
                    <Typography.Text type="secondary">正式订单价格快照已冻结，不能修改产品清单或成交价。</Typography.Text>
                  ) : order?.amount?.pricingMode === "LEGACY" ? (
                    <div className="order-pricing-snapshot-panel">
                      <div className="order-info-grid">
                        <span>价格模式</span><strong>历史订单（LEGACY）</strong>
                        <span>建议价快照</span><strong>未接入新价格引擎</strong>
                      </div>
                    </div>
                  ) : null}
                  {hasPendingAmendment ? <Alert type="warning" showIcon message="已提交本月结算改单申请，等待财务审批" /> : null}
                </Card>
              </div>

              <div className="order-bento-column">
                <Card className="order-detail-card order-construction-card" title={<><ToolOutlined />施工详情</>}>
                  <div className="order-info-grid">
                    <span>施工类型</span><strong>{getConstructionTypeLabel(order?.constructionType)}</strong>
                    <span>施工地点</span><strong>{getConstructionLocationLabel(order?.constructionLocation)}</strong>
                    <span>系统建议施工收费</span>
                    <strong>
                      {yuanCurrency(order?.amount?.suggestedConstructionChargeCents ?? order?.amount?.suggestedLaborCostCents)}
                    </strong>
                    <span>本单施工收费</span><strong>{yuanCurrency(order?.amount?.constructionChargeCents ?? order?.amount?.laborCostCents)}</strong>
                    <span>施工收费调整原因</span><strong>{order?.amount?.constructionChargeAdjustmentReason ?? order?.amount?.laborCostAdjustmentReason ?? "-"}</strong>
                    <span>备注</span><strong>{order?.remark ?? "-"}</strong>
                  </div>
                  {order?.amount?.pricingCalculationId ? (
                    <div className="order-pricing-snapshot-panel">
                      <div className="order-info-grid">
                        <span>建议价规则版本</span><strong>v{order.amount.pricingRuleSetVersion ?? "-"}</strong>
                        <span>建议产品合计</span><strong>{yuanCurrency(order.amount.pricingOutputSnapshot?.calculation?.suggestedProductAmountCents)}</strong>
                        <span>系统建议施工收费</span><strong>{yuanCurrency(order.amount.pricingOutputSnapshot?.calculation?.suggestedLaborCostCents)}</strong>
                        <span>建议总价</span><strong>{yuanCurrency(order.amount.pricingOutputSnapshot?.calculation?.suggestedTotalCents)}</strong>
                        <span>计算哈希</span><strong>{order.amount.pricingInputHash?.slice(0, 12) ?? "-"}…</strong>
                      </div>
                      <Typography.Text type="secondary">正式订单已冻结服务端价格快照；规则发布不会改写本单。</Typography.Text>
                    </div>
                  ) : null}
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
                  {canReviewAmendment ? (
                    <Alert
                      className="mb-3"
                      type="warning"
                      showIcon
                      message="待审批：本月已结算订单改单申请"
                      description={`申请原因：${pendingAmendment?.reason ?? "-"}`}
                      action={<Button size="small" type="primary" onClick={() => setAmendmentReviewOpen(true)}>财务审批</Button>}
                    />
                  ) : null}
                  {latestRejectedAmendment && !canManageOrderAmendment ? (
                    <Alert
                      className="mb-3"
                      type="info"
                      showIcon
                      message="改单申请已驳回"
                      description="请由订单店长、客服或负责销售员补充原因后重新提交；财务仅负责审批。"
                    />
                  ) : null}
                  <div className="order-audit-timeline">
                    {auditEventsQuery.isLoading ? <Typography.Text type="secondary">加载中...</Typography.Text> : null}
                    {(auditEventsQuery.data ?? []).map((event: OrderAuditEvent) => (
                      <div key={event.id}>
                        <i />
                        <strong>{getOrderAuditActionLabel(event.action)}</strong>
                        <span>
                          {[
                            formatAuditCreatedAt(event.createdAt),
                            getOrderAuditSummary(event.action, event.metadata),
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

      <OrderPaymentDrawer
        open={paymentDrawerOpen}
        order={order}
        storeId={order?.storeId}
        onClose={() => setPaymentDrawerOpen(false)}
        onSuccess={async () => {
          await queryClient.invalidateQueries({ queryKey: ["order-detail", params.id] });
          await queryClient.invalidateQueries({ queryKey: ["order-audit-events", params.id] });
        }}
      />

      <Drawer
        title="申请结算后金额修改"
        open={amendmentOpen}
        onClose={() => setAmendmentOpen(false)}
        destroyOnHidden
        footer={(
          <div className="order-commercials-drawer-footer">
            <Button onClick={() => setAmendmentOpen(false)}>取消</Button>
            <Button type="primary" loading={amendmentRequestMutation.isPending} onClick={() => amendmentForm.submit()}>
              提交财务审批
            </Button>
          </div>
        )}
      >
        <Alert
          type="info"
          showIcon
          message="仅最后结算日在本月的订单可申请一次。财务批准后仅开放产品、数量、单价和施工收费修改，不改变施工、交付或质保进度；原收款记录保留，差额由财务补收、退款或冲抵。"
        />
        <Form form={amendmentForm} layout="vertical" className="mt-4" onFinish={(values) => amendmentRequestMutation.mutate(values)}>
          <Form.Item name="reason" label="申请原因" rules={[{ required: true, message: "请填写申请原因" }]}>
            <Input.TextArea rows={4} placeholder="例如客户追加、变更产品或施工收费修正" />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title="财务审批：订单改单申请"
        open={amendmentReviewOpen}
        onClose={() => setAmendmentReviewOpen(false)}
        destroyOnHidden
        footer={(
          <div className="order-commercials-drawer-footer">
            <Button onClick={() => setAmendmentReviewOpen(false)}>取消</Button>
            <Button type="primary" loading={amendmentReviewMutation.isPending} onClick={() => amendmentReviewForm.submit()}>
              提交审批结果
            </Button>
          </div>
        )}
      >
        <Alert
          type="info"
          showIcon
          message="批准后仅开放一次产品与金额修改，不改变施工、交付或质保进度；历史收款记录保留。"
          description={`申请原因：${pendingAmendment?.reason ?? "-"}`}
        />
        <Form
          form={amendmentReviewForm}
          layout="vertical"
          className="mt-4"
          initialValues={{ action: "APPROVE" }}
          onFinish={(values) => amendmentReviewMutation.mutate(values)}
        >
          <Form.Item name="action" label="审批结论" rules={[{ required: true, message: "请选择审批结论" }]}>
            <Select options={[{ value: "APPROVE", label: "批准，开放改单" }, { value: "REJECT", label: "驳回，不开放修改" }]} />
          </Form.Item>
          <Form.Item name="reviewNote" label="审批意见" rules={[{ required: true, message: "请填写审批意见" }]}>
            <Input.TextArea rows={4} placeholder="说明批准或驳回的原因" />
          </Form.Item>
        </Form>
      </Drawer>

        <Drawer
          title={hasApprovedAmendment ? "修改已结算订单金额" : "修改订单明细"}
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
            <Typography.Paragraph type="secondary">
              {hasApprovedAmendment
                ? "本次仅可修改产品、数量、单价和施工收费；不会改变客户、车辆、预约、库存/出库或施工进度。"
                : "收款未完全确认前可调整产品、数量、单价和施工收费；已锁库或已出库的库存记录会保留追踪。"}
            </Typography.Paragraph>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => {
                    const { key, ...fieldProps } = field;
                    return (
                      <div key={key} className="order-commercials-item-grid">
                        <Form.Item {...fieldProps} name={[field.name, "id"]} hidden>
                          <Input />
                        </Form.Item>
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
                        <Form.Item label="单位">
                          <Input
                            readOnly
                            value={getSelectedCommercialProductUnitLabel(
                              commercialItems?.[field.name]?.productId,
                              productOptions
                            )}
                          />
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
              name="constructionChargeYuan"
              label="本单施工收费（元）"
              rules={[{ required: true, message: "请输入本单施工收费" }]}
            >
              <InputNumber min={0} precision={2} />
            </Form.Item>
            {!hasApprovedAmendment ? (
              <Form.Item name="remark" label="备注">
                <Input.TextArea rows={3} />
              </Form.Item>
            ) : null}
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
                <strong>产品、数量、单价和施工收费已确认</strong>
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
      summary: checklist.commercialConfirmed ? "产品、数量、单价和施工收费已确认" : "待确认产品、数量、单价和施工收费"
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
    ORDER_COMMERCIALS_UPDATED: "订单明细和金额变更",
    ORDER_AMENDMENT_REQUESTED: "提交本月结算订单改单申请",
    ORDER_AMENDMENT_APPROVED: "财务批准改单申请",
    ORDER_AMENDMENT_REJECTED: "财务驳回改单申请",
    ORDER_STATUS_REPAIRED_AFTER_AMENDMENT: "订单进度状态修复"
  };
  return labels[action] ?? "订单操作记录";
}

function resolveProductSalesUnit(product: ProductOption) {
  return product.salesUnit ?? product.unit ?? "PIECE";
}

function getSelectedCommercialProductUnitLabel(
  productId: string | undefined,
  productOptions: ProductSelectOption[]
) {
  if (!productId) return "-";
  const product = productOptions.find((option) => option.value === productId)?.product;
  return product ? getProductUnitLabel(resolveProductSalesUnit(product)) : "单位待确认";
}

function getCustomerName(order?: OrderDetail) {
  return order?.customer?.companyName ?? order?.customer?.name ?? order?.customer?.contactPerson ?? "-";
}

function getSalesPersonName(order?: OrderDetail) {
  return order?.salesPerson?.nickname ?? order?.salesPerson?.username ?? "销售员待确认";
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

function getOrderAuditSummary(action: string, metadata?: Record<string, unknown>) {
  const reason = typeof metadata?.reason === "string" ? metadata.reason : undefined;
  const reviewNote = typeof metadata?.reviewNote === "string" ? metadata.reviewNote : undefined;
  if (action === "ORDER_AMENDMENT_REQUESTED") {
    return [reason ? `申请原因：${reason}` : undefined, "处理状态：待财务审批"].filter(Boolean).join("；");
  }
  if (action === "ORDER_AMENDMENT_APPROVED") {
    return ["审批结论：已批准", reviewNote ? `审批意见：${reviewNote}` : undefined].filter(Boolean).join("；");
  }
  if (action === "ORDER_AMENDMENT_REJECTED") {
    return ["审批结论：已驳回", reviewNote ? `审批意见：${reviewNote}` : undefined].filter(Boolean).join("；");
  }
  if (action === "ORDER_STATUS_REPAIRED_AFTER_AMENDMENT") {
    return "已恢复原施工/质保进度；金额修改不再触发重新派工。";
  }
  return reason ? `变更原因：${reason}` : reviewNote ? `审批意见：${reviewNote}` : undefined;
}

function formatAuditCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
