"use client";
import { App, Button, Card, Form, Input, InputNumber, Modal, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { financeApi, type CreateExpensePayload } from "../../../src/features/finance/api";
import { FinanceApplicationTable } from "../../../src/features/finance/components/finance-application-table";
import { useAuthStore } from "../../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../../src/features/permissions/use-effective-permissions";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

export default function ExpenseListPage() {
  const storeId = useAuthStore((s) => s.user?.storeMember?.store.id); const permissionsQuery = useEffectivePermissions(storeId); const router = useRouter(); const client = useQueryClient(); const { message } = App.useApp(); const [open, setOpen] = useState(false); const [form] = Form.useForm();
  const scope = hasEffectivePermission(permissionsQuery.data?.permissions, "finance.expense", "review", storeId) ? "all" : "mine"; const query = useQuery({ queryKey: ["finance-expenses", storeId, scope], queryFn: () => financeApi.expenses({ storeId: storeId!, scope }), enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "finance", "read", storeId)) });
  const create = useMutation({ mutationFn: (values: Omit<CreateExpensePayload, "storeId" | "amountCents"> & { amountYuan: number }) => financeApi.createExpense({ ...values, storeId: storeId!, amountCents: Math.round(values.amountYuan * 100) }), onSuccess: (item) => { message.success("费用申请已提交"); setOpen(false); form.resetFields(); void client.invalidateQueries({ queryKey: ["finance-expenses", storeId] }); router.push(`/finance/expenses/${item.id}`); }, onError: (error: unknown) => { message.error(error instanceof Error ? error.message : "提交费用申请失败，请稍后重试"); } });
  return <div className="management-page"><StorePageHeader title="费用申请" description="查询门店费用申请并进入详情处理。" actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新建费用申请</Button>} /><Card><FinanceApplicationTable rows={query.data?.items ?? []} loading={query.isLoading} onOpen={(id) => router.push(`/finance/expenses/${id}`)} /></Card><Modal title="新建费用申请" open={open} onCancel={() => setOpen(false)} okText="提交申请" confirmLoading={create.isPending} onOk={() => form.submit()}><Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}><Form.Item name="title" label="费用标题" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="amountYuan" label="费用金额（元）" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item><Form.Item name="reason" label="用途说明" rules={[{ required: true }]}><Input.TextArea rows={4} /></Form.Item></Form></Modal></div>;
}
