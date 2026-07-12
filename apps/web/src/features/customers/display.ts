export {
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel
} from "../after-sales/display";
export { getWarrantyStatusLabel } from "../warranties/display";

export type CustomerArchiveLike = {
  archiveSummary?: {
    consumption?: {
      orderCount?: number;
      totalAmountCents?: number;
      paidAmountCents?: number;
      outstandingCents?: number;
      constructionTypeDistribution?: Record<string, number>;
      trend?: CustomerConsumptionTrendItem[];
    };
    warranty?: {
      activeCount?: number;
      expiredCount?: number;
      expiringSoonCount?: number;
    };
    afterSales?: {
      totalCount?: number;
      openCount?: number;
      closedCount?: number;
      responsibilityDistribution?: Record<string, number>;
    };
    systemTags?: Array<{ code: string; label: string }>;
  };
};

export type CustomerConsumptionTrendItem = {
  month: string;
  orderCount: number;
  totalAmountCents: number;
  paidAmountCents: number;
  outstandingCents: number;
};

export type CustomerManualProfileLike = {
  notes?: unknown[];
  tags?: unknown[];
  vehicles?: unknown[];
};

export type CustomerProfileNote = {
  id: string;
  noteType?: string | null;
  content: string;
  createdAt: string;
};

export type CustomerProfileNotesLike = {
  notes?: CustomerProfileNote[];
};

export function getCustomerAutoArchiveMetrics(customer: CustomerArchiveLike) {
  const summary = customer.archiveSummary;
  return {
    orderCount: summary?.consumption?.orderCount ?? 0,
    totalAmountCents: summary?.consumption?.totalAmountCents ?? 0,
    outstandingCents: summary?.consumption?.outstandingCents ?? 0,
    activeWarrantyCount: summary?.warranty?.activeCount ?? 0,
    openAfterSaleCount: summary?.afterSales?.openCount ?? 0,
    systemTagLabels: (summary?.systemTags ?? []).map((tag) => tag.label)
  };
}

export function getCustomerManualProfileCounts(customer: CustomerManualProfileLike) {
  return {
    noteCount: customer.notes?.length ?? 0,
    tagCount: customer.tags?.length ?? 0,
    vehicleCount: customer.vehicles?.length ?? 0
  };
}

export function getCustomerConsumptionTrendRows(customer: CustomerArchiveLike) {
  const trend = customer.archiveSummary?.consumption?.trend ?? [];
  const maxAmount = Math.max(...trend.map((item) => item.totalAmountCents), 0);

  return trend.map((item) => ({
    month: item.month,
    orderCountLabel: `${item.orderCount} 次`,
    totalAmountLabel: formatCurrency(item.totalAmountCents),
    paidAmountLabel: formatCurrency(item.paidAmountCents),
    outstandingAmountLabel: formatCurrency(item.outstandingCents),
    percentOfMax: maxAmount > 0 ? Math.round((item.totalAmountCents / maxAmount) * 100) : 0
  }));
}

export function getCustomerProfileNotes(customer: CustomerProfileNotesLike) {
  const sortedNotes = [...(customer.notes ?? [])].sort((left, right) =>
    String(right.createdAt).localeCompare(String(left.createdAt))
  );
  const preferences = sortedNotes.filter((note) => note.noteType === "PREFERENCE");
  const requirements = sortedNotes.filter((note) => note.noteType === "REQUIREMENT");
  const communications = sortedNotes.filter((note) => note.noteType === "COMMUNICATION" || !note.noteType);

  return {
    preferences,
    requirements,
    communications,
    latestPreference: preferences[0],
    latestRequirement: requirements[0]
  };
}

function formatCurrency(value?: number | null) {
  return `¥${((value ?? 0) / 100).toFixed(2)}`;
}
