import type { CreateOrderPayload } from "../../lib/api";
import type { DailyCapacitySummary, ProductUnit } from "@mallbay/shared";
import { getConstructionTypeLabel, getOrderStatusLabel } from "./order-display";

export type OrderCustomer = {
  id: string;
  name?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  phone?: string | null;
  vehicles?: OrderVehicle[];
  orders?: OrderCustomerRecentOrder[];
  archiveSummary?: OrderCustomerArchiveSummary;
};

export type OrderVehicle = {
  id: string;
  status?: "ACTIVE" | "INACTIVE";
  carPlate?: string | null;
  carModel?: string | null;
  carColor?: string | null;
  vehicleTypeCode?: "SMALL_CAR" | "STANDARD_CAR" | "LUXURY_LARGE_CAR" | null;
};

export type OrderCustomerArchiveSummary = {
  consumption: {
    orderCount: number;
    totalAmountCents: number;
    paidAmountCents: number;
    outstandingCents: number;
    constructionTypeDistribution?: Record<string, number>;
    latestConsumedAt?: string | null;
  };
  warranty: {
    activeCount: number;
    expiredCount: number;
    expiringSoonCount: number;
  };
  afterSales: {
    totalCount: number;
    openCount: number;
    closedCount: number;
    responsibilityDistribution?: Record<string, number>;
  };
  construction?: {
    recentRecords?: Array<{
      orderNo: string;
      constructionType: string;
      status: string;
      completedAt?: string | Date | null;
      actualMinutes?: number | null;
      qualityResult?: string | null;
      vehicleLabel?: string | null;
    }>;
  };
  systemTags: Array<{ code: string; label: string }>;
};

export type OrderCustomerRecentOrder = {
  id: string;
  orderNo: string;
  status: string;
  createdAt: string;
  amount?: {
    totalAmountCents: number;
    paidAmountCents: number;
    outstandingCents: number;
  } | null;
  vehicle?: OrderVehicle | null;
};

export type OrderProduct = {
  id: string;
  brand?: string | null;
  name?: string | null;
  model?: string | null;
};

export type CreateOrderFormValues = {
  customerId: string;
  executionStoreId?: string;
  vehicleId?: string;
  salesPersonId?: string;
  vehicleTypeCode?: "SMALL_CAR" | "STANDARD_CAR" | "LUXURY_LARGE_CAR";
  /** @deprecated historical compatibility only. */
  vehicleClassCode?: string;
  constructionType: CreateOrderPayload["constructionType"];
  constructionLocation: CreateOrderPayload["constructionLocation"];
  constructionAddress?: string;
  appointmentDate?: string | PickerValue;
  appointmentTimeSlot?: string | TimeRangePickerValue;
  items: { productId: string; salesUnit?: ProductUnit; quantity: number; unitPriceYuan: number }[];
  constructionChargeYuan?: number;
  suggestedConstructionChargeYuan?: number;
  /** 本单施工收费采用系统建议，或由业务人员手动输入。仅用于页面交互，不单独落库。 */
  constructionChargeMode?: "SUGGESTED" | "MANUAL";
  constructionChargeAdjustmentReason?: string;
  /** @deprecated local-draft compatibility fields. */
  laborCostYuan?: number;
  suggestedLaborCostYuan?: number;
  laborCostAdjustmentReason?: string;
  pricingAdjustmentReason?: string;
  /** Manager-only exceptional cost used to create an approval quote. */
  temporaryCostYuan?: number;
  temporaryCostReason?: string;
  pricingCalculationId?: string;
  shouldRecordDeposit?: boolean;
  deposit?: {
    accountId?: string;
    amountYuan?: number;
    paymentType?: NonNullable<CreateOrderPayload["deposit"]>["paymentType"];
    paidAt?: string | PickerValue;
  };
  remark?: string;
};

type PickerValue = {
  format: (pattern: string) => string;
};

type TimeRangePickerValue = [PickerValue | null, PickerValue | null];

export function getOrderCustomerLabel(customer: OrderCustomer) {
  return (
    customer.companyName ??
    customer.name ??
    customer.contactPerson ??
    customer.phone ??
    "未命名客户"
  );
}

export function getOrderVehicleLabel(vehicle: OrderVehicle) {
  const labelParts = [vehicle.carPlate, vehicle.carModel, vehicle.carColor].filter(Boolean);
  return labelParts.length > 0 ? labelParts.join(" / ") : "未登记车辆";
}

export function getOrderProductLabel(product: OrderProduct) {
  return [
    `品牌：${product.brand ?? "-"}`,
    `名称：${product.name ?? "-"}`,
    `型号：${product.model ?? "-"}`
  ].join(" / ");
}

export function buildOrderCustomerOptions(
  searchCustomers: OrderCustomer[],
  selectedCustomer?: OrderCustomer | null
) {
  const customers = selectedCustomer
    ? [selectedCustomer, ...searchCustomers.filter((customer) => customer.id !== selectedCustomer.id)]
    : searchCustomers;

  return customers.map((customer) => ({
    label: getOrderCustomerLabel(customer),
    value: customer.id
  }));
}

