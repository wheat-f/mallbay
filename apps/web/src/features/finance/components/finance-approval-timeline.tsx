"use client";

import { Empty, Timeline, Typography } from "antd";
import { getAuditActorLabel } from "../display";
import { getFinanceApprovalNodeLabel } from "../display";
import type { FinanceApprovalRecord } from "../api";

export function FinanceApprovalTimeline({ records }: { records: FinanceApprovalRecord[] }) {
  if (!records.length) return <Empty description="暂无审批记录" />;
  return <Timeline items={records.map((record) => ({
    children: <div><Typography.Text strong>{getFinanceApprovalNodeLabel(record.node)}</Typography.Text><div>{record.action} · {getAuditActorLabel({ actor: record.operator ?? undefined })}</div>{record.note ? <Typography.Paragraph type="secondary">{record.note}</Typography.Paragraph> : null}<Typography.Text type="secondary">{new Date(record.createdAt).toLocaleString("zh-CN")}</Typography.Text></div>
  }))} />;
}
