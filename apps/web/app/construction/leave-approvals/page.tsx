"use client";

import { App, Avatar, Button, Card, Empty, Input, Modal, Space, Table, Tag } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, SearchOutlined, UserSwitchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { constructionApi } from "../../../src/lib/api";
import type { LeaveRequestSummary } from "../../../src/features/construction/api";
import {
  buildLeaveApprovalCounts,
  formatLeaveDateRange,
  getLeaveApprovalRows,
  getLeaveRequestStatusColor,
  getLeaveRequestStatusLabel,
  getLeaveWorkerLabel,
  type LeaveApprovalQueue
} from "../../../src/features/construction/leave-approvals";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

const LEAVE_APPROVAL_TABS: Array<{ key: LeaveApprovalQueue; label: string }> = [
  { key: "pending", label: "待审批" },
  { key: "approved", label: "已批准" },
  { key: "rejected", label: "已驳回" },
  { key: "all", label: "全部记录" }
];

export default function ConstructionLeaveApprovalsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [activeQueue, setActiveQueue] = useState<LeaveApprovalQueue>("pending");
  const [keyword, setKeyword] = useState("");
  const [reviewing, setReviewing] = useState<{ row: LeaveRequestSummary; status: "APPROVED" | "REJECTED" }>();
  const [reviewNote, setReviewNote] = useState("");

  const leavesQuery = useQuery({
    queryKey: ["construction-leave-approvals", storeId],
    queryFn: () => constructionApi.leaves(storeId!),
    enabled: Boolean(storeId)
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; status: "APPROVED" | "REJECTED"; reviewNote?: string }) =>
      constructionApi.updateLeave(payload.id, { status: payload.status, reviewNote: payload.reviewNote }),
    onSuccess: async (_, payload) => {
      message.success(payload.status === "APPROVED" ? "请假申请已批准" : "请假申请已驳回");
      await queryClient.invalidateQueries({ queryKey: ["construction-leave-approvals", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const rows = useMemo(() => leavesQuery.data ?? [], [leavesQuery.data]);
  const counts = useMemo(() => buildLeaveApprovalCounts(rows), [rows]);
  const visibleRows = useMemo(() => getLeaveApprovalRows(rows, activeQueue, keyword), [activeQueue, keyword, rows]);

  const openReview = (row: LeaveRequestSummary, status: "APPROVED" | "REJECTED") => {
    setReviewNote("");
    setReviewing({ row, status });
  };
  const submitReview = () => {
    if (!reviewing) return;
    if (reviewing.status === "REJECTED" && !reviewNote.trim()) {
      message.warning("驳回时请填写审批意见");
      return;
    }
    updateMutation.mutate({ id: reviewing.row.id, status: reviewing.status, reviewNote: reviewNote.trim() || undefined }, {
      onSuccess: () => setReviewing(undefined)
    });
  };

  return (
    <div className="management-page construction-leave-approval-page">
      <StorePageHeader title="请假审批" description="集中处理施工人员请假申请，避免派单时误选不可用人员。" />

      <section className="construction-leave-approval-summary">
        {[
          ["待审批", counts.pending, "需要主管确认"],
          ["已批准", counts.approved, "已锁定不可派单"],
          ["已驳回", counts.rejected, "不影响排班"],
          ["全部记录", counts.all, "历史申请留痕"]
        ].map(([label, value, description]) => (
          <Card key={label} className="management-kpi-card">
            <div className="management-kpi-label">{label}</div>
            <div className="management-kpi-value">{value}</div>
            <div className="management-kpi-desc">{description}</div>
          </Card>
        ))}
      </section>

      <Card className="construction-leave-approval-card">
        <div className="construction-leave-approval-toolbar">
          <div className="construction-leave-approval-tabs" role="tablist" aria-label="请假审批队列">
            {LEAVE_APPROVAL_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeQueue === tab.key ? "is-active" : undefined}
                onClick={() => setActiveQueue(tab.key)}
              >
                {tab.label}
                <em>{counts[tab.key]}</em>
              </button>
            ))}
          </div>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            className="construction-leave-approval-search"
            placeholder="搜索师傅、请假日期或事由"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        <div className="construction-leave-approval-grid">
          {visibleRows.length > 0 ? (
            visibleRows.map((row) => (
              <article key={row.id} className="construction-leave-approval-mobile-card">
                <div className="construction-leave-approval-worker">
                  <Avatar src={row.worker?.avatarUrl ?? undefined}>{getLeaveWorkerAvatar(row)}</Avatar>
                  <div>
                    <strong>{getLeaveWorkerLabel(row)}</strong>
                    <span>{formatLeaveDateRange(row.startDate, row.endDate)}</span>
                  </div>
                  <Tag color={getLeaveRequestStatusColor(row.status)}>{getLeaveRequestStatusLabel(row.status)}</Tag>
                </div>
                <p>{row.reason || "未填写请假事由"}</p>
                <div className="construction-leave-approval-actions">
                  <Button
                    size="small"
                    icon={<CheckCircleOutlined />}
                    disabled={row.status !== "PENDING" || updateMutation.isPending}
                    loading={updateMutation.isPending}
                    onClick={() => openReview(row, "APPROVED")}
                  >
                    批准
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<CloseCircleOutlined />}
                    disabled={row.status !== "PENDING" || updateMutation.isPending}
                    onClick={() => openReview(row, "REJECTED")}
                  >
                    驳回
                  </Button>
                </div>
              </article>
            ))
          ) : (
            <Empty description={storeId ? "暂无请假申请" : "当前账号未加入门店"} />
          )}
        </div>

        <Table<LeaveRequestSummary>
          className="construction-leave-approval-table"
          rowKey={(record) => record.id}
          loading={leavesQuery.isLoading}
          dataSource={visibleRows}
          pagination={false}
          locale={{ emptyText: <Empty description={storeId ? "暂无请假申请" : "当前账号未加入门店"} /> }}
          columns={[
            {
              title: "施工人员",
              key: "worker",
              render: (_, record) => (
                <Space>
                  <Avatar src={record.worker?.avatarUrl ?? undefined}>{getLeaveWorkerAvatar(record)}</Avatar>
                  <div>
                    <div className="construction-leave-approval-name">{getLeaveWorkerLabel(record)}</div>
                    <span className="construction-leave-approval-note">{record.workerId ? "施工团队成员" : "人员待确认"}</span>
                  </div>
                </Space>
              )
            },
            {
              title: "请假日期",
              key: "dateRange",
              render: (_, record) => formatLeaveDateRange(record.startDate, record.endDate)
            },
            {
              title: "事由",
              dataIndex: "reason",
              render: (reason?: string | null) => reason || "未填写请假事由"
            },
            {
              title: "审批意见",
              dataIndex: "reviewNote",
              render: (note?: string | null) => note || "—"
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (status: LeaveRequestSummary["status"]) => (
                <Tag color={getLeaveRequestStatusColor(status)}>{getLeaveRequestStatusLabel(status)}</Tag>
              )
            },
            {
              title: "操作",
              key: "actions",
              render: (_, record) => (
                <Space className="construction-leave-approval-actions">
                  <Button
                    size="small"
                    icon={<CheckCircleOutlined />}
                    disabled={record.status !== "PENDING" || updateMutation.isPending}
                    loading={updateMutation.isPending}
                    onClick={() => openReview(record, "APPROVED")}
                  >
                    批准
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<CloseCircleOutlined />}
                    disabled={record.status !== "PENDING" || updateMutation.isPending}
                    onClick={() => openReview(record, "REJECTED")}
                  >
                    驳回
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Modal
        open={Boolean(reviewing)}
        title={reviewing?.status === "APPROVED" ? "批准请假申请" : "驳回请假申请"}
        okText={reviewing?.status === "APPROVED" ? "确认批准" : "确认驳回"}
        cancelText="取消"
        okButtonProps={{ danger: reviewing?.status === "REJECTED", loading: updateMutation.isPending }}
        onCancel={() => setReviewing(undefined)}
        onOk={submitReview}
      >
        <p>{reviewing ? `${getLeaveWorkerLabel(reviewing.row)}：${formatLeaveDateRange(reviewing.row.startDate, reviewing.row.endDate)}` : ""}</p>
        <Input.TextArea
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          rows={4}
          placeholder={reviewing?.status === "REJECTED" ? "请填写驳回原因（必填）" : "可填写批准说明"}
        />
      </Modal>

      <section className="construction-leave-approval-note-panel">
        <UserSwitchOutlined />
        <div>
          <strong>审批影响</strong>
          <p>批准后，对应日期会在派单时作为不可用约束；驳回后不会影响施工人员排班。</p>
        </div>
      </section>
    </div>
  );
}

function getLeaveWorkerAvatar(row: LeaveRequestSummary) {
  return (row.worker?.nickname ?? row.worker?.username ?? "施").charAt(0).toUpperCase();
}