export function buildOrderVehicleOptions(customer?: OrderCustomer | null) {
  return (customer?.vehicles ?? [])
    .filter((vehicle) => vehicle.status !== "INACTIVE")
    .map((vehicle) => ({
    label: getOrderVehicleLabel(vehicle),
    value: vehicle.id
  }));
}

export function getOrderCustomerHistorySummary(customer?: OrderCustomer | null) {
  const archive = customer?.archiveSummary;
  const consumption = archive?.consumption;
  const latestOrder = customer?.orders?.[0];
  const outstandingAmountYuan = centsToYuan(consumption?.outstandingCents ?? 0) ?? 0;

  return {
    orderCount: consumption?.orderCount ?? customer?.orders?.length ?? 0,
    vehicleCount: customer?.vehicles?.length ?? 0,
    totalAmountYuan: centsToYuan(consumption?.totalAmountCents ?? 0) ?? 0,
    paidAmountYuan: centsToYuan(consumption?.paidAmountCents ?? 0) ?? 0,
    outstandingAmountYuan,
    activeWarrantyCount: archive?.warranty.activeCount ?? 0,
    openAfterSalesCount: archive?.afterSales.openCount ?? 0,
    tags: archive?.systemTags.map((tag) => tag.label) ?? [],
    latestOrder: latestOrder
      ? {
          orderNo: latestOrder.orderNo,
          status: getOrderStatusLabel(latestOrder.status),
          amountYuan: centsToYuan(latestOrder.amount?.totalAmountCents ?? 0) ?? 0,
          vehicleLabel: latestOrder.vehicle ? getOrderVehicleLabel(latestOrder.vehicle) : "-",
          createdAt: latestOrder.createdAt
        }
      : undefined,
    recentConstructionRecords: (archive?.construction?.recentRecords ?? []).map((record) => ({
      orderNo: record.orderNo,
      constructionType: getConstructionTypeLabel(record.constructionType),
      status: getConstructionStatusLabel(record.status),
      completedAt: record.completedAt,
      actualMinutes: record.actualMinutes ?? null,
      qualityResult: getQualityResultLabel(record.qualityResult),
      vehicleLabel: record.vehicleLabel ?? "-"
    })),
    warning: outstandingAmountYuan > 0
      ? `该客户存在 ¥${outstandingAmountYuan.toFixed(2)} 未结金额，创建新订单前请确认收款风险。`
      : undefined
  };
}

export function resolveVehicleIdForCustomer(
  customer: OrderCustomer | undefined | null,
  currentVehicleId?: string
) {
  const vehicles = (customer?.vehicles ?? []).filter((vehicle) => vehicle.status !== "INACTIVE");
  if (currentVehicleId && vehicles.some((vehicle) => vehicle.id === currentVehicleId)) {
    return currentVehicleId;
  }

  if (vehicles.length === 1) {
    return vehicles[0]?.id;
  }

  return undefined;
}

export function resolveCreatedCustomerSelection(customer: Pick<OrderCustomer, "id">) {
  return {
    customerId: customer.id,
    vehicleId: undefined
  };
}

export function formatOrderDateValue(value?: string | PickerValue | null) {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  return value.format("YYYY-MM-DD");
}

export function formatOrderTimeSlotValue(value?: string | TimeRangePickerValue | null) {
  if (!value) return undefined;
  if (typeof value === "string") return value;

  const [start, end] = value;
  if (!start || !end) return undefined;

  return `${start.format("HH:mm")}-${end.format("HH:mm")}`;
}

export function yuanToCents(value?: number | null) {
  return Math.round((value ?? 0) * 100);
}

export function centsToYuan(value?: number | null) {
  return value === undefined || value === null ? undefined : value / 100;
}

