"use client";

import type { DailyCapacitySummary } from "@mallbay/shared";
import { Alert, App, Button, Card, DatePicker, Drawer, Form, Input, InputNumber, Select, Space, Switch, Tag, TimePicker, Typography } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { constructionApi, customerApi, orderApi, productApi } from "../../../src/lib/api";
import type { CreateCustomerFormValues } from "../../../src/features/customers/create-customer-form";
import { toCreateCustomerPayload } from "../../../src/features/customers/create-customer-form";
import {
  buildOrderCustomerOptions,
  buildOrderVehicleOptions,
  centsToYuan,
  type CreateOrderFormValues,
  formatOrderDateValue,
  formatOrderTimeSlotValue,
  getOrderAmountSummary,
  getOrderCapacityStatus,
  getOrderCustomerHistorySummary,
  getOrderProductLabel,
  getSuggestedLaborCostYuan,
  resolveCreatedCustomerSelection,
  resolveVehicleIdForCustomer,
  toCreateOrderPayload,
  type OrderCustomer
} from "../../../src/features/orders/create-order-form";
import type { PaymentAccountOption, PaymentAccountPayload } from "../../../src/features/orders/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { getStoreWorkbenchHref } from "../../../src/features/workbench/navigation";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import {
  CONSTRUCTION_LOCATION_OPTIONS,
  CONSTRUCTION_TYPE_OPTIONS
} from "../../../src/features/orders/order-display";

type ProductOption = {
  id: string;
  brand: string;
  name: string;
  model: string;
  basePriceCents: number;
};

type NewOrderCustomerFormValues = CreateCustomerFormValues & {
  carPlate?: string;
  vin?: string;
  carModel: string;
  carColor?: string;
  photoUrl?: string;
};

type NewPaymentAccountFormValues = Omit<PaymentAccountPayload, "storeId">;

export default function CreateOrderPage() {
  return (
    <Suspense fallback={<div className="management-page" />}>
      <CreateOrderContent />
    </Suspense>
  );
}

