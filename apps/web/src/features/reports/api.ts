import type { OperationalReport, OperationalReportFilterOptions, OperationalReportFilters, ReportSummary } from "@mallbay/shared";
import { request } from "../../lib/request";

export const reportsApi = {
  summary: (storeId?: string) =>
    request<ReportSummary>(`/reports/summary${toQueryString({ storeId })}`),
  operational: (query: OperationalReportFilters) =>
    request<OperationalReport>(`/reports/operational${toQueryString(query)}`),
  filterOptions: (storeId?: string) =>
    request<OperationalReportFilterOptions>(`/reports/filter-options${toQueryString({ storeId })}`)
};

function toQueryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
