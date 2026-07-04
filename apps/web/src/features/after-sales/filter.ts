type AfterSaleFilterOrder = {
  orderNo?: string | null;
  customer?: {
    name?: string | null;
    personalName?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
    phone?: string | null;
  } | null;
  vehicle?: {
    plateNo?: string | null;
    carPlate?: string | null;
    vin?: string | null;
  } | null;
  warranty?: {
    warrantyNo?: string | null;
  } | null;
};

export type AfterSaleFilterRow = {
  id: string;
  description?: string | null;
  warranty?: {
    warrantyNo?: string | null;
  } | null;
  order?: AfterSaleFilterOrder | null;
};

export type AfterSaleQuickFilters = {
  keyword?: string;
  customerName?: string;
  vin?: string;
  phone?: string;
  warrantyNo?: string;
};

export function filterAfterSalesRows<T extends AfterSaleFilterRow>(rows: T[], filters: AfterSaleQuickFilters): T[] {
  const keyword = normalizeFilterValue(filters.keyword);
  const customerName = normalizeFilterValue(filters.customerName);
  const vin = normalizeFilterValue(filters.vin);
  const phone = normalizeFilterValue(filters.phone);
  const warrantyNo = normalizeFilterValue(filters.warrantyNo);

  if (!keyword && !customerName && !vin && !phone && !warrantyNo) return rows;

  return rows.filter((row) => {
    const order = row.order;
    if (keyword && !matchesAny(keyword, [
      row.description,
      order?.orderNo,
      order?.customer?.name,
      order?.customer?.personalName,
      order?.customer?.companyName,
      order?.customer?.contactPerson,
      order?.customer?.phone,
      order?.vehicle?.plateNo,
      order?.vehicle?.carPlate,
      order?.vehicle?.vin,
      order?.warranty?.warrantyNo,
      row.warranty?.warrantyNo
    ])) {
      return false;
    }
    if (customerName && !matchesAny(customerName, [
      order?.customer?.name,
      order?.customer?.personalName,
      order?.customer?.companyName,
      order?.customer?.contactPerson
    ])) {
      return false;
    }
    if (vin && !matchesAny(vin, [order?.vehicle?.vin])) return false;
    if (phone && !matchesAny(phone, [order?.customer?.phone])) return false;
    if (warrantyNo && !matchesAny(warrantyNo, [order?.warranty?.warrantyNo, row.warranty?.warrantyNo])) return false;
    return true;
  });
}

function normalizeFilterValue(value?: string) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function matchesAny(needle: string, values: Array<string | null | undefined>) {
  return values.some((value) => value?.toLocaleLowerCase().includes(needle));
}
