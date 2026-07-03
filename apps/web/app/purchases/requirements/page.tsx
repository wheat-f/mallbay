"use client";

import type { ProductUnit } from "@mallbay/shared";
import { Alert, Button, Card, Form, InputNumber, Select, message } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { purchaseApi } from "../../../src/lib/api";
import { productApi } from "../../../src/features/products/api";
import { getProductDisplayName, PRODUCT_UNIT_OPTIONS } from "../../../src/features/products/display";
import { PurchaseModuleNav } from "../../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

type ProductOption = {
  id: string;
  brand?: string;
  name?: string;
  model?: string;
  unit?: ProductUnit;
  inventoryUnit?: ProductUnit | null;
};

export default function PurchaseRequirementsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createRequirementForm] = Form.useForm();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManagePurchase = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const productsQuery = useQuery({
    queryKey: ["purchase-requirement-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, page: 1, pageSize: 200 }),
    enabled: Boolean(storeId) && canManagePurchase
  });
  const productItems = useMemo(() => (productsQuery.data?.items ?? []) as ProductOption[], [productsQuery.data]);
  const productOptions = productItems.map((product) => ({
    value: product.id,
    label: getProductDisplayName(product)
  }));
  const createRequirement = useMutation({
    mutationFn: (values: { productId: string; requiredQuantity: number; requiredUnit: ProductUnit }) => {
      if (!storeId) throw new Error("请先选择门店");
      return purchaseApi.createRequirement({
        storeId,
        items: [
          {
            productId: values.productId,
            requiredQuantity: values.requiredQuantity,
            requiredUnit: values.requiredUnit
          }
        ]
      });
    },
    onSuccess: async () => {
      message.success("采购需求已创建");
      createRequirementForm.resetFields();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-requirements", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchases-overview", storeId] })
      ]);
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page purchases-requirements-page">
      <StorePageHeader title="新建采购需求" description="录入人工采购申请，后续在采购订单中处理转单和到货。">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/purchases")}>返回采购总览</Button>
      </StorePageHeader>

      {!canManagePurchase ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          title="只读模式"
          description="客服可查看采购相关信息，不能创建采购需求。"
        />
      ) : null}

      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="requirements" />
        <div className="purchase-module-content">
          {canManagePurchase ? (
            <div className="purchase-requirement-create-shell">
            <Card className="purchases-requirement-create-card" title="需求信息">
              <Form
                form={createRequirementForm}
                layout="vertical"
                className="purchases-requirement-create-form"
                initialValues={{ requiredUnit: "ROLL" }}
                onFinish={(values: { productId: string; requiredQuantity: number; requiredUnit: ProductUnit }) => createRequirement.mutate(values)}
              >
                <Form.Item name="productId" label="选择采购产品" rules={[{ required: true, message: "请选择采购产品" }]}>
                  <Select showSearch optionFilterProp="label" loading={productsQuery.isLoading} placeholder="按品牌、名称或型号搜索" options={productOptions} />
                </Form.Item>
                <Form.Item name="requiredQuantity" label="需求数量" rules={[{ required: true, message: "请输入需求数量" }]}>
                  <InputNumber className="w-full" min={0.001} placeholder="输入采购数量" />
                </Form.Item>
                <Form.Item name="requiredUnit" label="需求单位" rules={[{ required: true, message: "请选择需求单位" }]}>
                  <Select options={PRODUCT_UNIT_OPTIONS} />
                </Form.Item>
                <div className="purchases-requirement-create-actions">
                  <Button type="primary" htmlType="submit" loading={createRequirement.isPending}>
                    提交采购需求
                  </Button>
                </div>
              </Form>
            </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