function CreateOrderContent() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const params = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [referrerKeyword, setReferrerKeyword] = useState("");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newPaymentAccountOpen, setNewPaymentAccountOpen] = useState(false);
  const [newOrderCustomerType, setNewOrderCustomerType] = useState("PERSONAL");
  const [laborCostTouched, setLaborCostTouched] = useState(false);
  const [form] = Form.useForm<CreateOrderFormValues>();
  const [newCustomerForm] = Form.useForm<NewOrderCustomerFormValues>();
  const [newPaymentAccountForm] = Form.useForm<NewPaymentAccountFormValues>();
  const initialCustomerId = params.get("customerId") ?? undefined;
  const selectedCustomerId = Form.useWatch("customerId", form) ?? initialCustomerId;
  const selectedVehicleId = Form.useWatch("vehicleId", form);
  const selectedAppointmentDate = Form.useWatch("appointmentDate", form);
  const selectedConstructionLocation = Form.useWatch("constructionLocation", form) ?? "IN_STORE";
  const selectedConstructionType = Form.useWatch("constructionType", form) ?? "PPF";
  const selectedItems = Form.useWatch("items", form);
  const selectedLaborCostYuan = Form.useWatch("laborCostYuan", form);
  const selectedDeposit = Form.useWatch("deposit", form);
  const shouldRecordDeposit = Form.useWatch("shouldRecordDeposit", form);
  const selectedAppointmentDateValue = formatOrderDateValue(selectedAppointmentDate);

  const customersQuery = useQuery({
    queryKey: ["customer-search", storeId, customerKeyword],
    queryFn: () => customerApi.search(storeId!, customerKeyword),
    enabled: Boolean(storeId)
  });

  const referrersQuery = useQuery({
    queryKey: ["order-new-customer-referrer-search", storeId, referrerKeyword],
    queryFn: () => customerApi.search(storeId!, referrerKeyword),
    enabled: Boolean(storeId) && referrerKeyword.length > 0
  });

  const selectedCustomerQuery = useQuery({
    queryKey: ["order-customer-detail", selectedCustomerId],
    queryFn: () => customerApi.detail(selectedCustomerId!),
    enabled: Boolean(selectedCustomerId)
  });

  const productsQuery = useQuery({
    queryKey: ["products-for-order", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, page: 1, pageSize: 100, status: "ACTIVE" }),
    enabled: Boolean(storeId)
  });

  const capacitiesQuery = useQuery({
    queryKey: ["order-capacity", storeId, selectedAppointmentDateValue],
    queryFn: () =>
      constructionApi.capacities({
        storeId: storeId!,
        from: selectedAppointmentDateValue!,
        to: selectedAppointmentDateValue!
      }),
    enabled: Boolean(storeId && selectedAppointmentDateValue)
  });

  const paymentAccountsQuery = useQuery({
    queryKey: ["payment-accounts", storeId],
    queryFn: () => orderApi.paymentAccounts(storeId!),
    enabled: Boolean(storeId)
  });

  const selectedCustomer = selectedCustomerQuery.data as OrderCustomer | undefined;
  const customerOptions = buildOrderCustomerOptions(
    (customersQuery.data ?? []) as OrderCustomer[],
    selectedCustomer
  );
  const referrerOptions = ((referrersQuery.data ?? []) as OrderCustomer[]).map((customer) => ({
    label: customer.companyName ?? customer.name ?? customer.contactPerson ?? "未命名客户",
    value: customer.id
  }));
  const vehicleOptions = buildOrderVehicleOptions(selectedCustomer);
  const productOptions = ((productsQuery.data?.items ?? []) as ProductOption[]).map((product) => ({
    label: getOrderProductLabel(product),
    value: product.id,
    product
  }));
  const selectedCapacity = ((capacitiesQuery.data ?? []) as DailyCapacitySummary[])[0];
  const capacityStatus = selectedAppointmentDate
    ? getOrderCapacityStatus(selectedCapacity, selectedConstructionLocation, selectedConstructionType)
    : undefined;
  const isCapacityBlocking = capacityStatus?.state === "missing" || capacityStatus?.state === "full";
  const paymentAccountOptions = ((paymentAccountsQuery.data ?? []) as PaymentAccountOption[]).map((account) => ({
    label: `${account.name}${account.isDefault ? "（默认）" : ""}`,
    value: account.id
  }));
  const amountSummary = getOrderAmountSummary({
    items: selectedItems,
    laborCostYuan: selectedLaborCostYuan,
    deposit: shouldRecordDeposit ? selectedDeposit : undefined
  });
  const customerHistory = selectedCustomer ? getOrderCustomerHistorySummary(selectedCustomer) : undefined;
  const selectedVehicle = selectedCustomer?.vehicles?.find((vehicle) => vehicle.id === selectedVehicleId);
  const suggestedLaborCostYuan = getSuggestedLaborCostYuan(
    selectedConstructionType,
    selectedConstructionLocation,
    selectedVehicle?.carModel
  );
  const hasLaborCostAdjustment = selectedLaborCostYuan !== undefined && selectedLaborCostYuan !== suggestedLaborCostYuan;

  const createMutation = useMutation({
    mutationFn: (values: CreateOrderFormValues) => {
      if (!storeId) throw new Error("当前账号尚未加入门店");
      return orderApi.create(toCreateOrderPayload(values, storeId));
    },
    onSuccess: (order) => {
      message.success("订单已创建");
      router.push(`/orders/${order.id}`);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (values: NewOrderCustomerFormValues) => {
      if (!storeId) throw new Error("当前账号尚未加入门店");
      const { carPlate, vin, carModel, carColor, photoUrl, ...customerValues } = values;
      const customer = await customerApi.create(toCreateCustomerPayload(storeId, customerValues));
      try {
        await customerApi.createVehicle({
          customerId: customer.id,
          carPlate: trimOptional(carPlate),
          vin: trimOptional(vin),
          carModel: carModel.trim(),
          carColor: trimOptional(carColor),
          photoUrl: trimOptional(photoUrl)
        });
        return { customer, vehicleCreated: true };
      } catch {
        return { customer, vehicleCreated: false };
      }
    },
    onSuccess: async (result) => {
      if (result.vehicleCreated) {
        message.success("客户已创建并回填到订单");
      } else {
        message.warning("客户已创建，但车辆创建失败，请在客户详情继续补车辆");
      }
      setNewCustomerOpen(false);
      setNewOrderCustomerType("PERSONAL");
      newCustomerForm.resetFields();
      setCustomerKeyword("");
      setReferrerKeyword("");
      form.setFieldsValue(resolveCreatedCustomerSelection(result.customer));
      await queryClient.invalidateQueries({ queryKey: ["order-customer-detail", result.customer.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const createPaymentAccountMutation = useMutation({
    mutationFn: (values: NewPaymentAccountFormValues) => {
      if (!storeId) throw new Error("当前账号尚未加入门店");
      return orderApi.createPaymentAccount({
        storeId,
        name: values.name.trim(),
        type: values.type,
        bankName: trimOptional(values.bankName),
        accountNo: trimOptional(values.accountNo),
        isDefault: values.isDefault
      });
    },
    onSuccess: async (account) => {
      message.success("收款账户已创建并选中");
      setNewPaymentAccountOpen(false);
      newPaymentAccountForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["payment-accounts", storeId] });
      form.setFieldValue(["deposit", "accountId"], account.id);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const saveDraft = () => {
    localStorage.setItem("mallbay-create-order-draft", JSON.stringify({
      savedAt: new Date().toISOString(),
      values: form.getFieldsValue(true)
    }));
    message.success("订单草稿已保存在本机");
  };

  const defaultItems = useMemo(() => [{ quantity: 1 }], []);

  const closeNewCustomerDrawer = () => {
    if (createCustomerMutation.isPending) return;
    setNewCustomerOpen(false);
    setNewOrderCustomerType("PERSONAL");
    setReferrerKeyword("");
    newCustomerForm.resetFields();
  };

  const closeNewPaymentAccountDrawer = () => {
    if (createPaymentAccountMutation.isPending) return;
    setNewPaymentAccountOpen(false);
    newPaymentAccountForm.resetFields();
  };

  useEffect(() => {
    if (!selectedCustomer) return;

    if (form.getFieldValue("customerId") !== selectedCustomer.id) {
      form.setFieldValue("customerId", selectedCustomer.id);
    }

    const nextVehicleId = resolveVehicleIdForCustomer(
      selectedCustomer,
      form.getFieldValue("vehicleId")
    );
    if (form.getFieldValue("vehicleId") !== nextVehicleId) {
      form.setFieldValue("vehicleId", nextVehicleId);
    }
  }, [form, selectedCustomer]);

  useEffect(() => {
    if (laborCostTouched) return;
    form.setFieldValue("laborCostYuan", suggestedLaborCostYuan);
  }, [form, laborCostTouched, suggestedLaborCostYuan]);

  return (
    <>
      <div className="management-page">
          <StorePageHeader title="新建订单" description="选择客户、产品、施工方式并录入费用">
            <Space className="create-order-header-actions" wrap>
              <Button disabled={!storeId} onClick={() => storeId && router.push(getStoreWorkbenchHref(storeId))}>
                取消
              </Button>
              <Button onClick={saveDraft}>
                保存草稿
              </Button>
              <Button
                type="primary"
                loading={createMutation.isPending}
                disabled={Boolean(selectedAppointmentDate && (capacitiesQuery.isLoading || isCapacityBlocking))}
                onClick={() => form.submit()}
              >
                提交订单
              </Button>
            </Space>
          </StorePageHeader>

          <Form
            form={form}
            layout="vertical"
          initialValues={{
            customerId: initialCustomerId,
            constructionType: "PPF",
            constructionLocation: "IN_STORE",
            laborCostYuan: 0,
            shouldRecordDeposit: false,
            items: defaultItems
          }}
          onFinish={(values) => createMutation.mutate({ ...values, suggestedLaborCostYuan })}
        >
          <div className="create-order-layout">
            <div className="create-order-main">
              <Card title={<OrderStepTitle step={1} title="客户与车辆" />} className="create-order-card">
                <div className="create-order-customer-row">
                  <Form.Item name="customerId" label="客户" rules={[{ required: true, message: "请选择客户" }]}>
                    <Select
                      showSearch
                      filterOption={false}
                      onSearch={setCustomerKeyword}
                      onChange={() => {
                        form.setFieldValue("vehicleId", undefined);
                        setCustomerKeyword("");
                      }}
                      options={customerOptions}
                      placeholder="输入姓名、企业、手机号、车牌或 VIN 搜索"
                    />
                  </Form.Item>
                  <Form.Item label=" ">
                    <Button icon={<PlusOutlined />} disabled={!storeId} onClick={() => setNewCustomerOpen(true)}>
                      新建客户
                    </Button>
                  </Form.Item>
                </div>

                <Form.Item name="vehicleId" label="车辆">
                  <Select
                    allowClear
                    disabled={!selectedCustomer}
                    loading={selectedCustomerQuery.isLoading}
                    options={vehicleOptions}
                    placeholder={selectedCustomer ? "选择客户车辆" : "请先选择客户"}
                  />
                </Form.Item>
              </Card>

              <Card title={<OrderStepTitle step={2} title="施工预约" />} className="create-order-card">
                <div className="create-order-field-grid">
                  <Form.Item name="constructionType" label="施工类型" rules={[{ required: true }]}>
                    <Select options={CONSTRUCTION_TYPE_OPTIONS} />
                  </Form.Item>
                  <Form.Item name="constructionLocation" label="施工地点" rules={[{ required: true }]}>
                    <Select options={CONSTRUCTION_LOCATION_OPTIONS} />
                  </Form.Item>
                  <Form.Item
                    name="appointmentDate"
                    label="预约日期"
                    getValueProps={(value?: string) => ({ value: value ? dayjs(value) : undefined })}
                    normalize={formatOrderDateValue}
                  >
                    <DatePicker className="w-full" format="YYYY-MM-DD" placeholder="选择预约日期" />
                  </Form.Item>
                  <Form.Item
                    name="appointmentTimeSlot"
                    label="预约时段"
                    getValueProps={(value?: string) => ({ value: toOrderTimeRangePickerValue(value) })}
                    normalize={formatOrderTimeSlotValue}
                  >
                    <TimePicker.RangePicker
                      className="w-full"
                      format="HH:mm"
                      minuteStep={30}
                      placeholder={["开始时间", "结束时间"]}
                    />
                  </Form.Item>
                  <Form.Item name="constructionAddress" label="外出地址" className="create-order-field-wide">
                    <Input />
                  </Form.Item>
                </div>

                {selectedAppointmentDateValue ? (
                  <Alert
                    className="mt-1"
                    type={capacityStatus?.state === "available" ? "success" : "warning"}
                    showIcon
                    message={capacityStatus?.message ?? "正在检查施工容量..."}
                    action={
                      capacityStatus?.state === "missing" || capacityStatus?.state === "full" ? (
                        <Button size="small" onClick={() => router.push(getConstructionCapacityHref(selectedAppointmentDateValue))}>
                          去设置施工容量
                        </Button>
                      ) : undefined
                    }
                  />
                ) : null}
              </Card>

              <Card title={<OrderStepTitle step={3} title="产品明细" />} className="create-order-card">
                <Form.List name="items">
                  {(fields, { add, remove }) => (
                    <>
                      {fields.map(({ key, ...field }) => (
                        <div key={key} className="create-order-product-row">
                          <Form.Item
                            {...field}
                            name={[field.name, "productId"]}
                            label="产品"
                            rules={[{ required: true, message: "请选择产品" }]}
                          >
                            <Select
                              options={productOptions}
                              placeholder="产品"
                              onChange={(productId) => {
                                const product = productOptions.find((item) => item.value === productId)?.product;
                                if (!product) return;
                                const items = form.getFieldValue("items") as Array<Record<string, unknown>>;
                                items[field.name] = {
                                  ...items[field.name],
                                  unitPriceYuan: centsToYuan(product.basePriceCents)
                                };
                                form.setFieldValue("items", items);
                              }}
                            />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, "quantity"]} label="数量">
                            <InputNumber min={1} placeholder="数量" className="w-full" />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, "unitPriceYuan"]} label="单价（元）">
                            <InputNumber min={0} precision={2} placeholder="单价（元）" className="w-full" />
                          </Form.Item>
                          <Form.Item label=" ">
                            <Button icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                          </Form.Item>
                        </div>
                      ))}
                      <Button icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>
                        添加产品
                      </Button>
                    </>
                  )}
                </Form.List>

                <Form.Item label="施工人工费（元）" className="mt-4">
                  <Space.Compact className="w-full">
                    <Form.Item name="laborCostYuan" noStyle>
                      <InputNumber
                        className="!w-full"
                        min={0}
                        precision={2}
                        onChange={() => setLaborCostTouched(true)}
                      />
                    </Form.Item>
                    <Button
                      onClick={() => {
                        form.setFieldValue("laborCostYuan", suggestedLaborCostYuan);
                        form.setFieldValue("laborCostAdjustmentReason", undefined);
                        setLaborCostTouched(false);
                      }}
                    >
                      使用建议 ¥{suggestedLaborCostYuan.toFixed(2)}
                    </Button>
                  </Space.Compact>
                </Form.Item>
                {hasLaborCostAdjustment ? (
                  <Form.Item
                    name="laborCostAdjustmentReason"
                    label="人工费调整原因"
                    extra={`建议人工费 ¥${suggestedLaborCostYuan.toFixed(2)}，最终人工费 ¥${(selectedLaborCostYuan ?? 0).toFixed(2)}`}
                    rules={[{ required: true, whitespace: true, message: "调整施工人工费必须填写原因" }]}
                  >
                    <Input.TextArea rows={2} placeholder="说明为什么调整施工人工费，例如车型复杂、外出距离、追加施工项目等" />
                  </Form.Item>
                ) : null}
              </Card>

              <Card title={<OrderStepTitle step={4} title="收款与备注" />} className="create-order-card">
                <Form.Item name="shouldRecordDeposit" label="录入定金" valuePropName="checked">
                  <Switch />
                </Form.Item>
                {shouldRecordDeposit ? (
                  <>
                    {!paymentAccountsQuery.isLoading && paymentAccountOptions.length === 0 ? (
                      <Alert
                        className="mb-3"
                        type="warning"
                        showIcon
                        title="无可用收款账户"
                        description="请先到财务管理维护收款账户，再返回创建订单录入定金。"
                        action={
                          <Space>
                            <Button size="small" onClick={() => setNewPaymentAccountOpen(true)}>
                              新增收款账户
                            </Button>
                            <Button href="/finance" size="small">
                              去财务管理
                            </Button>
                          </Space>
                        }
                      />
                    ) : null}
                    <div className="create-order-field-grid">
                      <Form.Item
                        name={["deposit", "accountId"]}
                        label="收款账户"
                        rules={[{ required: true, message: "请选择收款账户" }]}
                      >
                        <Select
                          loading={paymentAccountsQuery.isLoading}
                          options={paymentAccountOptions}
                          placeholder="选择收款账户"
                          popupRender={(menu) => (
                            <>
                              {menu}
                              <div className="create-order-select-extra">
                                <Button type="link" icon={<PlusOutlined />} onClick={() => setNewPaymentAccountOpen(true)}>
                                  新增收款账户
                                </Button>
                              </div>
                            </>
                          )}
                        />
                      </Form.Item>
                      <Form.Item
                        name={["deposit", "amountYuan"]}
                        label="定金金额（元）"
                        rules={[{ required: true, message: "请输入定金金额" }]}
                      >
                        <InputNumber min={0.01} precision={2} placeholder="定金金额" className="w-full" />
                      </Form.Item>
                      <Form.Item
                        name={["deposit", "paymentType"]}
                        label="收款类型"
                        rules={[{ required: true, message: "请选择收款类型" }]}
                      >
                        <Select
                          options={[
                            { label: "定金", value: "DEPOSIT" },
                            { label: "全款", value: "FULL" },
                            { label: "尾款", value: "BALANCE" }
                          ]}
                          placeholder="收款类型"
                        />
                      </Form.Item>
                      <Form.Item
                        name={["deposit", "paidAt"]}
                        label="收款日期"
                        rules={[{ required: true, message: "请选择收款日期" }]}
                        getValueProps={(value?: string) => ({ value: value ? dayjs(value) : undefined })}
                        normalize={formatOrderDateValue}
                      >
                        <DatePicker className="w-full" format="YYYY-MM-DD" placeholder="选择收款日期" />
                      </Form.Item>
                    </div>
                  </>
                ) : null}

                <Form.Item name="remark" label="备注">
                  <Input.TextArea rows={4} />
                </Form.Item>
              </Card>
            </div>

            <aside className="create-order-aside">
              <div className="create-order-history-panel-slot">
                <CustomerHistoryPanel customerHistory={customerHistory} />
              </div>
              <Card title="订单金额汇总" className="create-order-summary-card">
                <div className="create-order-summary-row">
                  <span>产品费用</span>
                  <strong>¥{amountSummary.productAmountYuan.toFixed(2)}</strong>
                </div>
                <div className="create-order-summary-row">
                  <span>施工人工费</span>
                  <strong>¥{amountSummary.laborCostYuan.toFixed(2)}</strong>
                </div>
                <div className="create-order-summary-row create-order-summary-total">
                  <span>订单总额</span>
                  <strong>¥{amountSummary.totalAmountYuan.toFixed(2)}</strong>
                </div>
                <div className="create-order-summary-row">
                  <span>已收定金</span>
                  <strong>¥{amountSummary.depositAmountYuan.toFixed(2)}</strong>
                </div>
                <div className="create-order-summary-row">
                  <span>待收金额</span>
                  <strong>¥{amountSummary.outstandingAmountYuan.toFixed(2)}</strong>
                </div>
              </Card>
            </aside>
          </div>
        </Form>

        <Drawer
          className="create-order-customer-drawer"
          open={newCustomerOpen}
          title="新建客户并回填订单"
          onClose={closeNewCustomerDrawer}
          destroyOnHidden
          footer={
            <div className="create-order-drawer-footer">
              <Button onClick={closeNewCustomerDrawer}>取消</Button>
              <Button type="primary" loading={createCustomerMutation.isPending} onClick={() => newCustomerForm.submit()}>
                创建并使用
              </Button>
            </div>
          }
        >
          <Form<NewOrderCustomerFormValues>
            form={newCustomerForm}
            layout="vertical"
            className="create-order-drawer-form"
            initialValues={{ customerType: "PERSONAL", sourceType: "OFFLINE_STORE" }}
            onValuesChange={(changedValues) => {
              if ("customerType" in changedValues) {
                setNewOrderCustomerType(changedValues.customerType ?? "PERSONAL");
              }
            }}
            onFinish={(values) => createCustomerMutation.mutate(values)}
          >
            <Form.Item name="customerType" label="客户类型" rules={[{ required: true, message: "请选择客户类型" }]}>
              <Select
                options={[
                  { label: "个人客户", value: "PERSONAL" },
                  { label: "企业客户", value: "COMPANY" }
                ]}
              />
            </Form.Item>

            {newOrderCustomerType === "COMPANY" ? (
              <>
                <Form.Item
                  name="companyName"
                  label="企业名称"
                  rules={[{ required: true, whitespace: true, message: "请输入企业名称" }]}
                >
                  <Input maxLength={100} />
                </Form.Item>
                <Form.Item
                  name="contactPerson"
                  label="联系人"
                  rules={[{ required: true, whitespace: true, message: "请输入联系人" }]}
                >
                  <Input maxLength={50} />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item
                  name="name"
                  label="客户姓名"
                  rules={[{ required: true, whitespace: true, message: "请输入客户姓名" }]}
                >
                  <Input maxLength={50} />
                </Form.Item>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Form.Item name="gender" label="性别">
                    <Select
                      allowClear
                      options={[
                        { label: "男", value: "MALE" },
                        { label: "女", value: "FEMALE" },
                        { label: "未知", value: "UNKNOWN" }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="birthday" label="生日">
                    <BirthdaySelector />
                  </Form.Item>
                </div>
              </>
            )}

            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                { required: true, message: "请输入手机号" },
                { pattern: /^1\d{10}$/, message: "请输入 11 位手机号" }
              ]}
            >
              <Input maxLength={11} />
            </Form.Item>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Form.Item name="wechat" label="微信号">
                <Input maxLength={50} />
              </Form.Item>
              <Form.Item name="sourceType" label="客户来源">
                <Select
                  allowClear
                  options={[
                    { label: "到店", value: "OFFLINE_STORE" },
                    { label: "抖音", value: "ONLINE_DOUYIN" },
                    { label: "小红书", value: "ONLINE_XIAOHONGSHU" },
                    { label: "快手", value: "ONLINE_KUAISHOU" },
                    { label: "转介绍", value: "REFERRAL" },
                    { label: "合作方", value: "PARTNER" },
                    { label: "其他", value: "OTHER" }
                  ]}
                />
              </Form.Item>
            </div>

            <Form.Item name="sourceDetail" label="来源说明">
              <Input maxLength={100} />
            </Form.Item>

            <Form.Item name="referrerId" label="介绍人">
              <Select
                allowClear
                showSearch
                filterOption={false}
                onSearch={setReferrerKeyword}
                options={referrerOptions}
                placeholder="可搜索老客户作为介绍人"
              />
            </Form.Item>

            <Typography.Title level={5}>车辆信息</Typography.Title>
            <Form.Item
              name="carModel"
              label="车型"
              rules={[{ required: true, whitespace: true, message: "请输入车型" }]}
            >
              <Input maxLength={80} placeholder="例如：宝马 5 系" />
            </Form.Item>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Form.Item name="carPlate" label="车牌号">
                <Input maxLength={20} placeholder="湘A12345" />
              </Form.Item>
              <Form.Item name="vin" label="VIN">
                <Input maxLength={17} placeholder="17 位车架号" />
              </Form.Item>
              <Form.Item name="carColor" label="颜色">
                <Input maxLength={30} />
              </Form.Item>
            </div>
            <Form.Item name="photoUrl" label="车辆照片">
              <Input maxLength={500} placeholder="车辆照片链接，可稍后在客户档案补充" />
            </Form.Item>
          </Form>
        </Drawer>

        <Drawer
          className="create-order-payment-account-drawer"
          open={newPaymentAccountOpen}
          title="新增收款账户"
          onClose={closeNewPaymentAccountDrawer}
          destroyOnHidden
          footer={
            <div className="create-order-drawer-footer">
              <Button onClick={closeNewPaymentAccountDrawer}>取消</Button>
              <Button type="primary" loading={createPaymentAccountMutation.isPending} onClick={() => newPaymentAccountForm.submit()}>
                创建并使用
              </Button>
            </div>
          }
        >
          <Form<NewPaymentAccountFormValues>
            form={newPaymentAccountForm}
            layout="vertical"
            className="create-order-drawer-form"
            initialValues={{ type: "CORPORATE", isDefault: paymentAccountOptions.length === 0 }}
            onFinish={(values) => createPaymentAccountMutation.mutate(values)}
          >
            <Form.Item
              name="name"
              label="账户名称"
              rules={[{ required: true, whitespace: true, message: "请输入账户名称" }]}
            >
              <Input maxLength={60} placeholder="例如：门店对公账户" />
            </Form.Item>
            <Form.Item name="type" label="账户类型" rules={[{ required: true, message: "请选择账户类型" }]}>
              <Select
                options={[
                  { label: "对公账户", value: "CORPORATE" },
                  { label: "个人账户", value: "PERSONAL" },
                  { label: "微信", value: "WECHAT" },
                  { label: "支付宝", value: "ALIPAY" },
                  { label: "其他", value: "OTHER" }
                ]}
              />
            </Form.Item>
            <Form.Item name="bankName" label="开户行/平台">
              <Input maxLength={80} placeholder="例如：中国银行长沙分行" />
            </Form.Item>
            <Form.Item name="accountNo" label="账号">
              <Input maxLength={80} placeholder="银行卡号、微信或支付宝账号" />
            </Form.Item>
            <Form.Item name="isDefault" label="设为默认账户" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>
        </Drawer>
        </div>
    </>
  );
}

function OrderStepTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="create-order-step-title">
      <span className="create-order-step-index">{step}</span>
      <span>{title}</span>
    </div>
  );
}

function CustomerHistoryPanel({
  customerHistory
}: {
  customerHistory?: ReturnType<typeof getOrderCustomerHistorySummary>;
}) {
  return (
    <Card title="客户历史记录" className="create-order-history-panel">
      {customerHistory ? (
        <>
          {customerHistory.warning ? (
            <Alert className="mb-3" type="warning" showIcon title={customerHistory.warning} />
          ) : null}
          <div className="create-order-history-metrics">
            <div>
              <span>历史订单</span>
              <strong>{customerHistory.orderCount} 单</strong>
            </div>
            <div>
              <span>客户车辆</span>
              <strong>{customerHistory.vehicleCount} 台</strong>
            </div>
            <div>
              <span>累计消费</span>
              <strong>¥{customerHistory.totalAmountYuan.toFixed(2)}</strong>
            </div>
            <div>
              <span>待收金额</span>
              <strong>¥{customerHistory.outstandingAmountYuan.toFixed(2)}</strong>
            </div>
          </div>
          <div className="create-order-history-section">
            <Typography.Text strong>质保与售后</Typography.Text>
            <div className="create-order-history-line">
              有效质保 {customerHistory.activeWarrantyCount} 个，待处理售后 {customerHistory.openAfterSalesCount} 个
            </div>
          </div>
          {customerHistory.tags.length > 0 ? (
            <div className="create-order-history-tags">
              {customerHistory.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </div>
          ) : null}
          <div className="create-order-history-section">
            <Typography.Text strong>最近订单：</Typography.Text>
            {customerHistory.latestOrder ? (
              <div className="create-order-history-line">
                {customerHistory.latestOrder.orderNo} / {customerHistory.latestOrder.status} /{" "}
                {customerHistory.latestOrder.vehicleLabel} / ¥{customerHistory.latestOrder.amountYuan.toFixed(2)}
              </div>
            ) : (
              <Typography.Text type="secondary">暂无历史订单</Typography.Text>
            )}
          </div>
          {customerHistory.recentConstructionRecords.length > 0 ? (
            <div className="create-order-history-section">
              <Typography.Text strong>最近施工记录</Typography.Text>
              <Space className="mt-2 w-full" direction="vertical" size={6}>
                {customerHistory.recentConstructionRecords.map((record) => (
                  <div
                    key={`${record.orderNo}-${record.completedAt ?? "pending"}`}
                    className="create-order-history-line"
                  >
                    {record.orderNo} / {record.vehicleLabel} / {record.constructionType} / {record.status} /{" "}
                    {record.qualityResult} / 用时 {record.actualMinutes ?? "-"} 分钟
                  </div>
                ))}
              </Space>
            </div>
          ) : null}
        </>
      ) : (
        <div className="create-order-history-empty">
          <Typography.Text type="secondary">选择客户后显示历史订单、质保与售后提醒。</Typography.Text>
        </div>
      )}
    </Card>
  );
}

function trimOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getConstructionCapacityHref(appointmentDate?: string) {
  const params = new URLSearchParams({ returnTo: "/orders/create" });
  if (appointmentDate) {
    params.set("date", appointmentDate);
  }
  return `/construction/capacities?${params.toString()}`;
}

function toOrderTimeRangePickerValue(value?: string) {
  const match = value?.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!match) return undefined;

  return [
    toTimePickerValue(Number(match[1]), Number(match[2])),
    toTimePickerValue(Number(match[3]), Number(match[4]))
  ];
}

function toTimePickerValue(hour: number, minute: number) {
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0);
}