export function toCreateOrderPayload(values: CreateOrderFormValues, storeId: string): CreateOrderPayload {
  const {
    constructionChargeYuan,
    suggestedConstructionChargeYuan,
    constructionChargeMode: _constructionChargeMode,
    constructionChargeAdjustmentReason,
    laborCostYuan,
    suggestedLaborCostYuan,
    laborCostAdjustmentReason,
    pricingAdjustmentReason: _pricingAdjustmentReason,
    temporaryCostYuan: _temporaryCostYuan,
    temporaryCostReason: _temporaryCostReason,
    shouldRecordDeposit,
    deposit,
    appointmentDate: _appointmentDate,
    appointmentTimeSlot: _appointmentTimeSlot,
    constructionAddress: _constructionAddress,
    remark: _remark,
    ...payloadValues
  } = values;
  const appointmentDate = formatOrderDateValue(values.appointmentDate);
  const appointmentTimeSlot = trimOptionalText(formatOrderTimeSlotValue(values.appointmentTimeSlot));
  const constructionAddress = trimOptionalText(values.constructionAddress);
  const remark = trimOptionalText(values.remark);
  // 允许业务员明确录入 0 元定金；0 不创建一笔无意义的收款记录，也不会计入已收金额。
  const normalizedDeposit = shouldRecordDeposit && deposit?.accountId && (deposit.amountYuan ?? 0) > 0 && deposit.paymentType && deposit.paidAt
    ? {
        accountId: deposit.accountId,
        amountCents: yuanToCents(deposit.amountYuan),
        paymentType: deposit.paymentType,
        paidAt: formatOrderDateValue(deposit.paidAt) ?? ""
      }
    : undefined;
  const resolvedConstructionChargeYuan = constructionChargeYuan ?? laborCostYuan;
  const resolvedSuggestedConstructionChargeYuan = suggestedConstructionChargeYuan ?? suggestedLaborCostYuan;
  const trimmedConstructionChargeAdjustmentReason = trimOptionalText(
    constructionChargeAdjustmentReason ?? laborCostAdjustmentReason
  );
  const vehicleId = trimOptionalText(values.vehicleId);
  if (!vehicleId) {
    throw new Error("请选择车辆后再提交订单");
  }

  return {
    ...payloadValues,
    storeId,
    vehicleId,
    ...(appointmentDate ? { appointmentDate } : {}),
    ...(appointmentTimeSlot ? { appointmentTimeSlot } : {}),
    ...(constructionAddress ? { constructionAddress } : {}),
    ...(remark ? { remark } : {}),
    items: values.items.map(({ unitPriceYuan, ...item }) => ({
      ...item,
      unitPriceCents: yuanToCents(unitPriceYuan)
    })),
    constructionChargeCents: yuanToCents(resolvedConstructionChargeYuan),
    ...(resolvedSuggestedConstructionChargeYuan !== undefined ? { suggestedConstructionChargeCents: yuanToCents(resolvedSuggestedConstructionChargeYuan) } : {}),
    ...(trimmedConstructionChargeAdjustmentReason ? { constructionChargeAdjustmentReason: trimmedConstructionChargeAdjustmentReason } : {}),
    ...(normalizedDeposit ? { deposit: normalizedDeposit } : {})
  };
}

function trimOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getOrderAmountSummary(values: Partial<CreateOrderFormValues>) {
  const productAmountYuan = (values.items ?? []).reduce(
    (sum, item) => sum + (item.quantity ?? 0) * (item.unitPriceYuan ?? 0),
    0
  );
  const constructionChargeYuan = values.constructionChargeYuan ?? values.laborCostYuan ?? 0;
  const totalAmountYuan = productAmountYuan + constructionChargeYuan;
  const depositAmountYuan = values.deposit?.amountYuan ?? 0;

  return {
    productAmountYuan: roundMoney(productAmountYuan),
    constructionChargeYuan: roundMoney(constructionChargeYuan),
    laborCostYuan: roundMoney(constructionChargeYuan),
    totalAmountYuan: roundMoney(totalAmountYuan),
    depositAmountYuan: roundMoney(depositAmountYuan),
    outstandingAmountYuan: roundMoney(Math.max(totalAmountYuan - depositAmountYuan, 0))
  };
}

function getConstructionStatusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    DISPATCHED: "已派工",
    IN_CONSTRUCTION: "施工中",
    COMPLETED: "已完工"
  };
  return value ? labels[value] ?? "施工状态待确认" : "-";
}

function getQualityResultLabel(value?: string | null) {
  const labels: Record<string, string> = {
    PASS: "质检通过",
    REWORK_REQUIRED: "需返工"
  };
  return value ? labels[value] ?? "质检结果待确认" : "-";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export type OrderCapacityStatus = {
  state: "missing" | "full" | "available";
  message: string;
};

export function getOrderCapacityStatus(
  capacity: DailyCapacitySummary | undefined,
  location: CreateOrderFormValues["constructionLocation"],
  type: CreateOrderFormValues["constructionType"]
): OrderCapacityStatus {
  if (!capacity) {
    return {
      state: "missing",
      message: "该预约日期尚未设置施工容量，请先维护当天容量后再创建预约订单。"
    };
  }

  const primaryCapacity = location === "IN_STORE"
    ? {
        label: "店内",
        reserved: capacity.inStoreReserved,
        total: capacity.inStoreCapacity
      }
    : {
        label: "店外",
        reserved: capacity.outsideReserved,
        total: capacity.outsideCapacity
      };

  if (primaryCapacity.reserved >= primaryCapacity.total) {
    return {
      state: "full",
      message: `该预约日期的${primaryCapacity.label}容量已满，请调整日期或先扩充施工容量。`
    };
  }

  if (type === "HEAT_FILM" && capacity.heatFilmReserved >= capacity.heatFilmCapacity) {
    return {
      state: "full",
      message: "该预约日期的玻璃膜容量已满，请调整日期或先扩充施工容量。"
    };
  }

  if (type === "INSPECTION" && capacity.inspectionReserved >= capacity.inspectionCapacity) {
    return {
      state: "full",
      message: "该预约日期的复检容量已满，请调整日期或先扩充施工容量。"
    };
  }

  return {
    state: "available",
    message: `${primaryCapacity.label}容量剩余 ${primaryCapacity.total - primaryCapacity.reserved} 个预约名额。`
  };
}

