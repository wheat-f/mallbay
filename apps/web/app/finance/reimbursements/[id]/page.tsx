"use client";
import {
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
} from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { financeApi } from "../../../../src/features/finance/api";
import { FinanceApprovalTimeline } from "../../../../src/features/finance/components/finance-approval-timeline";
import { FinanceAttachmentUpload } from "../../../../src/features/finance/components/finance-attachment-upload";
import {
  getFinanceApprovalStatusLabel,
  getFinanceStatusTone,
  formatCentsAsYuan,
} from "../../../../src/features/finance/display";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { orderApi } from "../../../../src/features/orders/api";

export default function ReimbursementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const storeId = useAuthStore((s) => s.user?.storeMember?.store.id);
  const client = useQueryClient();
  const { message } = App.useApp();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [form] = Form.useForm();
  const [payForm] = Form.useForm();
  const [withdrawForm] = Form.useForm();
  const [resubmitForm] = Form.useForm();
  const query = useQuery({
    queryKey: ["finance-reimbursement", id],
    queryFn: () => financeApi.reimbursement(id),
    enabled: Boolean(id),
  });
  const accounts = useQuery({
    queryKey: ["finance-accounts", storeId],
    queryFn: () => orderApi.paymentAccounts(storeId!),
    enabled: Boolean(storeId),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["finance-reimbursement", id] });
    void client.invalidateQueries({ queryKey: ["finance-reimbursements"] });
    void client.invalidateQueries({ queryKey: ["finance-overview"] });
    void client.invalidateQueries({ queryKey: ["finance-payment-records"] });
  };
  const review = useMutation({
    mutationFn: (v: { decision: "APPROVE" | "REJECT"; note?: string }) =>
      financeApi.reviewReimbursement(id, v),
    onSuccess: () => {
      message.success("审核结果已保存");
      setReviewOpen(false);
      refresh();
    },
  });
  const pay = useMutation({
    mutationFn: (v: {
      paymentAccountId: string;
      note?: string;
      paidAt?: string;
    }) => financeApi.payReimbursement(id, v),
    onSuccess: () => {
      message.success("报销已付款并生成资金流水");
      setPayOpen(false);
      payForm.resetFields();
      refresh();
    },
  });
  const withdraw = useMutation({
    mutationFn: (v: { note?: string }) =>
      financeApi.withdrawReimbursement(id, v.note),
    onSuccess: () => {
      message.success("报销申请已撤回");
      setWithdrawOpen(false);
      withdrawForm.resetFields();
      refresh();
    },
  });
  const resubmit = useMutation({
    mutationFn: (v: { title: string; amountCents: number; reason: string }) =>
      financeApi.resubmitReimbursement(id, v),
    onSuccess: () => {
      message.success("报销申请已重新提交");
      setResubmitOpen(false);
      resubmitForm.resetFields();
      refresh();
    },
  });
  const item = query.data;
  return (
    <div className="management-page">
      <Space>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push("/finance/reimbursements")}
        >
          返回报销审核
        </Button>
        <h1>报销申请详情</h1>
      </Space>
      {item ? (
        <>
          <Card
            title={item.applicationNo ?? item.id}
            extra={
              <Tag color={getFinanceStatusTone(item.status)}>
                {getFinanceApprovalStatusLabel(item.status)}
              </Tag>
            }
          >
            <Descriptions column={2}>
              <Descriptions.Item label="报销标题">
                {item.title}
              </Descriptions.Item>
              <Descriptions.Item label="金额">
                {formatCentsAsYuan(item.amountCents)}
              </Descriptions.Item>
              <Descriptions.Item label="说明" span={2}>
                {item.reason}
              </Descriptions.Item>
              {item.expenseId ? (
                <Descriptions.Item label="关联费用">
                  {item.expenseId}
                </Descriptions.Item>
              ) : null}
              {item.exceptionReason ? (
                <Descriptions.Item label="例外原因">
                  {item.exceptionReason}
                </Descriptions.Item>
              ) : null}
            </Descriptions>
          </Card>
          <Card title="附件">
            <FinanceAttachmentUpload
              applicationType="reimbursements"
              applicationId={id}
              initialAttachments={item.attachments}
            />
          </Card>
          <Card title="审批记录">
            <FinanceApprovalTimeline records={item.approvalRecords} />
          </Card>
          <Space>
            {item.allowedActions?.includes("REVIEW_REIMBURSEMENT") ? (
              <Button type="primary" onClick={() => setReviewOpen(true)}>
                处理审核
              </Button>
            ) : null}
            {item.allowedActions?.includes("PAY") ? (
              <Button type="primary" onClick={() => setPayOpen(true)}>
                确认付款
              </Button>
            ) : null}
            {item.allowedActions?.includes("WITHDRAW") ? (
              <Button danger onClick={() => setWithdrawOpen(true)}>
                撤回申请
              </Button>
            ) : null}
            {item.allowedActions?.includes("RESUBMIT") ? (
              <Button
                onClick={() => {
                  resubmitForm.setFieldsValue({
                    title: item.title,
                    amountCents: item.amountCents,
                    reason: item.reason,
                    exceptionReason: item.exceptionReason,
                  });
                  setResubmitOpen(true);
                }}
              >
                重新提交
              </Button>
            ) : null}
          </Space>
          {item.status === "PAID" && item.paymentRecord ? (
            <Card title="付款结果">
              <Descriptions column={2}>
                <Descriptions.Item label="付款流水号">
                  {item.paymentRecord.id}
                </Descriptions.Item>
                <Descriptions.Item label="付款金额">
                  {formatCentsAsYuan(item.paymentRecord.amountCents)}
                </Descriptions.Item>
                <Descriptions.Item label="付款时间">
                  {new Date(item.paymentRecord.occurredAt).toLocaleString(
                    "zh-CN",
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="付款账户">
                  {item.paymentAccount?.name ?? "已记录"}
                </Descriptions.Item>
              </Descriptions>
              <Button
                onClick={() =>
                  router.push(
                    `/finance/payment-records/${item.paymentRecord!.id}`,
                  )
                }
              >
                查看资金流水
              </Button>
            </Card>
          ) : null}
          {item.status === "CANCELLED" ? (
            <Card title="申请状态">
              <Tag color="error">已撤回，当前为只读</Tag>
            </Card>
          ) : null}
          <Modal
            title="审核报销申请"
            open={reviewOpen}
            confirmLoading={review.isPending}
            onCancel={() => setReviewOpen(false)}
            okText="保存"
            onOk={() => form.submit()}
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={(v) => review.mutate(v)}
            >
              <Form.Item
                name="decision"
                label="审核结果"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { value: "APPROVE", label: "通过，进入付款" },
                    { value: "REJECT", label: "驳回" },
                  ]}
                />
              </Form.Item>
              <Form.Item name="note" label="审核意见">
                <Input.TextArea rows={4} />
              </Form.Item>
            </Form>
          </Modal>
          <Modal
            title="确认报销付款"
            open={payOpen}
            confirmLoading={pay.isPending}
            onCancel={() => setPayOpen(false)}
            okText="确认付款"
            onOk={() => payForm.submit()}
          >
            <Form
              form={payForm}
              layout="vertical"
              onFinish={(v) => pay.mutate(v)}
            >
              <Form.Item
                name="paymentAccountId"
                label="付款账户"
                rules={[{ required: true, message: "请选择付款账户" }]}
              >
                <Select
                  options={(accounts.data ?? [])
                    .filter((account) => account.isActive !== false)
                    .map((account) => ({
                      value: account.id,
                      label: `${account.name}（${account.accountNo || "未填写账号"}）`,
                    }))}
                />
              </Form.Item>
              <Form.Item name="paidAt" label="付款时间">
                <Input type="datetime-local" />
              </Form.Item>{" "}
              <Form.Item name="note" label="付款备注">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Form>
          </Modal>
          <Modal
            title="撤回报销申请"
            open={withdrawOpen}
            confirmLoading={withdraw.isPending}
            onCancel={() => setWithdrawOpen(false)}
            okText="确认撤回"
            onOk={() => withdrawForm.submit()}
          >
            <Form
              form={withdrawForm}
              layout="vertical"
              onFinish={(v) => withdraw.mutate(v)}
            >
              <Form.Item name="note" label="撤回原因">
                <Input.TextArea rows={3} />
              </Form.Item>
            </Form>
          </Modal>
          <Modal
            title="重新提交报销申请"
            open={resubmitOpen}
            confirmLoading={resubmit.isPending}
            onCancel={() => setResubmitOpen(false)}
            okText="重新提交"
            onOk={() => resubmitForm.submit()}
          >
            <Form
              form={resubmitForm}
              layout="vertical"
              onFinish={(v) =>
                resubmit.mutate({ ...v, amountCents: Number(v.amountCents) })
              }
            >
              <Form.Item
                name="title"
                label="报销标题"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="amountCents"
                label="金额（分）"
                rules={[{ required: true }]}
              >
                <Input type="number" />
              </Form.Item>
              <Form.Item
                name="reason"
                label="费用说明"
                rules={[{ required: true }]}
              >
                <Input.TextArea rows={4} />
              </Form.Item>
            </Form>
          </Modal>
        </>
      ) : null}
    </div>
  );
}
