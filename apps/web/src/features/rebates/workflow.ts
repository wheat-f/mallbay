import type { RebateStatus, RebateSummary } from "@mallbay/shared";

export type RebateWorkflowSectionKey = "application" | "review" | "finance" | "payout" | "report";

export type RebateWorkflowStep = {
  key: RebateWorkflowSectionKey;
  label: string;
  title: string;
  description: string;
  detailTitle: string;
  detailDescription: string;
  emptyText: string;
  statuses: RebateStatus[] | "ALL";
};

export const REBATE_WORKFLOW_TABS: RebateWorkflowStep[] = [
  {
    key: "application",
    label: "返利申请",
    title: "返利申请登记",
    description: "创建返利申请，并查看所有返利单的当前进度。",
    detailTitle: "申请详情",
    detailDescription: "核对订单、客户、金额和返利原因；待审核的申请进入业务审核队列。",
    emptyText: "暂无返利申请，可从已完成且已收齐的订单创建。",
    statuses: "ALL"
  },
  {
    key: "review",
    label: "返利审核",
    title: "业务审核队列",
    description: "处理已提交但尚未业务审核的返利申请。",
    detailTitle: "业务审核详情",
    detailDescription: "门店业务负责人确认返利原因和金额，审核通过后流转给财务审批。",
    emptyText: "暂无待业务审核返利。",
    statuses: ["APPLIED"]
  },
  {
    key: "finance",
    label: "财务审批",
    title: "财务审批队列",
    description: "复核业务已通过的返利金额、订单收款和发放方式。",
    detailTitle: "财务审批详情",
    detailDescription: "财务审批通过后，返利单进入待发放队列。",
    emptyText: "暂无待财务审批返利。",
    statuses: ["REVIEWED"]
  },
  {
    key: "payout",
    label: "返利发放",
    title: "待发放队列",
    description: "对已审批返利进行现金发放或抵扣确认，并记录发放备注。",
    detailTitle: "发放确认",
    detailDescription: "核对转账凭证或抵扣确认单，确认后生成返利发放记录。",
    emptyText: "暂无待发放返利。",
    statuses: ["APPROVED"]
  },
  {
    key: "report",
    label: "返利报表",
    title: "返利记录报表",
    description: "查看全部返利记录、状态分布和发放结果。",
    detailTitle: "返利记录详情",
    detailDescription: "用于追踪返利状态、原因、金额和后续财务处理结果。",
    emptyText: "暂无返利记录。",
    statuses: "ALL"
  }
];

export function getRebateWorkflowStep(key: RebateWorkflowSectionKey) {
  return REBATE_WORKFLOW_TABS.find((item) => item.key === key) ?? REBATE_WORKFLOW_TABS[0];
}

export function getRebateRowsForWorkflow(rows: RebateSummary[], key: RebateWorkflowSectionKey) {
  const step = getRebateWorkflowStep(key);
  if (step.statuses === "ALL") return rows;
  return rows.filter((row) => step.statuses.includes(row.status));
}

export function getRebateWorkflowCounts(rows: RebateSummary[]) {
  return {
    application: rows.length,
    review: rows.filter((row) => row.status === "APPLIED").length,
    finance: rows.filter((row) => row.status === "REVIEWED").length,
    payout: rows.filter((row) => row.status === "APPROVED").length,
    report: rows.length,
    paid: rows.filter((row) => row.status === "PAID").length,
    rejected: rows.filter((row) => row.status === "REJECTED").length
  };
}
