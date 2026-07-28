"use client";

import { useMemo } from "react";
import { App, Button, Card, DatePicker, Descriptions, Empty, Form, Input, Select, Statistic, Table, Tag } from "antd";
import { CalendarOutlined, InfoCircleOutlined, SendOutlined } from "@ant-design/icons";
import { getWorkerLeaveStatusLabel } from "@mallbay/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { dictionaryApi } from "../../../src/features/settings/api";

type LeaveFormValues = {
  dateRange?: [Dayjs, Dayjs];
  leaveType: string;
  reason?: string;
};

type LeaveRequestRow = {
  id: string;
  workerId?: string;
  startDate: string;
  endDate: string;
  status?: string;
  leaveType?: string | null;
  reason?: string | null;
  reviewNote?: string | null;
  createdAt?: string;
  worker?: { id: string; username: string; nickname?: string | null } | null;
};

const defaultLeaveTypeOptions = [
  { value: "PERSONAL", label: "事假" },
  { value: "SICK", label: "病假" },
  { value: "COMP_TIME", label: "调休" },
  { value: "OTHER", label: "其他" }
];

export default function ConstructionLeavesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<LeaveFormValues>();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const workerId = user?.id;
  const currentMember = user?.storeMember;

  const dictionariesQuery = useQuery({
    queryKey: ["settings-dictionaries", storeId],
    queryFn: () => dictionaryApi.list(storeId!),
    enabled: Boolean(storeId),
    staleTime: 60_000
  });
  const leaveTypeOptions = useMemo(() => {
    const dictionary = dictionariesQuery.data?.find((item) => item.code === "LEAVE_TYPE");
    const normalized = dictionary?.dictionaryItems?.filter((item) => item.status === "ACTIVE").map((item) => ({ value: item.code, label: item.name })) ?? [];
    return normalized.length > 0 ? normalized : defaultLeaveTypeOptions;
  }, [dictionariesQuery.data]);

  const leavesQuery = useQuery({
    queryKey: ["construction-leaves", storeId],
    queryFn: () => constructionApi.leaves(storeId!),
    enabled: Boolean(storeId)
  });

  const createLeaveMutation = useMutation({
    mutationFn: (values: LeaveFormValues) => {
      if (!storeId || !workerId) throw new Error("缺少门店或施工人员信息");
      const [startDate, endDate] = values.dateRange ?? [];
      if (!startDate || !endDate) throw new Error("请选择时间范围");
      return constructionApi.createLeave({
        storeId,
        workerId,
        startDate: startDate.startOf("day").toISOString(),
        endDate: endDate.endOf("day").toISOString(),
        leaveType: values.leaveType,
        reason: values.reason?.trim() || undefined
      });
    },
    onSuccess: async () => {
      message.success("请假申请已提交");
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["construction-leaves", storeId] });
      document.getElementById("leave-history")?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const allRows = useMemo(() => (leavesQuery.data ?? []) as LeaveRequestRow[], [leavesQuery.data]);
  const rows = useMemo(
    () => allRows.filter((item) => item.workerId === workerId || item.worker?.id === workerId),
    [allRows, workerId]
  );
  const pendingCount = rows.filter((item) => item.status === "PENDING").length;
  const approvedCount = rows.filter((item) => item.status === "APPROVED").length;

  return (
    <div className="management-page worker-leave-page construction-leave-workspace">
      <StorePageHeader title="请假申请" description="提交施工人员请假申请，查看审批状态和历史记录" />

      <section className="worker-leave-summary">
        <Card>
          <Statistic title="我的申请" value={rows.length} suffix="条" />
        </Card>
        <Card>
          <Statistic title="待审批" value={pendingCount} suffix="条" />
        </Card>
        <Card>
          <Statistic title="已批准" value={approvedCount} suffix="条" />
        </Card>
      </section>

      <section className="worker-leave-grid">
        <Card className="construction-leave-application-panel worker-leave-form-card" title="提交请假申请">
          <p className="worker-leave-card-desc">审批通过后，请假日期会自动锁定为不可派单。</p>
          <Descriptions size="small" column={1} className="worker-leave-applicant-card" title="申请人信息">
            <Descriptions.Item label="申请人">{user?.nickname ?? user?.username ?? "当前登录人员"}</Descriptions.Item>
            <Descriptions.Item label="岗位">{getPositionLabel(currentMember?.position)}</Descriptions.Item>
          </Descriptions>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ leaveType: leaveTypeOptions[0]?.value ?? "PERSONAL" }}
            onFinish={(values) => createLeaveMutation.mutate(values)}
          >
            <Form.Item name="dateRange" label="请假时间" rules={[{ required: true, message: "请选择时间范围" }]}>
              <DatePicker.RangePicker className="worker-leave-range-picker" />
            </Form.Item>
            <Form.Item name="leaveType" label="请假类型" rules={[{ required: true, message: "请选择请假类型" }]}>
              <Select loading={dictionariesQuery.isLoading} options={leaveTypeOptions} />
            </Form.Item>
            <Form.Item name="reason" label="请假事由">
              <Input.TextArea rows={5} placeholder="请输入详细原因..." />
            </Form.Item>
            <div className="construction-leave-rule-card">
              <InfoCircleOutlined />
              <p>已批准的休息会阻止同日派单；外出施工安排请同步写入排班页，便于主管查看当日工位。</p>
            </div>
            <Button type="primary" icon={<SendOutlined />} htmlType="submit" loading={createLeaveMutation.isPending}>
              提交请假申请
            </Button>
          </Form>
        </Card>

        <Card id="leave-history" className="construction-leave-history-card worker-leave-history-card" title="申请记录">
          <Table<LeaveRequestRow>
            rowKey="id"
            loading={leavesQuery.isLoading}
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: <Empty description="暂无请假申请" /> }}
            columns={[
              {
                title: "申请人",
                key: "worker",
                render: (_, row) => row.worker?.nickname ?? row.worker?.username ?? "当前登录人员"
              },
              {
                title: "类型",
                dataIndex: "leaveType",
                render: (leaveType?: string | null) => getLeaveTypeLabel(leaveType, leaveTypeOptions)
              },
              {
                title: "请假时间",
                key: "dateRange",
                render: (_, row) => formatLeaveDateRange(row.startDate, row.endDate)
              },
              {
                title: "审批状态",
                dataIndex: "status",
                render: (status?: string) => <Tag color={getLeaveStatusColor(status)}>{getWorkerLeaveStatusLabel(status ?? "PENDING")}</Tag>
              },
              {
                title: "审批意见",
                dataIndex: "reviewNote",
                render: (reviewNote?: string | null) => reviewNote || "—"
              },
              {
                title: "请假事由",
                dataIndex: "reason",
                render: (reason?: string | null) => reason || "未填写说明"
              },
              {
                title: "提交时间",
                dataIndex: "createdAt",
                render: (createdAt?: string) => formatCreatedAt(createdAt)
              }
            ]}
          />
        </Card>
      </section>

      <section className="construction-leave-tip-card worker-leave-tip-card">
        <CalendarOutlined />
        <div>
          <strong>派单提醒</strong>
          <p>审批通过的请假会进入施工派单可用性判断；若需要调整已批准记录，请联系施工主管在请假审批页处理。</p>
        </div>
      </section>
    </div>
  );
}

function formatLeaveDateRange(startDate: string, endDate: string) {
  return `${dayjs(startDate).format("MM月DD日")} - ${dayjs(endDate).format("MM月DD日")}`;
}

function formatCreatedAt(createdAt?: string) {
  return createdAt ? dayjs(createdAt).format("MM-DD HH:mm") : "刚刚";
}

function getLeaveStatusColor(status?: string) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "error";
  return "processing";
}

function getPositionLabel(position?: string) {
  if (position === "CONSTRUCTION") return "施工员";
  if (position === "APPRENTICE") return "施工学徒";
  if (position === "SCHEDULER") return "施工主管";
  return "施工团队成员";
}

function getLeaveTypeLabel(value: string | null | undefined, options: Array<{ value: string; label: string }>) {
  return options.find((item) => item.value === value)?.label ?? value ?? "其他";
}
