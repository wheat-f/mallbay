"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { App, Button, Empty, Tag } from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  SendOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { ConstructionMobileShell } from "../../../src/features/construction/mobile-shell";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";

type LeaveFormValues = {
  startDate: string;
  endDate: string;
  leaveType: "PERSONAL" | "SICK" | "ANNUAL" | "OTHER";
  reason: string;
};

type LeaveRequestRow = {
  id: string;
  startDate: string;
  endDate: string;
  status?: string;
  reason?: string | null;
  createdAt?: string;
};

const leaveTypeOptions = [
  { value: "PERSONAL", label: "事假" },
  { value: "SICK", label: "病假" },
  { value: "ANNUAL", label: "年假" },
  { value: "OTHER", label: "其他" }
] satisfies Array<{ value: LeaveFormValues["leaveType"]; label: string }>;

export default function ConstructionLeavesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<LeaveFormValues>({
    startDate: "",
    endDate: "",
    leaveType: "PERSONAL",
    reason: ""
  });
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const workerId = user?.id;

  const leavesQuery = useQuery({
    queryKey: ["construction-leaves", storeId],
    queryFn: () => constructionApi.leaves(storeId!),
    enabled: Boolean(storeId)
  });

  const createLeaveMutation = useMutation({
    mutationFn: (values: LeaveFormValues) =>
      constructionApi.createLeave({
        storeId: storeId!,
        workerId: workerId!,
        startDate: dayjs(values.startDate).startOf("day").toISOString(),
        endDate: dayjs(values.endDate).endOf("day").toISOString(),
        reason: formatLeaveReason(values)
      }),
    onSuccess: async () => {
      message.success("请假申请已提交");
      setFormValues({ startDate: "", endDate: "", leaveType: "PERSONAL", reason: "" });
      await queryClient.invalidateQueries({ queryKey: ["construction-leaves", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const rows = useMemo(() => (leavesQuery.data ?? []) as LeaveRequestRow[], [leavesQuery.data]);
  const pendingCount = rows.filter((item) => item.status === "PENDING").length;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!storeId || !workerId) {
      message.error("缺少门店或施工人员信息");
      return;
    }
    if (!formValues.startDate || !formValues.endDate) {
      message.error("请选择时间范围");
      return;
    }
    if (dayjs(formValues.endDate).isBefore(dayjs(formValues.startDate), "day")) {
      message.error("结束日期不能早于开始日期");
      return;
    }
    createLeaveMutation.mutate(formValues);
  };

  return (
    <ConstructionMobileShell title="请假申请" subtitle="提交请假状态，方便主管派单" active="leaves" variant="calendar">
      <div className="construction-leave-workspace">
        <section className="construction-leave-application-panel">
          <div className="construction-mobile-section-head">
            <div>
              <h2>提交请假申请</h2>
              <p>审批通过后，请假日期会自动锁定为不可派单。</p>
            </div>
            <Tag>{pendingCount} 待处理</Tag>
          </div>
          <form className="construction-leave-native-form" onSubmit={handleSubmit}>
            <div className="construction-leave-field">
              <span>请假时间</span>
              <div className="construction-leave-date-card">
                <CalendarOutlined />
                <div className="construction-leave-date-range">
                  <input
                    aria-label="请假开始日期"
                    type="date"
                    value={formValues.startDate}
                    onChange={(event) => setFormValues((current) => ({ ...current, startDate: event.target.value }))}
                  />
                  <em>至</em>
                  <input
                    aria-label="请假结束日期"
                    type="date"
                    value={formValues.endDate}
                    onChange={(event) => setFormValues((current) => ({ ...current, endDate: event.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="construction-leave-field">
              <span>请假类型</span>
              <div className="construction-leave-type-pills">
                {leaveTypeOptions.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={formValues.leaveType === item.value}
                    className={formValues.leaveType === item.value ? "is-active" : undefined}
                    onClick={() => setFormValues((current) => ({ ...current, leaveType: item.value }))}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="construction-leave-field">
              <span>请假事由</span>
              <textarea
                rows={4}
                placeholder="请输入详细原因..."
                value={formValues.reason}
                onChange={(event) => setFormValues((current) => ({ ...current, reason: event.target.value }))}
              />
            </label>
            <div className="construction-leave-rule-card">
              <InfoCircleOutlined />
              <p>审批通过后，请假日期不可派单，系统将自动锁定。</p>
            </div>
            <Button type="primary" icon={<SendOutlined />} htmlType="submit" loading={createLeaveMutation.isPending} block>
              提交请假
            </Button>
          </form>
        </section>

        <section className="construction-leave-history-card">
          <div className="construction-mobile-section-head">
            <div>
              <h2>申请记录</h2>
              <p>用于派单可用性判断，审批状态会持续保留。</p>
            </div>
            <Tag>{rows.length} 条</Tag>
          </div>
          {rows.length === 0 ? (
            <Empty description="暂无请假申请" />
          ) : (
            <div className="construction-leave-history-list">
              {rows.map((item) => (
                <article key={item.id} className="construction-leave-history-item">
                  <div>
                    <Tag>{getLeaveStatusLabel(item.status)}</Tag>
                    <strong>{formatLeaveDateRange(item.startDate, item.endDate)}</strong>
                    <em>{item.reason || "未填写说明"}</em>
                  </div>
                  <span>
                    <CalendarOutlined /> {formatCreatedAt(item.createdAt)}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="construction-leave-tip-card">
          <ClockCircleOutlined />
          <div>
            <strong>派单提醒</strong>
            <p>
              已批准的休息会阻止同日派单；外出施工信息请同步写入排班页，便于主管查看当日工位。
            </p>
          </div>
          <EnvironmentOutlined />
        </section>
      </div>
    </ConstructionMobileShell>
  );
}

function formatLeaveReason(values: LeaveFormValues) {
  const typeLabel = leaveTypeOptions.find((item) => item.value === values.leaveType)?.label ?? "休息";
  const note = values.reason.trim();
  return note ? `${typeLabel}: ${note}` : typeLabel;
}

function getLeaveStatusLabel(status?: string) {
  if (status === "APPROVED") return "已批准";
  if (status === "REJECTED") return "已拒绝";
  return "待处理";
}

function formatLeaveDateRange(startDate: string, endDate: string) {
  return `${dayjs(startDate).format("MM月DD日")} - ${dayjs(endDate).format("MM月DD日")}`;
}

function formatCreatedAt(createdAt?: string) {
  return createdAt ? dayjs(createdAt).format("MM-DD HH:mm") : "刚刚";
}
