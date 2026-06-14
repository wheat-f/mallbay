"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { App, Button, Empty, Tag, Typography } from "antd";
import {
  CalendarOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FormOutlined,
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
  leaveType: "REST" | "OUTSIDE";
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
  { value: "REST", label: "休息" },
  { value: "OUTSIDE", label: "外出施工" }
];

export default function ConstructionLeavesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<LeaveFormValues>({
    startDate: "",
    endDate: "",
    leaveType: "REST",
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
      setFormValues({ startDate: "", endDate: "", leaveType: "REST", reason: "" });
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
    <ConstructionMobileShell title="请假申请" subtitle="提交休息或外出状态，方便主管派单" active="leaves">
      <div className="construction-leave-workspace">
        <section className="construction-leave-summary">
          <div>
            <Tag>本店申请</Tag>
            <Typography.Title level={2}>{pendingCount} 条待处理</Typography.Title>
            <p>提交后主管可在施工排班和派单时避开不可用人员。</p>
          </div>
          <FormOutlined />
        </section>

        <section className="construction-leave-form-card">
          <div className="construction-mobile-section-head">
            <div>
              <h2>新增申请</h2>
              <p>休息走请假申请；外出施工用于临时标记不可店内派单。</p>
            </div>
          </div>
          <form className="construction-leave-native-form" onSubmit={handleSubmit}>
            <label>
              <span>时间范围</span>
              <div className="construction-leave-date-range">
                <input
                  type="date"
                  value={formValues.startDate}
                  onChange={(event) => setFormValues((current) => ({ ...current, startDate: event.target.value }))}
                />
                <input
                  type="date"
                  value={formValues.endDate}
                  onChange={(event) => setFormValues((current) => ({ ...current, endDate: event.target.value }))}
                />
              </div>
            </label>
            <label>
              <span>类型</span>
              <select
                value={formValues.leaveType}
                onChange={(event) =>
                  setFormValues((current) => ({ ...current, leaveType: event.target.value as LeaveFormValues["leaveType"] }))
                }
              >
                {leaveTypeOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>说明</span>
              <textarea
                rows={3}
                placeholder="例如休息原因、外出施工地址或主管沟通记录"
                value={formValues.reason}
                onChange={(event) => setFormValues((current) => ({ ...current, reason: event.target.value }))}
              />
            </label>
            <Button type="primary" icon={<SendOutlined />} htmlType="submit" loading={createLeaveMutation.isPending} block>
              提交申请
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
