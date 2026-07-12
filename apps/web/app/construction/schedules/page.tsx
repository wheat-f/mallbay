"use client";

import { useMemo, useState } from "react";
import { App, Button, Card, DatePicker, Empty, Form, Input, Select, Space, Statistic, Table, Tag, Typography } from "antd";
import { ClockCircleOutlined, EnvironmentOutlined, LeftOutlined, RightOutlined, UserOutlined } from "@ant-design/icons";
import { getWorkerScheduleStatusLabel } from "@mallbay/shared";
import type { ScheduleStatus, ScheduleSummary } from "@mallbay/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

const scheduleStatusOptions = [
  { value: "WORKING", label: "店内排班" },
  { value: "OUTSIDE", label: "外出施工" },
  { value: "REST", label: "休息" }
] satisfies Array<{ value: ScheduleStatus; label: string }>;

const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];

export default function ConstructionSchedulesPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(dayjs());
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
    mutationFn: (values: { date: dayjs.Dayjs; status: ScheduleStatus; note?: string }) => {
      if (!storeId || !workerId) throw new Error("缺少门店或施工人员信息");
      return constructionApi.upsertSchedule({
        storeId,
        workerId,
        date: values.date.format("YYYY-MM-DD"),
        status: values.status,
        note: values.note
      });
    },
    onSuccess: async () => {
      message.success("排班状态已保存");
      await queryClient.invalidateQueries({ queryKey: ["construction-schedules", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const rows = useMemo(() => (schedulesQuery.data ?? []) as ScheduleSummary[], [schedulesQuery.data]);
  const myRows = useMemo(() => rows.filter((item) => item.workerId === workerId), [rows, workerId]);
  const workingCount = rows.filter((item) => item.status === "WORKING").length;
  const outsideCount = rows.filter((item) => item.status === "OUTSIDE").length;
  const restCount = rows.filter((item) => item.status === "REST").length;

  const handleDateSelect = (value: dayjs.Dayjs) => {
    setDate(value);
    form.setFieldsValue({ date: value });
  };

  return (
    <div className="management-page worker-schedule-page">
      <StorePageHeader title="我的排班" description="查看周排班、当日安排和本人出勤状态">
        <Space wrap>
          <Button onClick={() => router.push("/construction/leaves")}>提交请假申请</Button>
          <Button type="primary" onClick={() => router.push("/construction/tasks")}>查看我的任务</Button>
        </Space>
      </StorePageHeader>

      <section className="worker-schedule-summary">
        <Card><Statistic title="当日排班" value={rows.length} suffix="条" /></Card>
        <Card><Statistic title="店内施工" value={workingCount} suffix="人" /></Card>
        <Card><Statistic title="外出施工" value={outsideCount} suffix="人" /></Card>
        <Card><Statistic title="休息/请假" value={restCount} suffix="人" /></Card>
      </section>

      <section className="worker-schedule-grid">
        <div className="worker-schedule-main">
          <Card className="construction-schedule-week worker-schedule-week-card">
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
          </Card>

          <Card className="construction-schedule-task-section" title={`当日排班 (${rows.length})`} extra={<Tag>{dateValue}</Tag>}>
            <Table<ScheduleSummary>
              rowKey="id"
              loading={schedulesQuery.isLoading}
              dataSource={rows}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无排班" /> }}
              columns={[
                {
                  title: "状态",
                  dataIndex: "status",
                  render: (status: ScheduleStatus) => (
                    <Tag className={`construction-schedule-status ${getScheduleStatusClassName(status)}`}>
                      {getWorkerScheduleStatusLabel(status)}
                    </Tag>
                  )
                },
                {
                  title: "安排",
                  render: (_, item) => getScheduleTaskTitle(item)
                },
                {
                  title: "人员",
                  render: (_, item) => getScheduleTaskMeta(item, workerId).person
                },
                {
                  title: "说明",
                  render: (_, item) => getScheduleTaskMeta(item, workerId).note
                },
                {
                  title: "操作",
                  render: (_, item) => (
                    <Button type={item.workerId === workerId ? "primary" : "default"} onClick={() => router.push("/construction/tasks")}>
                      {item.workerId === workerId ? "查看任务" : "查看排班"}
                    </Button>
                  )
                }
              ]}
            />

            <div className="construction-schedule-card-list worker-schedule-mobile-cards">
              {rows.map((item) => {
                const taskMeta = getScheduleTaskMeta(item, workerId);
                return (
                  <article key={item.id} className="construction-schedule-card construction-schedule-task-card">
                    <div className="construction-schedule-card-head construction-schedule-task-main">
                      <div>
                        <Tag className={`construction-schedule-status ${getScheduleStatusClassName(item.status)}`}>
                          {getWorkerScheduleStatusLabel(item.status)}
                        </Tag>
                        <Typography.Title level={3}>{getScheduleTaskTitle(item)}</Typography.Title>
                      </div>
                      <span>{getScheduleTaskBadge(item, workerId)}</span>
                    </div>
                    <div className="construction-schedule-card-meta construction-schedule-task-meta">
                      <span><ClockCircleOutlined /> {taskMeta.time}</span>
                      <span><UserOutlined /> {taskMeta.person}</span>
                      <span className="construction-schedule-card-note"><EnvironmentOutlined /> {taskMeta.note}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </Card>
        </div>

        <aside className="worker-schedule-side">
          <Card className="construction-schedule-form-panel" title="登记我的状态">
            <p className="worker-schedule-side-copy">用于补充外出、休息或店内可施工状态。正式请假请走请假申请。</p>
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
                <Input.TextArea rows={4} placeholder="例如外出地址、休息原因或排班说明" />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={upsertMutation.isPending} block>
                保存排班状态
              </Button>
            </Form>
          </Card>

          <Card title="我的当日记录">
            {myRows.length === 0 ? (
              <Empty description="暂无我的排班" />
            ) : (
              <div className="operation-queue-list">
                {myRows.map((item) => (
                  <div key={item.id} className="operation-queue-item detail-list-item">
                    <div>
                      <Typography.Text strong>{item.date}</Typography.Text>
                      <div className="management-kpi-desc">{item.note ?? getScheduleStatusFallbackNote(item.status)}</div>
                    </div>
                    <Tag>{getWorkerScheduleStatusLabel(item.status)}</Tag>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </aside>
      </section>
    </div>
  );
}

function getScheduleStatusClassName(status: ScheduleStatus) {
  if (status === "WORKING") return "is-working";
  if (status === "OUTSIDE") return "is-outside";
  return "is-rest";
}

function getScheduleStatusFallbackNote(status: ScheduleStatus) {
  if (status === "OUTSIDE") return "外出施工，具体地址以派单信息为准";
  if (status === "REST") return "休息或请假中";
  if (status === "WORKING") return "店内排班";
  return "排班说明待确认";
}

function getScheduleTaskTitle(item: ScheduleSummary) {
  const note = item.note?.trim();
  if (!note) return getScheduleStatusFallbackNote(item.status);
  const firstPart = splitScheduleNote(note)[0] ?? note;
  return firstPart.replace(/\s*\d{1,2}:\d{2}.*$/, "").trim() || note;
}

function getScheduleTaskMeta(item: ScheduleSummary, currentWorkerId?: string) {
  const note = item.note?.trim() ?? "";
  const parts = splitScheduleNote(note);
  const time = parts.find((part) => /\d{1,2}:\d{2}/.test(part))?.match(/\d{1,2}:\d{2}/)?.[0]
    ?? note.match(/\d{1,2}:\d{2}/)?.[0]
    ?? dayjs(item.date).format("MM月DD日");
  const person = parts.find((part) => /先生|女士|客户|车主/.test(part))
    ?? (item.workerId === currentWorkerId ? "我的任务" : item.worker?.nickname ?? item.worker?.username ?? "同组施工");
  const noteText = parts.find((part) => part !== person && part !== time && part !== getScheduleTaskTitle(item))
    ?? note
    ?? getScheduleStatusFallbackNote(item.status);

  return {
    time,
    person,
    note: noteText
  };
}

function getScheduleTaskBadge(item: ScheduleSummary, currentWorkerId?: string) {
  if (item.status === "WORKING") return item.workerId === currentWorkerId ? "施工中" : "待协作";
  if (item.status === "OUTSIDE") return "待接单";
  return "休息";
}

function splitScheduleNote(note: string) {
  return note.split(/[|｜,，]/).map((part) => part.trim()).filter(Boolean);
}
