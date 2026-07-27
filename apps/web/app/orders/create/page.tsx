"use client";

import type { DailyCapacitySummary, ProductUnit } from "@mallbay/shared";
import { Alert, App, Button, Card, DatePicker, Drawer, Form, Input, InputNumber, Radio, Select, Space, Switch, Tag, TimePicker, Typography } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { constructionApi, customerApi, orderApi, pricingApi, productApi } from "../../../src/lib/api";
import type { CreateCustomerFormValues } from "../../../src/features/customers/create-customer-form";
import { toCreateCustomerPayload } from "../../../src/features/customers/create-customer-form";
import {
  buildOrderCustomerOptions,
  buildOrderVehicleOptions,
  centsToYuan,
  yuanToCents,
  type CreateOrderFormValues,
  formatOrderDateValue,
  formatOrderTimeSlotValue,
  getOrderAmountSummary,
  getOrderCapacityStatus,
  getOrderCustomerHistorySummary,
  getOrderProductLabel,
  resolveCreatedCustomerSelection,
  resolveVehicleIdForCustomer,
  toCreateOrderPayload,
  type OrderCustomer
} from "../../../src/features/orders/create-order-form";
import type { PaymentAccountOption, PaymentAccountPayload } from "../../../src/features/orders/api";
import type { PricingCalculationResponse } from "../../../src/features/pricing/api";
import { salesQuoteApi } from "../../../src/features/sales-quotes/api";
import { dictionaryApi } from "../../../src/features/settings/api";
import { storeApi } from "../../../src/features/stores/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { getStoreWorkbenchHref } from "../../../src/features/workbench/navigation";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import {
  CONSTRUCTION_LOCATION_OPTIONS,
  CONSTRUCTION_TYPE_OPTIONS
} from "../../../src/features/orders/order-display";
import { getProductUnitLabel } from "../../../src/features/products/display";
import {
  loadCreateOrderDraft,
  removeCreateOrderDraft,
  saveCreateOrderDraft,
  type CreateOrderDraft
} from "../../../src/features/orders/create-order-draft";

type ProductOption = {
  id: string;
  brand: string;
  name: string;
  model: string;
  category: string;
  basePriceCents: number;
  unit?: ProductUnit | null;
  salesUnit?: ProductUnit | null;
  inventoryUnit?: ProductUnit | null;
  metersPerRoll?: number | null;
  quantityPrecision?: number;
  unitSuggestedPrices?: Array<{
    salesUnit: ProductUnit;
    suggestedPriceCents: number;
    isActive: boolean;
  }>;
};

type NewOrderCustomerFormValues = CreateCustomerFormValues;

type NewPaymentAccountFormValues = Omit<PaymentAccountPayload, "storeId">;

