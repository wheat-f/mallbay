"use client";

import { Alert, App, Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag } from "antd";
import { EditOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orderApi, type PaymentAccountPayload } from "../../../src/features/orders/api";
import { getPaymentAccountTypeLabel } from "../../../src/features/finance/display";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

type AccountRow = PaymentAccountPayload & { id: string; isActive?: boolean; isDefault?: boolean };

const accountOptions = [
  { value: "CORPORATE", label: "对公账户" },
  { value: "PERSONAL", label: "个人账户" },
  { value: "WECHAT", label: "微信" },
  { value: "ALIPAY", label: "支付宝" },
  { value: "OTHER", label: "其他" }
];

export default function FinanceAccountsPage() {
  const storeId = useAuthStore((s) => s.user?.storeMember?.store.id);
  const client = useQueryClient();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form] = Form.useForm();
  const query = useQuery({
    queryKey: ["finance-accounts", storeId],
    queryFn: () => orderApi.paymentAccounts(storeId!),
    enabled: Boolean(storeId)
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ["finance-accounts", storeId] });
  const save = useMutation({
    mutationFn: (value: Omit<PaymentAccountPayload, "storeId">) =>
      editing
        ? orderApi.updatePaymentAccount(editing, { ...value, changeReason: "财务账户信息维护" })
        : orderApi.createPaymentAccount({ ...value, storeId: storeId! }),
    onSuccess: () => {
      message.success("账户已保存");
      setOpen(false);
      setEditing(null);
      form.resetFields();
      refresh();
    },
    onError: (error: unknown) => {
      message.error(error instanceof Error ? error.message : "账户保存失败，请稍后重试");
    }
  });
  const disable = useMutation({
    mutationFn: (id: string) => orderApi.removePaymentAccount(id),
    onSuccess: () => {
      message.success("账户已停用");
      refresh();
    },
    onError: (error: unknown) => {
      message.error(error instanceof Error ? error.message : "账户停用失败");
    }
  });
  const openEdit = (item: AccountRow) => {
    setEditing(item.id);
    form.setFieldsValue(item);
    setOpen(true);
  };

  return (
    <div className="management-page">
      <StorePageHeader
        title="收款账户"
        description="维护门店可用的收款和付款账户。"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              form.resetFields();
              setOpen(true);
            }}
          >
            新增账户
          </Button>
        }
      />
      {query.isError ? (
        <Alert type="error" showIcon title="收款账户列表加载失败，请刷新重试" />
      ) : null}
      <Card className="management-table-card">
        <Table<AccountRow>
          rowKey="id"
          dataSource={(query.data ?? []) as AccountRow[]}
          loading={query.isLoading}
          scroll={{ x: 760 }}
          columns={[
            {
              title: "账户名称",
              dataIndex: "name",
              render: (value: string, item: AccountRow) => (
                <Space size={6}>
                  <strong>{value}</strong>
                  {item.isDefault ? <Tag color="blue">默认</Tag> : null}
                </Space>
              )
            },
            { title: "账户类型", dataIndex: "type", render: (value) => getPaymentAccountTypeLabel(value) },
            { title: "开户行", dataIndex: "bankName", render: (value) => value || "-" },
            { title: "账号", dataIndex: "accountNo", render: (value) => value || "未填写" },
            {
              title: "状态",
              dataIndex: "isActive",
              render: (value) => <Tag color={value === false ? "default" : "success"}>{value === false ? "已停用" : "启用"}</Tag>
            },
            {
              title: "操作",
              key: "actions",
              render: (_: unknown, item: AccountRow) => (
                <Space>
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(item)}>
                    编辑
                  </Button>
                  {item.isActive !== false ? (
                    <Popconfirm title="确定停用该账户？" onConfirm={() => disable.mutate(item.id)}>
                      <Button size="small" danger icon={<StopOutlined />} loading={disable.isPending}>
                        停用
                      </Button>
                    </Popconfirm>
                  ) : null}
                </Space>
              )
            }
          ]}
          pagination={{ pageSize: 12 }}
        />
      </Card>
      <Modal
        title={editing ? "编辑账户" : "新增账户"}
        open={open}
        onCancel={() => setOpen(false)}
        okText="保存"
        confirmLoading={save.isPending}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" initialValues={{ isDefault: false }} onFinish={(value) => save.mutate(value)}>
          <Form.Item name="name" label="账户名称" rules={[{ required: true, message: "请输入账户名称" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="账户类型" rules={[{ required: true, message: "请选择账户类型" }]}>
            <Select options={accountOptions} />
          </Form.Item>
          <Form.Item name="bankName" label="开户行">
            <Input />
          </Form.Item>
          <Form.Item name="accountNo" label="账号">
            <Input />
          </Form.Item>
          <Form.Item name="isDefault" label="设为默认账户" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
