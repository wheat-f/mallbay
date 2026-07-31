"use client";

import type { CreateWarrantyPayload } from "../../../src/lib/api";
import { App, Button, Card, Form, Input, Select, Tag } from "antd";
import { ArrowLeftOutlined, FileProtectOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo } from "react";
import { orderApi, warrantiesApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

type WarrantyOrderOption = {
  id: string;
  orderNo?: string | null;
  status?: string | null;
  constructionRecord?: { qualityResult?: string | null } | null;
  appointmentDate?: string | null;
  customer?: {
    name?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
    personalName?: string | null;
  } | null;
  vehicle?: {
    carPlate?: string | null;
    carModel?: string | null;
    carColor?: string | null;
    plateNo?: string | null;
    model?: string | null;
    color?: string | null;
  } | null;
};

type WarrantyOrderDetail = WarrantyOrderOption & {
  appointmentTimeSlot?: string | null;
  constructionType?: string | null;
  items?: Array<{
    id: string;
    quantity: number;
    product?: {
      brand?: string | null;
      name?: string | null;
      model?: string | null;
      warrantyYears?: number | null;
    } | null;
  }>;
};

export default function CreateWarrantyPage() {
  return (
    <Suspense fallback={<div className="management-page" />}>
      <CreateWarrantyContent />
    </Suspense>
  );
}

function CreateWarrantyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [form] = Form.useForm<CreateWarrantyPayload>();
  const selectedOrderId = Form.useWatch("orderId", form);
  const initialOrderId = searchParams.get("orderId") ?? undefined;

  const completedOrdersQuery = useQuery({
    queryKey: ["warranties", "completed-orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "IN_CONSTRUCTION", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const orderDetailQuery = useQuery({
    queryKey: ["warranties", "order-detail", selectedOrderId],
    queryFn: () => orderApi.detail(selectedOrderId!) as Promise<WarrantyOrderDetail>,
    enabled: Boolean(selectedOrderId)
  });
  const completedOrders = useMemo(
    () => (completedOrdersQuery.data?.items ?? []).filter((order) => (order as WarrantyOrderOption).constructionRecord?.qualityResult === "PASS") as WarrantyOrderOption[],
    [completedOrdersQuery.data?.items]
  );
  const completedOrderOptions = completedOrders.map((order) => ({
    value: order.id,
    label: [order.orderNo ?? "未编号订单", getOrderCustomerName(order), getOrderVehicleLabel(order)].join(" / ")
  }));
  const selectedOrder = (orderDetailQuery.data ?? completedOrders.find((order) => order.id === selectedOrderId)) as
    | WarrantyOrderDetail
    | undefined;
  const firstProduct = selectedOrder?.items?.[0]?.product;
  const warrantyYears = firstProduct?.warrantyYears ?? 5;

  useEffect(() => {
    if (initialOrderId && completedOrders.some((order) => order.id === initialOrderId)) {
      form.setFieldValue("orderId", initialOrderId);
    }
  }, [completedOrders, form, initialOrderId]);

  const createWarranty = useMutation({
    mutationFn: (values: CreateWarrantyPayload) => warrantiesApi.createFromOrder(values),
    onSuccess: async (created) => {
      message.success("电子质保已生成");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["warranties", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["warranties", "work-orders", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["warranties", "completed-orders", storeId] })
      ]);
      router.push(`/warranties/${created.id}`);
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page warranty-create-page">
      <StorePageHeader title="生成电子质保" description="选择已完工工单，核对真实订单信息后生成电子质保。" />

      <section className="warranty-command-bar">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/warranties")}>
          返回质保管理
        </Button>
        <div className="warranty-command-copy">
          <span>质保生成</span>
          <strong>只允许从已完工且尚未生成质保的工单创建</strong>
        </div>
      </section>

      <section className="warranty-workspace">
        <div className="warranty-main-column">
          <Card className="warranty-registration-panel" title="质保登记信息">
            <Form form={form} layout="vertical" onFinish={(values) => createWarranty.mutate(values)}>
              <Form.Item name="orderId" label="已完工工单" rules={[{ required: true, message: "请选择已完工工单" }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={completedOrdersQuery.isLoading}
                  placeholder="选择已完工工单"
                  options={completedOrderOptions}
                />
              </Form.Item>

              <div className="warranty-parameter-card">
                <div className="warranty-parameter-card-title">系统自动提取信息 (来自工单)</div>
                <div className="warranty-parameter-grid">
                  <ReadonlyField label="客户姓名" value={selectedOrder ? getOrderCustomerName(selectedOrder) : "选择工单后自动带入"} />
                  <ReadonlyField label="联系电话" value={selectedOrder ? "订单接口未返回联系电话" : "选择工单后自动带入"} />
                  <ReadonlyField label="车牌号" value={selectedOrder ? getOrderVehicleLabel(selectedOrder) : "选择工单后自动带入"} />
                  <ReadonlyField label="车架号 VIN" value={selectedOrder ? "车辆档案未返回 VIN" : "选择工单后自动带入"} />
                </div>
              </div>

              <div className="warranty-parameter-card">
                <div className="warranty-parameter-card-title">质保参数配置</div>
                <div className="warranty-parameter-grid">
                  <ReadonlyField label="质保编号 (系统生成)" value="提交后自动生成" />
                  <ReadonlyField
                    label="产品型号 (自动匹配)"
                    value={firstProduct ? [firstProduct.brand, firstProduct.name, firstProduct.model].filter(Boolean).join(" / ") : "依据订单产品自动匹配"}
                  />
                  <ReadonlyField label="质保年限" value={`${warrantyYears} 年`} />
                  <ReadonlyField label="质保生效与到期" value="尾款结清后按最终交付日生效，并按质保年限计算到期日" />
                </div>
              </div>

              <Form.Item name="scope" label="质保范围 (依据厂家标准)" rules={[{ required: true, message: "请输入质保范围" }]}>
                <Input placeholder="黄变 / 开裂 / 脱胶 / 起泡" />
              </Form.Item>

              <div className="finance-form-actions">
                <Button onClick={() => router.push("/warranties")}>取消</Button>
                <Button type="primary" htmlType="submit" icon={<FileProtectOutlined />} loading={createWarranty.isPending}>
                  提交生成质保
                </Button>
              </div>
            </Form>
          </Card>
        </div>

        <aside className="warranty-side-column warranty-support-grid">
          <Card className="warranty-preview-panel" title="电子质保卡预览">
            <div className="warranty-card-preview">
              <div className="warranty-card-topline">
                <span>mallbay</span>
                <SafetyCertificateOutlined />
              </div>
              <strong>{selectedOrder?.orderNo ?? "选择工单后预览"}</strong>
              <p>{selectedOrder ? `${getOrderCustomerName(selectedOrder)} / ${getOrderVehicleLabel(selectedOrder)}` : "生成前先核对客户、车辆和施工产品"}</p>
              <Tag color={selectedOrder ? "processing" : "default"}>{selectedOrder ? "待生成" : "待选择"}</Tag>
            </div>
            <div className="warranty-preview-meta">
              {[
                { label: "施工类型", value: selectedOrder?.constructionType ?? "-" },
                { label: "预约时间", value: selectedOrder ? formatAppointment(selectedOrder) : "-" },
                { label: "质保范围", value: form.getFieldValue("scope") ?? "-" },
                { label: "生效日期", value: "尾款结清后的最终交付日" }
              ].map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </section>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label>
      <span>{label}</span>
      <Input value={value} disabled />
    </label>
  );
}

function getOrderCustomerName(order: WarrantyOrderOption) {
  return order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name ?? order.customer?.contactPerson ?? "未登记客户";
}

function getOrderVehicleLabel(order: WarrantyOrderOption) {
  const plate = order.vehicle?.carPlate ?? order.vehicle?.plateNo;
  const model = order.vehicle?.carModel ?? order.vehicle?.model;
  const color = order.vehicle?.carColor ?? order.vehicle?.color;
  return [plate, model, color].filter(Boolean).join(" / ") || "车辆未登记";
}

function formatAppointment(order: WarrantyOrderDetail) {
  const date = order.appointmentDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  return [date, order.appointmentTimeSlot].filter(Boolean).join(" ") || "-";
}

function addYears(value: string, years: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "按起始日期自动计算";
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
}
