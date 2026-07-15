"use client";

import type { ExpenseApplicationSummary } from "@mallbay/shared";
import { Button, Empty, Space, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EyeOutlined } from "@ant-design/icons";
import { formatCentsAsYuan, getFinanceApprovalNodeLabel, getFinanceApprovalStatusLabel, getFinanceStatusTone } from "../display";

type Props = {
  rows: ExpenseApplicationSummary[];
  loading?: boolean;
  onOpen: (id: string) => void;
};

export function FinanceApplicationTable({ rows, loading, onOpen }: Props) {
  const columns: ColumnsType<ExpenseApplicationSummary> = [
    { title: "申请编号", dataIndex: "applicationNo", render: (value, row) => <strong>{value ?? row.id}</strong> },
    { title: "费用标题", dataIndex: "title" },
    { title: "申请人", render: (_, row) => (row as ExpenseApplicationSummary & { applicant?: { username?: string }; applicantId?: string }).applicant?.username ?? (row as ExpenseApplicationSummary & { applicantId?: string }).applicantId ?? "当前门店" },
    { title: "金额", dataIndex: "amountCents", render: (value) => formatCentsAsYuan(value) },
    { title: "当前节点", dataIndex: "currentNode", render: (value) => getFinanceApprovalNodeLabel(value) },
    { title: "状态", dataIndex: "status", render: (value) => <Tag color={getFinanceStatusTone(value)}>{getFinanceApprovalStatusLabel(value)}</Tag> },
    { title: "操作", key: "actions", render: (_, row) => <Space><Button icon={<EyeOutlined />} onClick={() => onOpen(row.id)}>查看详情</Button></Space> }
  ];
  return <Table rowKey="id" loading={loading} columns={columns} dataSource={rows} locale={{ emptyText: <Empty description="暂无财务申请" /> }} pagination={false} />;
}
