"use client";

import {
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
} from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { financeApi } from "../../../src/features/finance/api";
import { FinanceApplicationTable } from "../../../src/features/finance/components/finance-application-table";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

export default function ReimbursementListPage() {
  const storeId = useAuthStore((s) => s.user?.storeMember?.store.id);
  const position = useAuthStore((s) => s.user?.storeMember?.position);
  const router = useRouter();
  const client = useQueryClient();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const isManager = position === "MANAGER" || position === "FINANCE";
  const scope = isManager ? "all" : "mine";

  const expenses = useQuery({
    queryKey: ["finance-expenses-for-reimbursement", storeId, scope],
    queryFn: () =>
      financeApi.expenses({ storeId: storeId!, status: "APPROVED", scope }),
    enabled: Boolean(storeId),
  });
  const query = useQuery({
    queryKey: ["finance-reimbursements", storeId, scope],
    queryFn: () => financeApi.reimbursements({ storeId: storeId!, scope }),
    enabled: Boolean(storeId),
  });
  const create = useMutation({
    mutationFn: (value: {
      expenseId?: string;
      exceptionReason?: string;
      title: string;
      amountYuan: number;
      reason: string;
    }) =>
      financeApi.createReimbursement({
        storeId: storeId!,
        expenseId: value.expenseId,
        exceptionReason: value.exceptionReason?.trim() || undefined,
        title: value.title,
        amountCents: Math.round(value.amountYuan * 100),
        reason: value.reason,
      }),
    onSuccess: (created) => {
      message.success("报销申请已提交");
      setOpen(false);
      form.resetFields();
      void client.invalidateQueries({ queryKey: ["finance-reimbursements"] });
      router.push(`/finance/reimbursements/${created.id}`);
    },
    onError: (error: unknown) => {
      message.error(
        error instanceof Error ? error.message : "提交报销申请失败，请稍后重试",
      );
    },
  });

  return (
    <div className="management-page">
      <StorePageHeader
        title={isManager ? "报销审核" : "报销申请"}
        description={
          isManager
            ? "查询报销申请、处理审核并登记付款。"
            : "查看和提交本人报销申请。"
        }
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOpen(true)}
          >
            新建报销
          </Button>
        }
      />
      <Card>
        <FinanceApplicationTable
          rows={query.data?.items ?? []}
          loading={query.isLoading}
          onOpen={(id) => router.push(`/finance/reimbursements/${id}`)}
        />
      </Card>
      <Modal
        title="新建报销"
        open={open}
        onCancel={() => setOpen(false)}
        okText="提交申请"
        confirmLoading={create.isPending}
        onOk={() => form.submit()}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(value) => create.mutate(value)}
        >
          <Form.Item name="expenseId" label="关联已审批费用">
            <Select
              allowClear
              placeholder="可选择已审批费用"
              options={(expenses.data?.items ?? []).map((item) => ({
                value: item.id,
                label: `${item.title} / ${item.amountCents / 100} 元`,
              }))}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, current) =>
              prev.expenseId !== current.expenseId
            }
          >
            {({ getFieldValue }) =>
              getFieldValue("expenseId") ? null : (
                <Form.Item
                  name="exceptionReason"
                  label="例外原因"
                  rules={[
                    { required: true, message: "未关联费用时必须填写例外原因" },
                  ]}
                >
                  <Input.TextArea
                    rows={3}
                    placeholder="例如：临时门店支出，暂无事前费用申请。"
                  />
                </Form.Item>
              )
            }
          </Form.Item>
          <Form.Item name="title" label="报销标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="amountYuan"
            label="报销金额（元）"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="reason"
            label="报销说明"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
