import type { ReportsService } from "../reports.service";

export const OPERATIONAL_REPORT = Symbol("OPERATIONAL_REPORT");
export type OperationalReport = Pick<ReportsService, "summary" | "operational" | "filterOptions">;