type ProductSelectOption = {
  label: string;
  value: string;
  product: ProductOption;
};

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
  const canAssignSalesPerson = user?.storeMember?.position === "MANAGER";
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [referrerKeyword, setReferrerKeyword] = useState("");
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newPaymentAccountOpen, setNewPaymentAccountOpen] = useState(false);
  const [serverPricing, setServerPricing] = useState<PricingCalculationResponse | null>(null);
  const [draftPricingChoiceOpen, setDraftPricingChoiceOpen] = useState(false);
  const [copySource, setCopySource] = useState<CreateOrderDraft["copySource"] | null>(null);
  const [newOrderCustomerType, setNewOrderCustomerType] = useState("PERSONAL");
  const constructionChargeTouchedRef = useRef(false);
  const draftRestoredRef = useRef(false);
  const draftPricingPendingRef = useRef(false);
  const [form] = Form.useForm<CreateOrderFormValues>();
  const [newCustomerForm] = Form.useForm<NewOrderCustomerFormValues>();
  const [newPaymentAccountForm] = Form.useForm<NewPaymentAccountFormValues>();
  const initialCustomerId = params.get("customerId") ?? undefined;
  const selectedCustomerId = Form.useWatch("customerId", form) ?? initialCustomerId;
  const selectedVehicleId = Form.useWatch("vehicleId", form);
  const selectedVehicleTypeCode = Form.useWatch("vehicleTypeCode", form);
  const selectedAppointmentDate = Form.useWatch("appointmentDate", form);
  const selectedConstructionLocation = Form.useWatch("constructionLocation", form) ?? "IN_STORE";
  const selectedConstructionType = Form.useWatch("constructionType", form) ?? "PPF";
  const selectedItems = Form.useWatch("items", form);
  const selectedConstructionChargeYuan = Form.useWatch("constructionChargeYuan", form);
  const selectedSuggestedConstructionChargeYuan = Form.useWatch("suggestedConstructionChargeYuan", form);
  const selectedConstructionChargeMode = Form.useWatch("constructionChargeMode", form) ?? "MANUAL";
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

  const orderContextQuery = useQuery({
    queryKey: ["order-customer-context", selectedCustomerId, selectedVehicleId],
    queryFn: () => customerApi.orderContext(selectedCustomerId!, selectedVehicleId),
    enabled: Boolean(selectedCustomerId && selectedVehicleId)
  });

  const productsQuery = useQuery({
    queryKey: ["products-for-order", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, page: 1, pageSize: 100, status: "ACTIVE" }),
    enabled: Boolean(storeId)
  });

  const pricingRuleSetsQuery = useQuery({
    queryKey: ["pricing-rule-sets-for-order", storeId],
    queryFn: () => pricingApi.ruleSets(storeId!),
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

  const storeMembersQuery = useQuery({
    queryKey: ["order-sales-members", storeId],
    queryFn: () => storeApi.myStore(storeId!),
    enabled: Boolean(storeId)
  });

  const searchedCustomers = (customersQuery.data ?? []) as OrderCustomer[];
  // 客户详情请求尚未返回或偶发失败时，先使用搜索结果中的客户和车辆，不能把
  // 已选客户误判为“未选择”。详情返回后会自动补齐全部车辆与历史信息。
  const selectedCustomer = (selectedCustomerQuery.data as OrderCustomer | undefined)
    ?? searchedCustomers.find((customer) => customer.id === selectedCustomerId);
  const customerOptions = buildOrderCustomerOptions(
    searchedCustomers,
    selectedCustomer
  );
  const referrerOptions = ((referrersQuery.data ?? []) as OrderCustomer[]).map((customer) => ({
    label: customer.companyName ?? customer.name ?? customer.contactPerson ?? "未命名客户",
    value: customer.id
  }));
  const vehicleOptions = buildOrderVehicleOptions(selectedCustomer);
  const salesPersonOptions = useMemo(() => {
    const eligible = (storeMembersQuery.data?.members ?? [])
      .filter((member) => ["MANAGER", "SALES", "CUSTOMER_SERVICE"].includes(member.position))
      .map((member) => ({
        value: member.user.id,
        label: member.user.nickname ?? member.user.username
      }));
    if (user?.id && !eligible.some((option) => option.value === user.id)) {
      eligible.unshift({ value: user.id, label: user.nickname ?? user.username ?? "当前登录人" });
    }
    return eligible;
  }, [storeMembersQuery.data?.members, user?.id, user?.nickname, user?.username]);
  const productOptions = ((productsQuery.data?.items ?? []) as ProductOption[]).map((product) => ({
    label: `${getOrderProductLabel(product)}（销售单位：${getProductUnitLabel(resolveProductSalesUnit(product))}）`,
    value: product.id,
    product
  }));
  const selectedVehicle = selectedCustomer?.vehicles?.find((vehicle) => vehicle.id === selectedVehicleId);
  const vehicleTypesQuery = useQuery({
    queryKey: ["system-dictionary", storeId, "VEHICLE_TYPE"],
    queryFn: () => dictionaryApi.list(storeId!),
    enabled: Boolean(storeId),
    staleTime: 60_000
  });
  const vehicleTypeOptions = useMemo(() => {
    const dictionary = vehicleTypesQuery.data?.find((item) => item.code === "VEHICLE_TYPE");
    return (dictionary?.dictionaryItems ?? [])
      .filter((item) => item.status === "ACTIVE")
      .map((item) => ({ value: item.code, label: item.name }));
  }, [vehicleTypesQuery.data]);
  // 施工收费只能由服务端根据当前发布的施工标准试算；页面不能再用车型/施工类别
  // 的本地默认值冒充“系统建议”，否则收费和成本会落到不同口径。
  const systemSuggestedConstructionChargeYuan = serverPricing?.constructionChargeAvailable
    ? centsToYuan(serverPricing.calculation.suggestedLaborCostCents)
    : undefined;
  const constructionChargeHint = systemSuggestedConstructionChargeYuan === undefined
    ? (serverPricing?.constructionChargeReason ?? "等待服务端按已发布施工标准试算；未匹配标准时不会生成建议收费")
    : `服务端建议 ¥${systemSuggestedConstructionChargeYuan.toFixed(2)}，由已发布施工标准计算，不可直接修改`;
  const now = Date.now();
  const publishedRuleSet = pricingRuleSetsQuery.data?.find((item) => {
    const starts = new Date(item.effectiveFrom).getTime() <= now;
    const ends = !item.effectiveTo || new Date(item.effectiveTo).getTime() > now;
    return item.status === "PUBLISHED" && starts && ends;
  });
  useEffect(() => {
    if (user?.id && !form.getFieldValue("salesPersonId")) {
      form.setFieldValue("salesPersonId", user.id);
    }
  }, [form, user?.id]);

  useEffect(() => {
    if (!selectedVehicleId) {
      form.setFieldValue("vehicleTypeCode", undefined);
      return;
    }
    if (selectedVehicle?.vehicleTypeCode) {
      form.setFieldValue("vehicleTypeCode", selectedVehicle.vehicleTypeCode);
    }
  }, [form, selectedVehicle?.vehicleTypeCode, selectedVehicleId]);

  const pricingInput = useMemo(() => {
    if (!storeId || !publishedRuleSet || !selectedItems?.length) return undefined;
    const lines = selectedItems.map((item, index) => {
      const product = productOptions.find((option) => option.value === item?.productId)?.product;
      if (!product || !item?.quantity) return undefined;
      return {
        id: `order-line-${index}`,
        productId: product.id,
        category: product.category,
        brand: product.brand,
        model: product.model,
        salesUnit: item.salesUnit ?? resolveProductSalesUnit(product),
        quantity: Number(item.quantity),
        baseUnitPriceCents: getDefaultUnitPriceCents(product, item.salesUnit ?? resolveProductSalesUnit(product))
      };
    });
    if (lines.some((line) => !line)) return undefined;
    return {
      storeId,
      ruleSetId: publishedRuleSet.id,
      input: {
        ruleSetVersion: publishedRuleSet.version,
        vehicleId: selectedVehicleId || undefined,
        vehicleTypeCode: selectedVehicleTypeCode || undefined,
        constructionType: selectedConstructionType,
        constructionLocation: selectedConstructionLocation,
        effectiveAt: new Date().toISOString(),
        // 已发布规则集会在服务端解析施工标准。这里不再提交页面默认施工收费。
        baseLaborCostCents: 0,
        lines: lines as NonNullable<typeof lines[number]>[]
      }
    };
  }, [productsQuery.data?.items, publishedRuleSet, selectedConstructionLocation, selectedConstructionType, selectedItems, selectedVehicleId, selectedVehicleTypeCode, storeId]);

  const pricingCalculationMutation = useMutation({
    mutationFn: () => {
      if (!pricingInput) throw new Error("请先选择完整的产品明细");
      return pricingApi.calculate(pricingInput);
    },
    onSuccess: (result) => {
      setServerPricing(result);
      form.setFieldValue("pricingCalculationId", result.pricingCalculationId ?? undefined);
      const suggestedConstructionCharge = result.constructionChargeAvailable
        ? centsToYuan(result.calculation.suggestedLaborCostCents)
        : undefined;
      form.setFieldValue("suggestedConstructionChargeYuan", suggestedConstructionCharge);
      if (!constructionChargeTouchedRef.current) {
        form.setFieldValue("constructionChargeYuan", suggestedConstructionCharge);
        form.setFieldValue("constructionChargeMode", "SUGGESTED");
      }
    },
    onError: (error: Error) => message.error(`价格试算失败：${error.message}`)
  });

  useEffect(() => {
    if (params.get("draft") === "local" && !draftRestoredRef.current) return;
    if (draftPricingPendingRef.current) return;
    if (!pricingInput) {
      setServerPricing(null);
      form.setFieldValue("pricingCalculationId", undefined);
      return;
    }
    const timer = window.setTimeout(() => pricingCalculationMutation.mutate(), 350);
    return () => window.clearTimeout(timer);
  }, [form, params, pricingInput]);

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
    constructionChargeYuan: selectedConstructionChargeYuan,
    deposit: shouldRecordDeposit ? selectedDeposit : undefined
  });
  const customerHistory = selectedCustomer ? getOrderCustomerHistorySummary(selectedCustomer) : undefined;
  const suggestedConstructionChargeYuan = selectedSuggestedConstructionChargeYuan ?? systemSuggestedConstructionChargeYuan;
  const hasConstructionChargeAdjustment = suggestedConstructionChargeYuan !== undefined && selectedConstructionChargeYuan !== undefined && selectedConstructionChargeYuan !== suggestedConstructionChargeYuan;

  const createQuoteMutation = useMutation({
    mutationFn: (values: CreateOrderFormValues) => {
      if (!storeId || !values.pricingCalculationId) throw new Error("缺少价格试算快照，请先重新试算");
      return salesQuoteApi.create({
        storeId,
        customerId: values.customerId,
        vehicleId: values.vehicleId,
        appointmentDate: formatOrderDateValue(values.appointmentDate),
        appointmentTimeSlot: formatOrderTimeSlotValue(values.appointmentTimeSlot),
        constructionAddress: trimOptional(values.constructionAddress),
        constructionType: values.constructionType,
        constructionLocation: values.constructionLocation,
        pricingCalculationId: values.pricingCalculationId,
        items: values.items.map((item) => ({ productId: item.productId, finalUnitPriceCents: yuanToCents(item.unitPriceYuan) })),
        finalConstructionChargeCents: yuanToCents(values.constructionChargeYuan ?? values.laborCostYuan),
        temporaryCostCents: values.temporaryCostYuan === undefined ? undefined : yuanToCents(values.temporaryCostYuan),
        temporaryCostReason: trimOptional(values.temporaryCostReason),
        adjustmentReasonCode: "SALES_ADJUSTMENT",
        adjustmentReasonText: trimOptional(values.pricingAdjustmentReason) ?? trimOptional(values.constructionChargeAdjustmentReason ?? values.laborCostAdjustmentReason) ?? "本单成交价偏离建议价，提交审批"
      });
    },
    onSuccess: () => { message.success("已提交报价审批，批准后可转正式订单"); router.push("/orders/quotes"); },
    onError: (error: Error) => message.error(`报价提交失败：${error.message}`)
  });
  const createMutation = useMutation({
    mutationFn: (values: CreateOrderFormValues) => {
      if (!storeId) throw new Error("当前账号尚未加入门店");
      return orderApi.create(toCreateOrderPayload(values, storeId));
    },
    onSuccess: (order) => {
      removeCreateOrderDraft(localStorage);
      message.success("订单已创建");
      router.push(`/orders/${order.id}`);
    },
    onError: (error: Error) => {
      if (error.message.includes("需要先提交报价审批")) {
        message.info("当前成交价需要审批，正在创建报价单");
        createQuoteMutation.mutate(form.getFieldsValue(true) as CreateOrderFormValues);
        return;
      }
      message.error(error.message);
    }
  });

  const createCustomerMutation = useMutation({
    mutationFn: (values: NewOrderCustomerFormValues) => {
      if (!storeId) throw new Error("当前账号尚未加入门店");
      return customerApi.create(toCreateCustomerPayload(storeId, values));
    },
    onSuccess: (customer) => {
      setNewCustomerOpen(false);
      setNewOrderCustomerType("PERSONAL");
      newCustomerForm.resetFields();
      setCustomerKeyword("");
      setReferrerKeyword("");
      const selection = resolveCreatedCustomerSelection(customer);
      form.setFieldsValue(selection);
      const values = {
        ...(form.getFieldsValue(true) as CreateOrderFormValues),
        ...selection
      };
      if (storeId) {
        saveCreateOrderDraft(localStorage, {
          storeId,
          savedAt: new Date().toISOString(),
          values,
          pricingSnapshot: serverPricing ?? undefined,
          summary: {
            customerName: customer.companyName ?? customer.name ?? "新建客户",
            productCount: values.items?.filter((item) => item?.productId).length ?? 0,
            totalAmountYuan: getOrderAmountSummary(values).totalAmountYuan
          }
        });
      }
      message.success("客户已创建，订单草稿已保留；请先在客户档案新增车辆");
      router.push(`/customers/${customer.id}`);
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
    if (!storeId) {
      message.error("当前账号尚未加入门店，无法保存草稿");
      return;
    }
    const values = form.getFieldsValue(true) as CreateOrderFormValues;
    saveCreateOrderDraft(localStorage, {
      storeId,
      savedAt: new Date().toISOString(),
      values,
      pricingSnapshot: serverPricing ?? undefined,
      copySource: copySource ?? undefined,
      summary: {
        customerName: selectedCustomer?.companyName ?? selectedCustomer?.name ?? "客户待选择",
        productCount: values.items?.filter((item) => item?.productId).length ?? 0,
        totalAmountYuan: getOrderAmountSummary(values).totalAmountYuan
      }
    });
    message.success("草稿已保存，可在销售订单列表的“本机草稿”中继续编辑");
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
    if (!storeId || params.get("draft") !== "local" || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = loadCreateOrderDraft(localStorage, storeId);
    if (!draft) {
      message.warning("未找到可恢复的订单草稿");
      return;
    }
    form.setFieldsValue({
      ...draft.values,
      suggestedConstructionChargeYuan: draft.values.suggestedConstructionChargeYuan ?? draft.values.suggestedLaborCostYuan,
      constructionChargeYuan: draft.values.constructionChargeYuan ?? draft.values.laborCostYuan
    });
    setCopySource(draft.copySource ?? null);
    if (draft.copySource) {
      form.setFieldValue("pricingCalculationId", undefined);
      setServerPricing(null);
    }
    if (draft.pricingSnapshot && draft.values.pricingCalculationId) {
      setServerPricing(draft.pricingSnapshot);
      draftPricingPendingRef.current = true;
      setDraftPricingChoiceOpen(true);
    }
    constructionChargeTouchedRef.current = true;
    message.success(draft.copySource ? "已恢复复制订单草稿，请核对车辆、预约和当前建议价" : "已恢复订单草稿");
  }, [form, message, params, storeId]);

  const keepDraftPricing = () => {
    draftPricingPendingRef.current = false;
    setDraftPricingChoiceOpen(false);
  };

  const recalculateDraftPricing = () => {
    draftPricingPendingRef.current = false;
    setDraftPricingChoiceOpen(false);
    setServerPricing(null);
    form.setFieldValue("pricingCalculationId", undefined);
    if (pricingInput) pricingCalculationMutation.mutate();
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
    if (systemSuggestedConstructionChargeYuan === undefined) return;
    form.setFieldValue("suggestedConstructionChargeYuan", systemSuggestedConstructionChargeYuan);
    if (!constructionChargeTouchedRef.current) {
      form.setFieldValue("constructionChargeYuan", systemSuggestedConstructionChargeYuan);
      form.setFieldValue("constructionChargeMode", "SUGGESTED");
    }
  }, [form, systemSuggestedConstructionChargeYuan]);

  return (
    <>
      <div className="management-page">
        {copySource ? (
          <Alert
            type="info"
            showIcon
            className="mb-4"
            message={`正在复制订单 ${copySource.orderNo}`}
            description={`已复制：${copySource.copiedFields.join("、")}。未复制：${copySource.excludedFields.join("、")}。客户固定为原订单客户，车辆已重新选择，提交前系统会按当前规则重新校验。`}
          />
        ) : null}
        {draftPricingChoiceOpen ? (
          <Alert
            type="warning"
            showIcon
            message="草稿价格处理"
            description="该草稿保存了服务端建议价快照。可以沿用草稿当时的规则，也可以按当前已发布规则重新试算；正式提交时仍由服务端复核快照有效性。"
            action={
              <Space wrap>
                <Button size="small" onClick={keepDraftPricing}>沿用草稿规则快照</Button>
                <Button size="small" type="primary" onClick={recalculateDraftPricing}>按最新规则重算</Button>
              </Space>
            }
            className="mb-4"
          />
        ) : null}
          <StorePageHeader title="新建订单" description="选择客户、产品、施工方式并录入费用">
            <Space className="create-order-header-actions" wrap>
              <Button disabled={!storeId} onClick={() => storeId && router.push(getStoreWorkbenchHref(storeId))}>
                取消
              </Button>
              <Button onClick={saveDraft}>
                保存草稿
              </Button>
              <Button
                loading={pricingCalculationMutation.isPending}
                disabled={!pricingInput}
                onClick={() => pricingCalculationMutation.mutate()}
              >
                重新试算建议价
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
            salesPersonId: user?.id,
            constructionType: "PPF",
            constructionLocation: "IN_STORE",
            constructionChargeYuan: 0,
            constructionChargeMode: "MANUAL",
            shouldRecordDeposit: false,
            items: defaultItems
          }}
          onFinish={(values) => createMutation.mutate(values)}
        >
          <div className="create-order-layout">
            <div className="create-order-main">
              <Card title={<OrderStepTitle step={1} title="客户与车辆" />} className="create-order-card">
                <div className="create-order-customer-row">
                  <Form.Item name="customerId" label="客户" rules={[{ required: true, message: "请选择客户" }]}>
                    <Select
                      disabled={Boolean(copySource)}
                      showSearch
                      filterOption={false}
                      onSearch={setCustomerKeyword}
                      onChange={(customerId) => {
                        form.setFieldValue("customerId", customerId);
                        form.setFieldValue("vehicleId", undefined);
                        form.setFieldValue("vehicleTypeCode", undefined);
                        setCustomerKeyword("");
                      }}
                      options={customerOptions}
                      placeholder="输入姓名、企业、手机号、车牌或 VIN 搜索"
                    />
                  </Form.Item>
                  <Form.Item label=" ">
                    <Button icon={<PlusOutlined />} disabled={!storeId || Boolean(copySource)} onClick={() => setNewCustomerOpen(true)}>
                      新建客户
                    </Button>
                  </Form.Item>
                </div>

                <Form.Item name="vehicleId" label="车辆" rules={[{ required: true, message: "请选择车辆" }]}>
                  <Select
                    disabled={!selectedCustomer}
                    loading={selectedCustomerQuery.isLoading}
                    options={vehicleOptions}
                    onChange={() => form.setFieldValue("vehicleTypeCode", undefined)}
                    placeholder={selectedCustomer ? "选择客户车辆" : "请先选择客户"}
                  />
                </Form.Item>

                {selectedCustomer && vehicleOptions.length === 0 ? (
                  <Alert
                    showIcon
                    type="warning"
                    message="该客户没有可用于下单的启用车辆"
                    description="请先前往客户档案新增或启用车辆，正式订单必须关联一辆启用车辆。"
                    action={(
                      <Button onClick={() => {
                        saveDraft();
                        router.push(`/customers/${selectedCustomer.id}`);
                      }}>
                        前往客户档案
                      </Button>
                    )}
                  />
                ) : null}


                <Form.Item name="vehicleTypeCode" label="车辆类型" rules={[{ required: Boolean(selectedVehicle), message: "请选择车辆类型" }]} extra={selectedVehicle?.vehicleTypeCode ? "已从车辆档案自动带出；本单可按实际情况修正。" : selectedVehicle ? "该历史车辆尚未维护车辆类型，请为本单选择。" : "请先选择车辆。"}>
                  <Select
                    disabled={!selectedVehicle}
                    loading={vehicleTypesQuery.isLoading}
                    options={vehicleTypeOptions}
                    placeholder={selectedVehicle ? "选择车辆类型" : "请先选择车辆"}
                  />
                </Form.Item>

                <Form.Item
                  name="salesPersonId"
                  label="销售员"
                  rules={[{ required: true, message: "请选择销售员" }]}
                  extra={canAssignSalesPerson ? "默认当前登录人；店长可调整为本店销售或客服人员。" : "默认当前登录人。"}
                >
                  <Select
                    loading={storeMembersQuery.isLoading}
                    disabled={!canAssignSalesPerson}
                    options={salesPersonOptions}
                    placeholder="选择销售员"
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
                    title={capacityStatus?.message ?? "正在检查施工容量..."}
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
                                setServerPricing(null);
                                form.setFieldValue("pricingCalculationId", undefined);
                                const items = form.getFieldValue("items") as Array<Record<string, unknown>>;
                                items[field.name] = {
                                  ...items[field.name],
                                  salesUnit: resolveProductSalesUnit(product),
                                  unitPriceYuan: centsToYuan(product.basePriceCents)
                                };
                                form.setFieldValue("items", items);
                              }}
                            />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, "quantity"]} label="数量">
                            <InputNumber
                              min={0.001}
                              step={0.001}
                              precision={getSelectedProductQuantityPrecision(
                                selectedItems?.[field.name]?.productId,
                                selectedItems?.[field.name]?.salesUnit,
                                productOptions
                              )}
                              placeholder="数量"
                              className="w-full"
                            />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, "salesUnit"]} label="单位">
                            <Select
                              placeholder="选择单位"
                              options={getAvailableSalesUnitOptions(
                                selectedItems?.[field.name]?.productId,
                                productOptions
                              )}
                              onChange={(salesUnit) => {
                                const product = productOptions.find((item) => item.value === selectedItems?.[field.name]?.productId)?.product;
                                if (!product) return;
                                setServerPricing(null);
                                form.setFieldValue("pricingCalculationId", undefined);
                                form.setFieldValue(
                                  ["items", field.name, "unitPriceYuan"],
                                  centsToYuan(getDefaultUnitPriceCents(product, salesUnit))
                                );
                              }}
                            />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, "unitPriceYuan"]} label="单价（元）">
                            <InputNumber
                              min={0}
                              precision={2}
                              placeholder="单价（元）"
                              className="w-full"
                            />
                          </Form.Item>
                          {serverPricing?.calculation.lines[field.name] ? (
                            <Space size={4} className="create-order-price-suggestion">
                              <Typography.Text type="secondary">
                                建议 ¥{(serverPricing.calculation.lines[field.name].suggestedUnitPriceCents / 100).toFixed(2)}
                                {getSuggestedPriceSourceLabel(serverPricing.calculation.lines[field.name].basePriceSource)}
                              </Typography.Text>
                              <Button
                                size="small"
                                onClick={() => {
                                  const line = serverPricing.calculation.lines[field.name];
                                  form.setFieldValue(["items", field.name, "unitPriceYuan"], line.suggestedUnitPriceCents / 100);
                                }}
                              >
                                采用建议价
                              </Button>
                            </Space>
                          ) : null}
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

                <div className="create-order-labor-grid mt-4">
                  <Form.Item label="系统建议施工收费（元）" extra={constructionChargeHint}>
                    <Form.Item name="suggestedConstructionChargeYuan" noStyle>
                      <InputNumber
                        className="!w-full"
                        min={0}
                        precision={2}
                        readOnly
                        placeholder="待服务端试算"
                      />
                    </Form.Item>
                  </Form.Item>
                  <Form.Item label="本单施工收费方式">
                    <Form.Item name="constructionChargeMode" noStyle>
                      <Radio.Group
                        onChange={(event) => {
                          const mode = event.target.value as CreateOrderFormValues["constructionChargeMode"];
                          if (mode === "SUGGESTED") {
                            const suggestedCharge = suggestedConstructionChargeYuan ?? systemSuggestedConstructionChargeYuan;
                            form.setFieldValue("constructionChargeYuan", suggestedCharge);
                            form.setFieldValue("constructionChargeAdjustmentReason", undefined);
                            constructionChargeTouchedRef.current = false;
                          } else {
                            constructionChargeTouchedRef.current = true;
                          }
                        }}
                      >
                        <Radio value="SUGGESTED" disabled={systemSuggestedConstructionChargeYuan === undefined}>采用系统建议</Radio>
                        <Radio value="MANUAL">手动输入</Radio>
                      </Radio.Group>
                    </Form.Item>
                  </Form.Item>
                  <Form.Item
                    label="本单施工收费（元）"
                    extra={selectedConstructionChargeMode === "SUGGESTED" ? "已采用系统建议；切换为手动输入后可修改。" : "手动收费与系统建议不一致时，必须填写调整原因。"}
                  >
                    <Form.Item name="constructionChargeYuan" noStyle>
                      <InputNumber
                        className="!w-full"
                        min={0}
                        precision={2}
                        readOnly={selectedConstructionChargeMode !== "MANUAL"}
                        onChange={() => {
                          constructionChargeTouchedRef.current = true;
                          form.setFieldValue("constructionChargeMode", "MANUAL");
                        }}
                      />
                    </Form.Item>
                  </Form.Item>
                </div>
                {hasConstructionChargeAdjustment ? (
                  <Form.Item
                    name="constructionChargeAdjustmentReason"
                    label="施工收费调整原因"
                    extra={`系统建议 ¥${(suggestedConstructionChargeYuan ?? 0).toFixed(2)}，本单收费 ¥${(selectedConstructionChargeYuan ?? 0).toFixed(2)}`}
                    rules={[{ required: true, whitespace: true, message: "调整本单施工收费必须填写原因" }]}
                  >
                    <Input.TextArea rows={2} placeholder="说明调整原因，例如车型复杂、外出距离、追加施工项目等" />
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
                        <InputNumber min={0} precision={2} placeholder="定金金额" className="w-full" />
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

                <Form.Item name="pricingAdjustmentReason" label="价格审批说明" extra="成交价偏离建议价时会随报价单提交，正常订单可留空">
                  <Input.TextArea rows={2} placeholder="例如：客户组合采购，申请本单优惠" />
                </Form.Item>

                <Form.Item name="remark" label="备注">
                  <Input.TextArea rows={4} />
                </Form.Item>
              </Card>
            </div>

            <aside className="create-order-aside">
              <div className="create-order-history-panel-slot">
          <CustomerHistoryPanel
            customerHistory={customerHistory}
            orderContext={orderContextQuery.data}
            loadingVehicleContext={orderContextQuery.isLoading}
          />
              </div>
              <Card title="订单金额汇总" className="create-order-summary-card">
                <div className="create-order-summary-row">
                  <span>产品费用</span>
                  <strong>¥{amountSummary.productAmountYuan.toFixed(2)}</strong>
                </div>
                <div className="create-order-summary-row">
                  <span>施工收费</span>
                  <strong>¥{amountSummary.constructionChargeYuan.toFixed(2)}</strong>
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
          title="新建客户"
          onClose={closeNewCustomerDrawer}
          destroyOnHidden
          footer={
            <div className="create-order-drawer-footer">
              <Button onClick={closeNewCustomerDrawer}>取消</Button>
              <Button type="primary" loading={createCustomerMutation.isPending} onClick={() => newCustomerForm.submit()}>
                创建并前往客户档案
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

            <Alert
              showIcon
              type="info"
              message="车辆统一在客户档案维护"
              description="创建客户后将自动保存当前订单草稿并前往客户档案。新增或启用车辆后，可返回订单继续选择。"
            />
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

function resolveProductSalesUnit(product: ProductOption): ProductUnit {
  return product.salesUnit ?? product.unit ?? "PIECE";
}

function getAvailableProductSalesUnits(product: ProductOption) {
  const defaultUnit = resolveProductSalesUnit(product);
  const units = [defaultUnit];
  const isRollMeterProduct = (defaultUnit === "ROLL" || defaultUnit === "METER") && Number(product.metersPerRoll ?? 0) > 0;
  if (isRollMeterProduct) units.push(defaultUnit === "ROLL" ? "METER" : "ROLL");
  return units;
}

function getAvailableSalesUnitOptions(
  productId: string | undefined,
  productOptions: ProductSelectOption[]
) {
  if (!productId) return [];
  const product = productOptions.find((option) => option.value === productId)?.product;
  return product
    ? getAvailableProductSalesUnits(product).map((unit) => ({ value: unit, label: getProductUnitLabel(unit) }))
    : [];
}

function getSelectedProductQuantityPrecision(
  productId: string | undefined,
  salesUnit: ProductUnit | undefined,
  productOptions: ProductSelectOption[]
) {
  const product = productOptions.find((option) => option.value === productId)?.product;
  const selectedUnit = salesUnit ?? (product ? resolveProductSalesUnit(product) : undefined);
  return selectedUnit === "METER" ? 3 : product?.quantityPrecision ?? 3;
}

function getDefaultUnitPriceCents(product: ProductOption, selectedUnit: ProductUnit) {
  const defaultUnit = resolveProductSalesUnit(product);
  if (selectedUnit === defaultUnit) return product.basePriceCents;
  const explicitPrice = product.unitSuggestedPrices?.find((price) => price.salesUnit === selectedUnit && price.isActive);
  if (explicitPrice) return explicitPrice.suggestedPriceCents;
  const metersPerRoll = Number(product.metersPerRoll ?? 0);
  if (metersPerRoll <= 0) return product.basePriceCents;
  if (defaultUnit === "ROLL" && selectedUnit === "METER") return Math.round(product.basePriceCents / metersPerRoll);
  if (defaultUnit === "METER" && selectedUnit === "ROLL") return Math.round(product.basePriceCents * metersPerRoll);
  return product.basePriceCents;
}

function getSuggestedPriceSourceLabel(source?: "DEFAULT_UNIT" | "UNIT_OVERRIDE" | "UNIT_CONVERTED") {
  if (source === "UNIT_OVERRIDE") return "（单位专属建议价）";
  if (source === "UNIT_CONVERTED") return "（按产品换算）";
  return "（产品默认建议价）";
}

function CustomerHistoryPanel({
  customerHistory,
  orderContext,
  loadingVehicleContext
}: {
  customerHistory?: ReturnType<typeof getOrderCustomerHistorySummary>;
  orderContext?: Awaited<ReturnType<typeof customerApi.orderContext>>;
  loadingVehicleContext?: boolean;
}) {
  const vehicleContext = orderContext?.vehicle;
  const latestVehicleOrder = orderContext?.recentOrders[0];
  return (
    <Card title="客户历史记录" className="create-order-history-panel">
      {customerHistory ? (
        <>
          {customerHistory.warning ? (
            <Alert className="mb-3" type="warning" showIcon title={customerHistory.warning} />
          ) : null}
          {loadingVehicleContext ? (
            <Typography.Text type="secondary">正在加载当前车辆历史...</Typography.Text>
          ) : vehicleContext ? (
            <div className="create-order-history-section">
              <Typography.Text strong>当前车辆</Typography.Text>
              <div className="create-order-history-line">
                {vehicleContext.carPlate || "未上牌"} / {vehicleContext.carModel}
                {vehicleContext.carColor ? ` / ${vehicleContext.carColor}` : ""}
              </div>
              {!vehicleContext.usable ? (
                <Alert
                  className="mt-2"
                  type="warning"
                  showIcon
                  title={vehicleContext.unusableReason ?? "当前车辆暂不可用于下单"}
                />
              ) : null}
              <div className="create-order-history-line">
                历史订单 {vehicleContext.orderCount} 单，累计消费
                ¥{(centsToYuan(vehicleContext.totalAmountCents) ?? 0).toFixed(2)}，待收
                ¥{(centsToYuan(vehicleContext.outstandingCents) ?? 0).toFixed(2)}
              </div>
              <div className="create-order-history-line">
                有效质保 {vehicleContext.activeWarrantyCount} 个，待处理售后
                {vehicleContext.openAfterSalesCount} 个
              </div>
              {latestVehicleOrder ? (
                <div className="create-order-history-line">
                  最近订单：{latestVehicleOrder.orderNo} / {latestVehicleOrder.status} /{" "}
                  ¥{(centsToYuan(latestVehicleOrder.amount?.totalAmountCents ?? 0) ?? 0).toFixed(2)}
                </div>
              ) : (
                <Typography.Text type="secondary">当前车辆暂无历史订单</Typography.Text>
              )}
            </div>
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
              <Space className="mt-2 w-full" orientation="vertical" size={6}>
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
