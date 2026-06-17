"use client";

import { Alert, Button, Card, Table, Tag, message } from "antd";
import { ArrowLeftOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { purchaseApi } from "../../../src/lib/api";
import { getPurchaseRequirementItemsSummary, getPurchaseRequirementSourceOrderLabel, getPurchaseRequirementStatusLabel } from "../../../src/features/inventory/display";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

type PurchaseRequirementRow = {
  id: string;
  status?: string;
  sourceOrder?: unknown;
  items?: unknown[];
};

export default function PurchaseRequirementsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManagePurchase = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const requirementsQuery = useQuery({
    queryKey: ["purchase-requirements", storeId],
    queryFn: () => purchaseApi.requirements(storeId!),
    enabled: Boolean(storeId)
  });
  const productLookup = useMemo(() => new Map(), []);
  const createOrder = useMutation({
    mutationFn: (id: string) => purchaseApi.createPurchaseOrderFromRequirement(id, {}),
    onSuccess: async () => {
      message.success("采购订单已创建");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-requirements", storeId] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", storeId] })
      ]);
      router.push("/purchases/orders");
    },
    onError: (error: Error) => message.error(error.message)
  });
  const rows = (requirementsQuery.data ?? []) as PurchaseRequirementRow[];

  return (
    <div className="management-page purchases-requirements-page">
      <StorePageHeader title="采购需求" description="查看缺货需求、人工采购申请和采购转单状态。">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/purchases")}>返回采购总览</Button>
      </StorePageHeader>

      {!canManagePurchase ? (
        <Alert className="management-readonly-alert" type="info" showIcon message="只读模式" description="客服可查看采购需求来源和状态，不能创建采购订单。" />
      ) : null}

      <Card className="management-table-card">
        <Table<PurchaseRequirementRow>
          rowKey="id"
          loading={requirementsQuery.isLoading}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: "需求来源", render: (_, row) => getPurchaseRequirementSourceOrderLabel(row as never) },
            { title: "状态", render: (_, row) => <Tag>{getPurchaseRequirementStatusLabel(row.status)}</Tag> },
            { title: "产品需求", render: (_, row) => getPurchaseRequirementItemsSummary(row as never, productLookup) },
            {
              title: "操作",
              render: (_, row) => (
                <Button
                  icon={<ShoppingCartOutlined />}
                  size="small"
                  disabled={!canManagePurchase}
                  loading={createOrder.isPending}
                  onClick={() => createOrder.mutate(row.id)}
                >
                  生成采购订单
                </Button>
              )
            }
          ]}
        />
      </Card>
    </div>
  );
}
