import type { AfterSaleResponsibility, AfterSaleSummary, BusinessOrderSummary } from "@mallbay/shared";

export const AFTER_SALE_STATUS_LABELS: Record<string, string> = {
  OPEN: "待处理",
  ASSIGNED: "处理中",
  RESOLVED: "已完成",
  CLOSED: "已关闭",
  CANCELLED: "已取消"
};

export const AFTER_SALE_RESPONSIBILITY_LABELS: Record<AfterSaleResponsibility, string> = {
  PENDING: "待判责",
  CUSTOMER: "客户人为损坏",
  CONSTRUCTION: "施工方责任",
  MATERIAL: "原厂产品质量",
  STORE: "门店服务责任"
};

export const AFTER_SALE_RESPONSIBILITY_DESCRIPTIONS: Record<AfterSaleResponsibility, string> = {
  PENDING: "等待客服或主管结合证据完成责任判定。",
  CUSTOMER: "外力剐蹭、清洗不当或客户使用场景导致。",
  CONSTRUCTION: "施工边角收口、环境落尘或工艺执行不到位导致。",
  MATERIAL: "膜材、胶层或批次质量异常导致。",
  STORE: "门店接待、交付、保管或服务流程导致。"
};

export const AFTER_SALE_RESPONSIBILITY_OPTIONS: Array<{ value: Exclude<AfterSaleResponsibility, "PENDING">; label: string }> = [
  { value: "CUSTOMER", label: AFTER_SALE_RESPONSIBILITY_LABELS.CUSTOMER },
  { value: "CONSTRUCTION", label: AFTER_SALE_RESPONSIBILITY_LABELS.CONSTRUCTION },
  { value: "MATERIAL", label: AFTER_SALE_RESPONSIBILITY_LABELS.MATERIAL },
  { value: "STORE", label: AFTER_SALE_RESPONSIBILITY_LABELS.STORE }
];

export function getAfterSaleStatusLabel(status?: string | null) {
  if (!status) return "-";
  return AFTER_SALE_STATUS_LABELS[status] ?? "状态待确认";
}

export function getAfterSaleResponsibilityLabel(responsibility?: string | null) {
  if (!responsibility) return "-";
  return AFTER_SALE_RESPONSIBILITY_LABELS[responsibility as AfterSaleResponsibility] ?? "责任待确认";
}

export function getAfterSaleResponsibilityDescription(responsibility?: string | null) {
  if (!responsibility) return "责任说明待确认。";
  return AFTER_SALE_RESPONSIBILITY_DESCRIPTIONS[responsibility as AfterSaleResponsibility] ?? "责任说明待确认。";
}

export function getAfterSaleResponsibilityCards(responsibility?: string | null) {
  const activeResponsibility = responsibility as AfterSaleResponsibility | undefined;
  const values: Array<Exclude<AfterSaleResponsibility, "PENDING">> = ["CONSTRUCTION", "MATERIAL", "CUSTOMER", "STORE"];

  return values.map((value) => ({
    value,
    title: getAfterSaleResponsibilityLabel(value),
    description: getAfterSaleResponsibilityDescription(value),
    active: value === activeResponsibility
  }));
}

export function getAfterSaleResponsiblePersonLabel(
  afterSale?: Pick<AfterSaleSummary, "responsibility" | "assignments" | "penalties"> | null
) {
  if (!afterSale || afterSale.responsibility === "PENDING") return "待责任判定";
  if (afterSale.responsibility === "CONSTRUCTION") {
    const penaltyWorker = afterSale.penalties?.find((penalty) => penalty.worker)?.worker;
    const assignedWorkers = afterSale.assignments?.map((assignment) => assignment.worker).filter(Boolean) ?? [];
    const names = [penaltyWorker, ...assignedWorkers]
      .map((worker) => worker?.nickname ?? worker?.username)
      .filter(Boolean);
    return [...new Set(names)].join("、") || "责任技师待确认";
  }
  return "不涉及施工技师处罚";
}

export function getAfterSalePenaltyRows(afterSale?: Pick<AfterSaleSummary, "responsibility" | "constructionIssueCategory" | "resolutionNote"> | null) {
  const responsibility = afterSale?.responsibility ?? "PENDING";
  const category = afterSale?.constructionIssueCategory?.trim();
  const resolutionNote = afterSale?.resolutionNote?.trim();

  return [
    {
      key: "responsibility",
      label: "责任类型",
      value: getAfterSaleResponsibilityLabel(responsibility)
    },
    {
      key: "category",
      label: responsibility === "CONSTRUCTION" ? "施工问题分类" : "处理分类",
      value: category || (responsibility === "PENDING" ? "待补充" : getAfterSaleResponsibilityDescription(responsibility))
    },
    {
      key: "resolution",
      label: "处理方案",
      value: resolutionNote || "待补充处理方案"
    }
  ];
}

export function getAfterSalePenaltyRiskNote(afterSale?: Pick<AfterSaleSummary, "responsibility"> | null) {
  const responsibility = afterSale?.responsibility ?? "PENDING";
  if (responsibility === "PENDING") return "完成责任判定后，再决定是否需要处罚、供应商追踪或客户沟通。";
  if (responsibility === "CONSTRUCTION") return "施工责任成立时，请在处理面板录入处罚人员、金额、原因和改进说明。";
  if (responsibility === "MATERIAL") return "原厂或供应商责任成立时，请保留批次证据并同步供应商售后追踪。";
  if (responsibility === "CUSTOMER") return "客户责任成立时，请沉淀客户沟通记录和二次服务方案。";
  return "门店服务责任成立时，请补充服务流程复盘和整改记录。";
}

export function yuanToCents(value?: number | null) {
  if (value === undefined || value === null) return undefined;
  return Math.round(value * 100);
}

export function centsToYuan(value?: number | null) {
  if (value === undefined || value === null) return undefined;
  return Number((value / 100).toFixed(2));
}

type AfterSaleLabelInput = {
  id?: string | null;
  orderId?: string | null;
  description?: string | null;
  status?: string | null;
  order?: BusinessOrderSummary | null;
};

export function getAfterSaleBusinessLabel(afterSale: AfterSaleLabelInput) {
  return [
    afterSale.order ? getAfterSaleOrderLabel(afterSale) : undefined,
    afterSale.description,
    afterSale.status ? getAfterSaleStatusLabel(afterSale.status) : undefined
  ]
    .filter(Boolean)
    .join(" / ") || "售后工单待确认";
}

export function getAfterSaleOrderLabel(afterSale: AfterSaleLabelInput) {
  const order = afterSale.order;
  if (!order) return "关联订单待确认";
  return [order.orderNo, getBusinessCustomerLabel(order.customer), getBusinessVehicleLabel(order.vehicle)]
    .filter(Boolean)
    .join(" / ") || "关联订单待确认";
}

function getBusinessCustomerLabel(orderCustomer?: BusinessOrderSummary["customer"]) {
  return orderCustomer?.companyName ?? orderCustomer?.personalName ?? orderCustomer?.name ?? orderCustomer?.contactPerson ?? undefined;
}

function getBusinessVehicleLabel(orderVehicle?: BusinessOrderSummary["vehicle"]) {
  return orderVehicle?.plateNo ?? orderVehicle?.carPlate ?? orderVehicle?.model ?? orderVehicle?.carModel ?? undefined;
}