type BirthdaySelectorProps = {
  value?: string;
  onChange?: (value?: string) => void;
};

type BirthdayParts = {
  year?: number;
  month?: number;
  day?: number;
};

function BirthdaySelector({ value, onChange }: BirthdaySelectorProps) {
  return <BirthdaySelectorFields key={value ?? "empty"} initialValue={value} onChange={onChange} />;
}

function BirthdaySelectorFields({
  initialValue,
  onChange
}: {
  initialValue?: string;
  onChange?: (value?: string) => void;
}) {
  const [parts, setParts] = useState<BirthdayParts>(() => parseBirthday(initialValue));
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 101 }, (_, index) => {
      const year = currentYear - index;
      return { label: `${year} 年`, value: year };
    });
  }, []);
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({ label: `${index + 1} 月`, value: index + 1 })),
    []
  );
  const dayOptions = useMemo(() => {
    const maxDay = getDaysInMonth(parts.year, parts.month);
    return Array.from({ length: maxDay }, (_, index) => ({ label: `${index + 1} 日`, value: index + 1 }));
  }, [parts.month, parts.year]);

  const updatePart = (key: keyof BirthdayParts, nextValue?: number) => {
    const nextParts = { ...parts, [key]: nextValue };
    const maxDay = getDaysInMonth(nextParts.year, nextParts.month);
    if (nextParts.day && nextParts.day > maxDay) {
      nextParts.day = maxDay;
    }
    setParts(nextParts);

    if (nextParts.year && nextParts.month && nextParts.day) {
      onChange?.(formatBirthday(nextParts.year, nextParts.month, nextParts.day));
      return;
    }

    if (initialValue) {
      onChange?.(undefined);
    }
  };

  return (
    <Space.Compact className="w-full">
      <Select
        allowClear
        className="!w-[42%]"
        options={yearOptions}
        placeholder="年份"
        value={parts.year}
        onChange={(nextValue) => updatePart("year", nextValue)}
      />
      <Select
        allowClear
        className="!w-[29%]"
        options={monthOptions}
        placeholder="月份"
        value={parts.month}
        onChange={(nextValue) => updatePart("month", nextValue)}
      />
      <Select
        allowClear
        className="!w-[29%]"
        options={dayOptions}
        placeholder="日期"
        value={parts.day}
        onChange={(nextValue) => updatePart("day", nextValue)}
      />
    </Space.Compact>
  );
}

function parseBirthday(value?: string): BirthdayParts {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return {};
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function getDaysInMonth(year?: number, month?: number) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function formatBirthday(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
