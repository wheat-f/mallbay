"use client";

import type { CreateOrderPayload } from "../../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Select, Space, Typography } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { customerApi, orderApi, productApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";

type CustomerOption = {
  id: string;
  name?: string | null;
  companyName?: string | null;
  vehicles?: { id: string; carPlate?: string | null; carModel?: string | null }[];
};

type ProductOption = {
  id: string;
  brand: string;
  name: string;
  model: string;
  basePriceCents: number;
};

export default function CreateOrderPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const params = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [customerKeyword, setCustomerKeyword] = useState("");
  const [form] = Form.useForm<CreateOrderPayload>();

  const customersQuery = useQuery({
    queryKey: ["customer-search", storeId, customerKeyword],
    queryFn: () => customerApi.search(storeId!, customerKeyword),
    enabled: Boolean(storeId) && customerKeyword.length > 0
  });

  const productsQuery = useQuery({
    queryKey: ["products-for-order", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, page: 1, pageSize: 100, status: "ACTIVE" }),
    enabled: Boolean(storeId)
  });

  const customerOptions = ((customersQuery.data ?? []) as CustomerOption[]).map((customer) => ({
    label: customer.companyName ?? customer.name ?? customer.id,
    value: customer.id
  }));
  const productOptions = ((productsQuery.data?.items ?? []) as ProductOption[]).map((product) => ({
    label: `${product.brand} ${product.name} / ${product.model}`,
    value: product.id,
    product
  }));

  const initialCustomerId = params.get("customerId") ?? undefined;

  const createMutation = useMutation({
    mutationFn: (values: CreateOrderPayload) => orderApi.create({ ...values, storeId: storeId! }),
    onSuccess: (order) => {
      message.success("订单已创建");
      router.push(`/orders/${order.id}`);
    },
    onError: (error: Error) => message.error(error.message)
  });

  const defaultItems = useMemo(() => [{ quantity: 1 }], []);

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <Typography.Title level={3}>新建订单</Typography.Title>
        <Typography.Text type="secondary">选择客户、产品、施工方式并录入费用</Typography.Text>

        <Form
          form={form}
          layout="vertical"
          className="mt-6"
          initialValues={{
            customerId: initialCustomerId,
            constructionType: "PPF",
            constructionLocation: "IN_STORE",
            laborCostCents: 0,
            items: defaultItems
          }}
          onFinish={(values) => createMutation.mutate(values)}
        >
          <Form.Item name="customerId" label="客户" rules={[{ required: true, message: "请选择客户" }]}>
            <Select
              showSearch
              filterOption={false}
              onSearch={setCustomerKeyword}
              options={customerOptions}
              placeholder="输入姓名、企业或手机号搜索"
            />
          </Form.Item>

          <Space className="w-full" size="large" align="start">
            <Form.Item name="vehicleId" label="车辆 ID">
              <Input placeholder="可选，后续可从客户车辆中选择" />
            </Form.Item>
            <Form.Item name="constructionType" label="施工类型" rules={[{ required: true }]}>
              <Select options={[
                { label: "漆面保护膜", value: "PPF" },
                { label: "改色膜", value: "COLOR_FILM" },
                { label: "隔热膜", value: "HEAT_FILM" },
                { label: "改装", value: "MODIFICATION" },
                { label: "检查", value: "INSPECTION" }
              ]} />
            </Form.Item>
            <Form.Item name="constructionLocation" label="施工地点" rules={[{ required: true }]}>
              <Select options={[
                { label: "到店", value: "IN_STORE" },
                { label: "外出", value: "OUTSIDE" }
              ]} />
            </Form.Item>
          </Space>

          <Space className="w-full" size="large" align="start">
            <Form.Item name="appointmentDate" label="预约日期">
              <Input placeholder="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="appointmentTimeSlot" label="预约时段">
              <Input placeholder="09:00-12:00" />
            </Form.Item>
            <Form.Item name="constructionAddress" label="外出地址">
              <Input />
            </Form.Item>
          </Space>

          <Typography.Title level={4}>产品明细</Typography.Title>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" className="mb-2 flex">
                    <Form.Item
                      {...field}
                      name={[field.name, "productId"]}
                      rules={[{ required: true, message: "请选择产品" }]}
                    >
                      <Select
                        style={{ width: 320 }}
                        options={productOptions}
                        placeholder="产品"
                        onChange={(productId) => {
                          const product = productOptions.find((item) => item.value === productId)?.product;
                          if (!product) return;
                          const items = form.getFieldValue("items") as Array<Record<string, unknown>>;
                          items[field.name] = {
                            ...items[field.name],
                            unitPriceCents: product.basePriceCents
                          };
                          form.setFieldValue("items", items);
                        }}
                      />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "quantity"]}>
                      <InputNumber min={1} placeholder="数量" />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "unitPriceCents"]}>
                      <InputNumber min={0} placeholder="单价（分）" />
                    </Form.Item>
                    <Button icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                  </Space>
                ))}
                <Button icon={<PlusOutlined />} onClick={() => add({ quantity: 1 })}>
                  添加产品
                </Button>
              </>
            )}
          </Form.List>

          <Form.Item name="laborCostCents" label="施工人工费（分）" className="mt-4">
            <InputNumber className="w-full" min={0} />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>

          <div className="flex justify-end gap-2">
            <Button onClick={() => router.back()}>取消</Button>
            <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
              创建订单
            </Button>
          </div>
        </Form>
      </Layout.Content>
    </Layout>
  );
}
