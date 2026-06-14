"use client";

import { useMemo, useState } from "react";
import { App, Button, DatePicker, Empty, Form, Input, Select, Tag, Typography } from "antd";
import {
  CalendarOutlined,
  EnvironmentOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  UserOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { ConstructionMobileShell } from "../../../src/features/construction/mobile-shell";
import type { ScheduleStatus, ScheduleSummary } from "@mallbay/shared";

const scheduleStatusOptions = [
  { value: "WORKING", label: "店内排班" },
  { value: "OUTSIDE", label: "外出施工" },
  { value: "REST", label: "休息" }
] satisfies Array<{ value: ScheduleStatus; label: string }>;

type ScheduleView = "schedule" | "leave" | "history";

const scheduleViewTabs: Array<{ key: ScheduleView; label: string }> = [
  { key: "schedule", label: "我的排班" },
  { key: "leave", label: "请假申请" },
  { key: "history", label: "历史记录" }
];

const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];

export default function ConstructionSchedulesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(dayjs());
  const [scheduleView, setScheduleView] = useState<ScheduleView>("schedule");
  const [form] = Form.useForm<{ date: dayjs.Dayjs; status: ScheduleStatus; note?: string }>();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const workerId = user?.id;
  const dateValue = date.format("YYYY-MM-DD");
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => date.startOf("week").add(index, "day")),
    [date]
  );
  const monthLabel = date.format("YYYY年M月");

  const schedulesQuery = useQuery({
    queryKey: ["construction-schedules", storeId, dateValue],
    queryFn: () => constructionApi.schedules({ storeId: storeId!, from: dateValue, to: dateValue }),
    enabled: Boolean(storeId)
  });

  const upsertMutation = useMutation({
    mutationFn: (values: { date: dayjs.Dayjs; status: ScheduleStatus; note?: string }) =>
      constructionApi.upsertSchedule({
        storeId: storeId!,
        workerId: workerId!,
        date: values.date.format("YYYY-MM-DD"),
        status: values.status,
        note: values.note
      }),
    onSuccess: async () => {
      message.success("排班已保存");
      await queryClient.invalidateQueries({ queryKey: ["construction-schedules", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const rows = useMemo(() => (schedulesQuery.data ?? []) as ScheduleSummary[], [schedulesQuery.data]);
  const workingCount = rows.filter((item) => item.status === "WORKING").length;
  const outsideCount = rows.filter((item) => item.status === "OUTSIDE").length;

  const handleDateSelect = (value: dayjs.Dayjs) => {
    setDate(value);
    form.setFieldsValue({ date: value });
  };

  const showLeaveForm = () => {
    setScheduleView("leave");
    form.setFieldsValue({ date, status: "REST" });
  };

  return (
    <ConstructionMobileShell title="我的排班" subtitle="查看当日安排，提交休息或外出状态" active="schedules">
      <div className="construction-schedule-tabs" role="tablist" aria-label="排班视图">
        {scheduleViewTabs.map((tab) => (
          <button
            key={tab.key}
            className={scheduleView === tab.key ? "is-active" : undefined}
            type="button"
            onClick={() => setScheduleView(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="construction-schedule-week">
        <div className="construction-schedule-week-head">
          <Typography.Title level={2}>{monthLabel}</Typography.Title>
          <div>
            <Button shape="circle" icon={<LeftOutlined />} onClick={() => handleDateSelect(date.subtract(7, "day"))} />
            <Button shape="circle" icon={<RightOutlined />} onClick={() => handleDateSelect(date.add(7, "day"))} />
          </div>
        </div>
        <div className="construction-schedule-week-grid">
          {weekLabels.map((label) => (
            <span key={label} className="construction-schedule-week-label">
              {label}
            </span>
          ))}
          {weekDays.map((day) => {
            const selected = day.isSame(date, "day");
            return (
              <button
                key={day.format("YYYY-MM-DD")}
                className={selected ? "construction-schedule-day is-active" : "construction-schedule-day"}
                type="button"
                onClick={() => handleDateSelect(day)}
              >
                <span>{day.date()}</span>
                {selected ? <i /> : null}
              </button>
            );
          })}
        </div>
      </section>

      {scheduleView === "schedule" ? (
        <section className="construction-mobile-panel construction-schedule-panel">
          <div className="construction-mobile-section-head">
            <div>
              <h2>当日排班 ({rows.length})</h2>
              <p>店内 {workingCount} 个，外出 {outsideCount} 个</p>
            </div>
            <Tag className="construction-schedule-date-tag">{dateValue}</Tag>
          </div>
        {rows.length === 0 ? (
          <Empty description="暂无排班" />
        ) : (
          <div className="construction-schedule-card-list">
            {rows.map((item) => (
              <article key={item.id} className="construction-schedule-card">
                <div className="construction-schedule-card-head">
                  <div>
                    <Tag className={`construction-schedule-status ${getScheduleStatusClassName(item.status)}`}>
                      {getScheduleStatusLabel(item.status)}
                    </Tag>
                    <Typography.Title level={3}>{item.worker?.nickname ?? item.worker?.username ?? "施工人员"}</Typography.Title>
                  </div>
                  <span>{item.workerId === workerId ? "本人" : "同组"}</span>
                </div>
                <div className="construction-schedule-card-meta">
                  <span>
                    <CalendarOutlined /> {item.date}
                  </span>
                  <span>
                    <UserOutlined /> {item.worker?.username ?? "未记录账号"}
                  </span>
                  <span className="construction-schedule-card-note">
                    <EnvironmentOutlined /> {item.note ?? getScheduleStatusFallbackNote(item.status)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
        </section>
      ) : null}

      {scheduleView === "leave" ? (
        <section className="construction-mobile-panel construction-schedule-form-panel">
          <div className="construction-mobile-section-head">
            <div>
              <h2>请假申请</h2>
              <p>当前阶段以休息排班记录请假意向，审批流后续接入。</p>
            </div>
          </div>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ date, status: "WORKING" }}
          onFinish={(values) => upsertMutation.mutate(values)}
        >
          <Form.Item name="date" label="日期" rules={[{ required: true, message: "请选择日期" }]}>
            <DatePicker className="w-full" allowClear={false} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
            <Select options={scheduleStatusOptions} />
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input.TextArea rows={3} placeholder="例如外出地址、休息原因或排班说明" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={upsertMutation.isPending} block>
            保存排班
          </Button>
        </Form>
        </section>
      ) : null}

      {scheduleView === "history" ? (
        <section className="construction-mobile-panel construction-schedule-panel">
          <div className="construction-mobile-section-head">
            <div>
              <h2>历史记录</h2>
              <p>先展示当前选择日期的排班记录，完整历史筛选后续接入。</p>
            </div>
          </div>
          {rows.length === 0 ? (
            <Empty description="暂无历史记录" />
          ) : (
            <div className="operation-queue-list">
              {rows.map((item) => (
                <div key={item.id} className="operation-queue-item detail-list-item">
                  <div>
                    <Typography.Text strong>{item.date}</Typography.Text>
                    <div className="management-kpi-desc">{item.note ?? getScheduleStatusFallbackNote(item.status)}</div>
                  </div>
                  <Tag>{getScheduleStatusLabel(item.status)}</Tag>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <button className="construction-leave-fab" type="button" onClick={showLeaveForm} aria-label="申请请假">
        <PlusOutlined />
      </button>
    </ConstructionMobileShell>
  );
}

function getScheduleStatusLabel(status: ScheduleStatus) {
  return scheduleStatusOptions.find((item) => item.value === status)?.label ?? status;
}

function getScheduleStatusClassName(status: ScheduleStatus) {
  if (status === "WORKING") return "is-working";
  if (status === "OUTSIDE") return "is-outside";
  return "is-rest";
}

function getScheduleStatusFallbackNote(status: ScheduleStatus) {
  if (status === "OUTSIDE") return "外出施工，具体地址以派单信息为准";
  if (status === "REST") return "休息或请假中";
  return "店内排班";
}
