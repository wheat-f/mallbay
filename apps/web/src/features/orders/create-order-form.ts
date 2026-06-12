import type { CreateOrderPayload } from "../../lib/api";
import type { DailyCapacitySummary } from "@mallbay/shared";
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
  carPlate?: string | null;
  carModel?: string | null;
  carColor?: string | null;
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
  vehicleId?: string;
  constructionType: CreateOrderPayload["constructionType"];
  constructionLocation: CreateOrderPayload["constructionLocation"];
  constructionAddress?: string;
  appointmentDate?: string | PickerValue;
  appointmentTimeSlot?: string | TimeRangePickerValue;
  items: { productId: string; quantity: number; unitPriceYuan: number }[];
  laborCostYuan?: number;
  suggestedLaborCostYuan?: number;
  laborCostAdjustmentReason?: string;
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
    customer.id
  );
}

export function getOrderVehicleLabel(vehicle: OrderVehicle) {
  const labelParts = [vehicle.carPlate, vehicle.carModel, vehicle.carColor].filter(Boolean);
  return labelParts.length > 0 ? labelParts.join(" / ") : vehicle.id;
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
  return (customer?.vehicles ?? []).map((vehicle) => ({
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
  const vehicles = customer?.vehicles ?? [];
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
    laborCostYuan,
    suggestedLaborCostYuan,
    laborCostAdjustmentReason,
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
  const normalizedDeposit = shouldRecordDeposit && deposit?.accountId && deposit.amountYuan && deposit.paymentType && deposit.paidAt
    ? {
        accountId: deposit.accountId,
        amountCents: yuanToCents(deposit.amountYuan),
        paymentType: deposit.paymentType,
        paidAt: formatOrderDateValue(deposit.paidAt) ?? ""
      }
    : undefined;
  const trimmedLaborAdjustmentReason = trimOptionalText(laborCostAdjustmentReason);

  return {
    ...payloadValues,
    storeId,
    ...(appointmentDate ? { appointmentDate } : {}),
    ...(appointmentTimeSlot ? { appointmentTimeSlot } : {}),
    ...(constructionAddress ? { constructionAddress } : {}),
    ...(remark ? { remark } : {}),
    items: values.items.map(({ unitPriceYuan, ...item }) => ({
      ...item,
      unitPriceCents: yuanToCents(unitPriceYuan)
    })),
    laborCostCents: yuanToCents(laborCostYuan),
    ...(suggestedLaborCostYuan !== undefined ? { suggestedLaborCostCents: yuanToCents(suggestedLaborCostYuan) } : {}),
    ...(trimmedLaborAdjustmentReason ? { laborCostAdjustmentReason: trimmedLaborAdjustmentReason } : {}),
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
  const laborCostYuan = values.laborCostYuan ?? 0;
  const totalAmountYuan = productAmountYuan + laborCostYuan;
  const depositAmountYuan = values.deposit?.amountYuan ?? 0;

  return {
    productAmountYuan: roundMoney(productAmountYuan),
    laborCostYuan: roundMoney(laborCostYuan),
    totalAmountYuan: roundMoney(totalAmountYuan),
    depositAmountYuan: roundMoney(depositAmountYuan),
    outstandingAmountYuan: roundMoney(Math.max(totalAmountYuan - depositAmountYuan, 0))
  };
}

export function getSuggestedLaborCostYuan(
  constructionType: CreateOrderFormValues["constructionType"],
  constructionLocation: CreateOrderFormValues["constructionLocation"],
  carModel?: string | null
) {
  const baseByType: Record<CreateOrderFormValues["constructionType"], number> = {
    PPF: 1800,
    COLOR_FILM: 1600,
    HEAT_FILM: 800,
    MODIFICATION: 2000,
    INSPECTION: 200
  };
  const outsideSurcharge = constructionLocation === "OUTSIDE" ? 400 : 0;
  const largeVehicleSurcharge = isLargeVehicle(carModel) ? 300 : 0;

  return baseByType[constructionType] + outsideSurcharge + largeVehicleSurcharge;
}

function isLargeVehicle(carModel?: string | null) {
  if (!carModel) return false;
  return /suv|mpv|大型|越野|商务|gl8|x5|x7/i.test(carModel);
}

function getConstructionStatusLabel(value?: string | null) {
  const labels: Record<string, string> = {
    DISPATCHED: "已派工",
    IN_CONSTRUCTION: "施工中",
    COMPLETED: "已完工"
  };
  return value ? labels[value] ?? value : "-";
}

function getQualityResultLabel(value?: string | null) {
  const labels: Record<string, string> = {
    PASS: "质检通过",
    REWORK_REQUIRED: "需返工"
  };
  return value ? labels[value] ?? value : "-";
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
