"use client";

import { App, Button, Empty, Form, Input, Layout, Modal, Select, Space, Table, Typography } from "antd";
import { ArrowLeftOutlined, FileTextOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { customerApi } from "../../src/lib/api";
import {
  toCreateCustomerPayload,
  type CreateCustomerFormValues
} from "../../src/features/customers/create-customer-form";
import { getStoreWorkbenchHref } from "../../src/features/workbench/navigation";
import { useAuthStore } from "../../src/stores/auth-store";

type CustomerRow = {
  id: string;
  customerType: string;
  name?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  wechat?: string | null;
  vehicles?: { id: string; carPlate?: string | null; carModel?: string | null }[];
};

export default function CustomersPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [search, setSearch] = useState("");
  const [referrerKeyword, setReferrerKeyword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateCustomerFormValues>();
  const customerType = Form.useWatch("customerType", createForm) ?? "PERSONAL";

  const customersQuery = useQuery({
    queryKey: ["customers", storeId, search],
    queryFn: () => customerApi.list({ storeId: storeId!, page: 1, pageSize: 20, q: search }),
    enabled: Boolean(storeId),
    staleTime: 10_000
  });

  const referrersQuery = useQuery({
    queryKey: ["customer-referrer-search", storeId, referrerKeyword],
    queryFn: () => customerApi.search(storeId!, referrerKeyword),
    enabled: Boolean(storeId) && referrerKeyword.length > 0
  });

  const rows = (customersQuery.data?.items ?? []) as CustomerRow[];
  const referrerOptions = ((referrersQuery.data ?? []) as CustomerRow[]).map((customer) => ({
    label: customer.companyName ?? customer.name ?? customer.contactPerson ?? customer.id,
    value: customer.id
  }));

  const createMutation = useMutation({
    mutationFn: (values: CreateCustomerFormValues) => {
      if (!storeId) throw new Error("当前账号尚未加入门店");
      return customerApi.create(toCreateCustomerPayload(storeId, values));
    },
    onSuccess: () => {
      message.success("客户已创建");
      setCreateOpen(false);
      createForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["customers", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const closeCreateModal = () => {
    if (createMutation.isPending) return;
    setCreateOpen(false);
    createForm.resetFields();
  };

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <Typography.Title level={3} className="!mb-1">
              客户管理
            </Typography.Title>
            <Typography.Text type="secondary">检索客户、车辆并快速进入订单创建</Typography.Text>
          </div>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              disabled={!storeId}
              onClick={() => storeId && router.push(getStoreWorkbenchHref(storeId))}
            >
              返回工作台
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!storeId}
              onClick={() => setCreateOpen(true)}
            >
              新建客户
            </Button>
          </Space>
        </div>

        <Space.Compact className="mb-4 w-full">
          <Input.Search
            prefix={<SearchOutlined />}
            placeholder="手机号 / 姓名 / 企业 / 车牌 / VIN"
            allowClear
            onSearch={setSearch}
          />
        </Space.Compact>

        {!storeId ? (
          <Empty description="当前账号尚未加入门店" />
        ) : (
          <Table<CustomerRow>
            rowKey="id"
            loading={customersQuery.isLoading}
            dataSource={rows}
            columns={[
              {
                title: "客户",
                render: (_, row) => (
                  <div>
                    <div className="font-medium">
                      {row.customerType === "COMPANY" ? row.companyName : row.name}
                    </div>
                    <div className="text-xs text-slate-500">{row.contactPerson ?? row.wechat ?? "-"}</div>
                  </div>
                )
              },
              {
                title: "车辆",
                render: (_, row) => row.vehicles?.[0]?.carPlate ?? row.vehicles?.[0]?.carModel ?? "-"
              },
              {
                title: "车辆数",
                render: (_, row) => row.vehicles?.length ?? 0
              },
              {
                title: "操作",
                width: 190,
                render: (_, row) => (
                  <Space>
                    <Button size="small" onClick={() => router.push(`/customers/${row.id}`)}>
                      详情
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      icon={<FileTextOutlined />}
                      onClick={() => router.push(`/orders/create?customerId=${row.id}`)}
                    >
                      下单
                    </Button>
                  </Space>
                )
              }
            ]}
          />
        )}

        <Modal
          open={createOpen}
          title="新建客户"
          okText="创建客户"
          cancelText="取消"
          confirmLoading={createMutation.isPending}
          onCancel={closeCreateModal}
          onOk={() => createForm.submit()}
          destroyOnHidden
        >
          <Form<CreateCustomerFormValues>
            form={createForm}
            layout="vertical"
            className="mt-4"
            initialValues={{ customerType: "PERSONAL", sourceType: "OFFLINE_STORE" }}
            onFinish={(values) => createMutation.mutate(values)}
          >
            <Form.Item name="customerType" label="客户类型" rules={[{ required: true, message: "请选择客户类型" }]}>
              <Select
                options={[
                  { label: "个人客户", value: "PERSONAL" },
                  { label: "企业客户", value: "COMPANY" }
                ]}
              />
            </Form.Item>

            {customerType === "COMPANY" ? (
              <>
                <Form.Item
                  name="companyName"
                  label="企业名称"
                  rules={[{ required: true, whitespace: true, message: "请输入企业名称" }]}
                >
                  <Input maxLength={100} />
                </Form.Item>
                <Form.Item
                  name="contactPerson"
                  label="联系人"
                  rules={[{ required: true, whitespace: true, message: "请输入联系人" }]}
                >
                  <Input maxLength={50} />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item
                  name="name"
                  label="客户姓名"
                  rules={[{ required: true, whitespace: true, message: "请输入客户姓名" }]}
                >
                  <Input maxLength={50} />
                </Form.Item>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Form.Item name="gender" label="性别">
                    <Select
                      allowClear
                      options={[
                        { label: "男", value: "MALE" },
                        { label: "女", value: "FEMALE" },
                        { label: "未知", value: "UNKNOWN" }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="birthday" label="生日">
                    <BirthdaySelector />
                  </Form.Item>
                </div>
              </>
            )}

            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                { required: true, message: "请输入手机号" },
                { pattern: /^1\d{10}$/, message: "请输入 11 位手机号" }
              ]}
            >
              <Input maxLength={11} />
            </Form.Item>

            <Form.Item name="wechat" label="微信号">
              <Input maxLength={50} />
            </Form.Item>

            <Form.Item name="sourceType" label="客户来源">
              <Select
                allowClear
                options={[
                  { label: "到店", value: "OFFLINE_STORE" },
                  { label: "抖音", value: "ONLINE_DOUYIN" },
                  { label: "小红书", value: "ONLINE_XIAOHONGSHU" },
                  { label: "快手", value: "ONLINE_KUAISHOU" },
                  { label: "转介绍", value: "REFERRAL" },
                  { label: "合作方", value: "PARTNER" },
                  { label: "其他", value: "OTHER" }
                ]}
              />
            </Form.Item>

            <Form.Item name="sourceDetail" label="来源说明">
              <Input maxLength={100} />
            </Form.Item>

            <Form.Item name="referrerId" label="介绍人">
              <Select
                allowClear
                showSearch
                filterOption={false}
                onSearch={setReferrerKeyword}
                options={referrerOptions}
                placeholder="可搜索老客户作为介绍人"
              />
            </Form.Item>
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}

type BirthdaySelectorProps = {
  value?: string;
  onChange?: (value?: string) => void;
};

type BirthdayParts = {
  year?: number;
  month?: number;
  day?: number;
};

function BirthdaySelector({ value, onChange }: BirthdaySelectorProps) {
  const [parts, setParts] = useState<BirthdayParts>(() => parseBirthday(value));
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 101 }, (_, index) => {
      const year = currentYear - index;
      return { label: `${year} 年`, value: year };
    });
  }, []);
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({ label: `${index + 1} 月`, value: index + 1 })),
    []
  );
  const dayOptions = useMemo(() => {
    const maxDay = getDaysInMonth(parts.year, parts.month);
    return Array.from({ length: maxDay }, (_, index) => ({ label: `${index + 1} 日`, value: index + 1 }));
  }, [parts.month, parts.year]);

  useEffect(() => {
    setParts(parseBirthday(value));
  }, [value]);

  const updatePart = (key: keyof BirthdayParts, nextValue?: number) => {
    const nextParts = { ...parts, [key]: nextValue };
    const maxDay = getDaysInMonth(nextParts.year, nextParts.month);
    if (nextParts.day && nextParts.day > maxDay) {
      nextParts.day = maxDay;
    }
    setParts(nextParts);

    if (nextParts.year && nextParts.month && nextParts.day) {
      onChange?.(formatBirthday(nextParts.year, nextParts.month, nextParts.day));
      return;
    }

    if (value) {
      onChange?.(undefined);
    }
  };

  return (
    <Space.Compact className="w-full">
      <Select
        allowClear
        className="!w-[42%]"
        options={yearOptions}
        placeholder="年份"
        value={parts.year}
        onChange={(nextValue) => updatePart("year", nextValue)}
      />
      <Select
        allowClear
        className="!w-[29%]"
        options={monthOptions}
        placeholder="月份"
        value={parts.month}
        onChange={(nextValue) => updatePart("month", nextValue)}
      />
      <Select
        allowClear
        className="!w-[29%]"
        options={dayOptions}
        placeholder="日期"
        value={parts.day}
        onChange={(nextValue) => updatePart("day", nextValue)}
      />
    </Space.Compact>
  );
}

function parseBirthday(value?: string): BirthdayParts {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return {};
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function getDaysInMonth(year?: number, month?: number) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function formatBirthday(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
