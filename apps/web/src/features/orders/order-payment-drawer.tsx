"use client";

import type { PaymentType } from "@mallbay/shared";
import { App, Button, DatePicker, Drawer, Form, InputNumber, Select, Typography } from "antd";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useEffect } from "react";
import { orderApi } from "./api";
import { centsToYuan, yuanToCents } from "./create-order-form";
import { getPaymentTypeLabel, yuanCurrency } from "./order-display";

type OrderPaymentDrawerOrder = {
  id: string;
  orderNo?: string | null;
  storeId?: string | null;
  amount?: {
    totalAmountCents?: number | null;
    paidAmountCents?: number | null;
    outstandingCents?: number | null;
  } | null;
  customer?: {
    name?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
  } | null;
};

type OrderPaymentFormValues = {
  accountId: string;
  paymentType: PaymentType;
  amountYuan: number;
  paidAt: Dayjs;
};

type OrderPaymentDrawerProps = {
  open: boolean;
  order?: OrderPaymentDrawerOrder | null;
  storeId?: string | null;
  onClose: () => void;
  onSuccess?: () => void | Promise<void>;
};

const paymentTypeOptions: PaymentType[] = ["DEPOSIT", "BALANCE", "FULL"];

export function OrderPaymentDrawer({ open, order, storeId, onClose, onSuccess }: OrderPaymentDrawerProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<OrderPaymentFormValues>();
  const effectiveStoreId = order?.storeId ?? storeId ?? undefined;
  const totalAmountCents = order?.amount?.totalAmountCents ?? 0;
  const paidAmountCents = order?.amount?.paidAmountCents ?? 0;
  const outstandingCents = order?.amount?.outstandingCents ?? Math.max(totalAmountCents - paidAmountCents, 0);
  const isFullyPaid = outstandingCents <= 0;

  const accountsQuery = useQuery({
    queryKey: ["order-payment-accounts", effectiveStoreId],
    queryFn: () => orderApi.paymentAccounts(effectiveStoreId!),
    enabled: open && Boolean(effectiveStoreId)
  });

  const addPaymentMutation = useMutation({
    mutationFn: (values: OrderPaymentFormValues) =>
      orderApi.addPayment(order!.id, {
        accountId: values.accountId,
        paymentType: values.paymentType,
        amountCents: yuanToCents(values.amountYuan),
        paidAt: values.paidAt.toISOString(),
        idempotencyKey: crypto.randomUUID()
      }),
    onSuccess: async () => {
      message.success("收款已记录");
      form.resetFields();
      await onSuccess?.();
      onClose();
    },
    onError: (error: Error) => message.error(error.message)
  });

  useEffect(() => {
    if (!open) return;
    const defaultAccount = accountsQuery.data?.find((account) => account.isDefault) ?? accountsQuery.data?.[0];
    form.setFieldsValue({
      accountId: defaultAccount?.id,
      paymentType: totalAmountCents > 0 && outstandingCents >= totalAmountCents ? "FULL" : "BALANCE",
      amountYuan: centsToYuan(outstandingCents) ?? 0,
      paidAt: dayjs()
    });
  }, [accountsQuery.data, form, open, outstandingCents, totalAmountCents]);

  const submitPayment = (values: OrderPaymentFormValues) => {
    if (!order) {
      message.error("请先选择订单");
      return;
    }
    if (isFullyPaid) {
      message.info("订单已收清，无需重复收款");
      return;
    }
    const amountCents = yuanToCents(values.amountYuan);
    if (amountCents <= 0) {
      message.error("收款金额必须大于 0");
      return;
    }
    if (amountCents > outstandingCents) {
      message.error("收款金额不能超过待收金额");
      return;
    }
    addPaymentMutation.mutate(values);
  };

  return (
    <Drawer
      title="记录订单收款"
      open={open}
      onClose={onClose}
      rootClassName="order-payment-drawer"
      destroyOnHidden
      footer={(
        <div className="order-payment-drawer-footer">
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={addPaymentMutation.isPending}
            disabled={!order || isFullyPaid}
            onClick={() => form.submit()}
          >
            确认收款
          </Button>
        </div>
      )}
    >
      <Typography.Paragraph type="secondary">
        订单内收款会同步更新订单已收/待收金额，财务流水由订单支付记录沉淀。
      </Typography.Paragraph>
      <div className="order-payment-context">
        <span>订单</span>
        <strong>{order?.orderNo ?? "-"}</strong>
        <span>客户</span>
        <strong>{getCustomerLabel(order)}</strong>
      </div>
      <div className="order-payment-summary">
        <div>
          <span>订单金额</span>
          <strong>{yuanCurrency(totalAmountCents)}</strong>
        </div>
        <div>
          <span>已收金额</span>
          <strong>{yuanCurrency(paidAmountCents)}</strong>
        </div>
        <div>
          <span>待收金额</span>
          <strong>{yuanCurrency(outstandingCents)}</strong>
        </div>
      </div>
      {isFullyPaid ? (
        <div className="order-payment-note">该订单已收清，列表与详情页只保留查看收款记录。</div>
      ) : null}
      <Form form={form} layout="vertical" onFinish={submitPayment}>
        <Form.Item name="accountId" label="收款账户" rules={[{ required: true, message: "请选择收款账户" }]}>
          <Select
            loading={accountsQuery.isLoading}
            placeholder="选择收款账户"
            options={(accountsQuery.data ?? []).map((account) => ({
              label: account.name,
              value: account.id
            }))}
          />
        </Form.Item>
        <Form.Item name="paymentType" label="收款类型" rules={[{ required: true, message: "请选择收款类型" }]}>
          <Select
            options={paymentTypeOptions.map((type) => ({
              label: getPaymentTypeLabel(type),
              value: type
            }))}
          />
        </Form.Item>
        <Form.Item
          name="amountYuan"
          label="收款金额"
          rules={[{ required: true, message: "请输入收款金额" }]}
        >
          <InputNumber min={0.01} precision={2} className="w-full" addonBefore="¥" />
        </Form.Item>
        <Form.Item name="paidAt" label="收款时间" rules={[{ required: true, message: "请选择收款时间" }]}>
          <DatePicker showTime className="w-full" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

function getCustomerLabel(order?: OrderPaymentDrawerOrder | null) {
  return order?.customer?.companyName ?? order?.customer?.name ?? order?.customer?.contactPerson ?? "-";
}
