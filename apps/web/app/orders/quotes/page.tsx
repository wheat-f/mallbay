"use client";

import { App, Button, Card, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { CheckOutlined, CloseOutlined, DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clearQuoteConversionCommandId, getQuoteConversionCommandId, salesQuoteApi, type SalesQuoteRow } from "../../../src/features/sales-quotes/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../../src/features/permissions/use-effective-permissions";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { exportRowsToExcel } from "../../../src/lib/export-excel";

const STATUS_LABEL: Record<SalesQuoteRow["status"], string> = {
  DRAFT: "草稿", PENDING_APPROVAL: "待审批", APPROVED: "已批准", REJECTED: "已驳回", EXPIRED: "已过期", CONVERTED: "已转订单", WITHDRAWN: "已撤回"
};

export default function SalesQuotesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const actorId = useAuthStore((state) => state.user?.id);
  const permissionsQuery = useEffectivePermissions(storeId);
  const canViewCosts = hasEffectivePermission(permissionsQuery.data?.permissions, "finance.cost", "read", storeId);
  const query = useQuery({ queryKey: ["sales-quotes", storeId], queryFn: () => salesQuoteApi.list(storeId!), enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "orders", "read", storeId)) });
  const reviewMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => approve ? salesQuoteApi.approve(id, storeId!) : salesQuoteApi.reject(id, storeId!),
    onSuccess: () => { message.success("报价状态已更新"); queryClient.invalidateQueries({ queryKey: ["sales-quotes", storeId] }); },
    onError: (error: Error) => message.error(error.message)
  });
  const convertMutation = useMutation({
    mutationFn: (id: string) => salesQuoteApi.convertToOrder(id, getQuoteConversionCommandId(id, actorId!, storeId!)),
    onSuccess: (result) => { clearQuoteConversionCommandId(result.quoteId, actorId!, storeId!); message.success("报价已转为正式订单"); window.location.href = `/orders/${result.orderId}`; },
    onError: (error: Error) => message.error(error.message)
  });
  const withdrawMutation = useMutation({
    mutationFn: (id: string) => salesQuoteApi.withdraw(id, storeId!),
    onSuccess: () => { message.success("报价已撤回，容量占位已释放"); queryClient.invalidateQueries({ queryKey: ["sales-quotes", storeId] }); },
    onError: (error: Error) => message.error(error.message)
  });
  const exportMutation = useMutation({
    mutationFn: () => salesQuoteApi.exportDetails(storeId!, "date"),
    onSuccess: async (rows) => {
      if (!rows.length) return message.warning("当前没有可导出的报价产品明细");
      await exportRowsToExcel("报价审批产品明细", "报价产品明细", rows.map((row) => ({
        报价单号: row.quoteNo,
        客户: row.customerName,
        车辆: row.vehicle,
        报价状态: STATUS_LABEL[row.status],
        创建时间: row.createdAt,
        有效期至: row.validUntil,
        产品品牌: row.productBrand,
        产品名称: row.productName,
        产品型号: row.productModel,
        产品规格: row.productSpecification,
        数量: row.quantity,
        单位: row.salesUnit,
        建议单价: row.suggestedUnitPriceCents / 100,
        成交单价: row.finalUnitPriceCents / 100,
        产品行金额: row.finalAmountCents / 100,
        系统建议施工收费: row.suggestedConstructionChargeCents / 100,
        本单施工收费: row.finalConstructionChargeCents / 100,
        报价总额_每行重复: row.quoteTotalCents / 100,
        ...(canViewCosts && row.estimatedTotalCostCents !== undefined ? {
          预计材料成本: (row.estimatedMaterialCostCents ?? 0) / 100,
          预计施工成本: (row.estimatedConstructionCostCents ?? 0) / 100,
          预计总成本: (row.estimatedTotalCostCents ?? 0) / 100,
          成本完整性: row.costCompleteness ?? "未计算",
          本单临时成本: row.temporaryCostCents == null ? "" : row.temporaryCostCents / 100,
          临时成本依据: row.temporaryCostReason ?? "",
          预计毛利率: row.estimatedMarginBps == null ? "" : row.estimatedMarginBps / 10000
        } : {})
      })), { title: "报价审批产品明细", subtitle: "服务端全量、逐产品行导出；金额单位：元" });
      message.success("报价产品明细已导出");
    },
    onError: (error: Error) => message.error(error.message)
  });
  const exportQuoteRows = async () => {
    await exportMutation.mutateAsync();
  };
  return (
    <div className="management-page">
      <StorePageHeader title="报价审批" description="查看超出建议价阈值的报价并完成批准、驳回或转订单" />
      <Card title="报价单" extra={<Space><Button icon={<DownloadOutlined />} loading={exportMutation.isPending} onClick={() => void exportQuoteRows()}>导出产品明细</Button><Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>刷新</Button></Space>}>
        <Table<SalesQuoteRow>
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data ?? []}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: "报价单号", dataIndex: "quoteNo" },
            { title: "客户", key: "customer", render: (_, row) => row.customer?.companyName ?? row.customer?.name ?? row.customer?.contactPerson ?? row.customerId },
            { title: "建议总价", dataIndex: "suggestedTotalCents", render: (value: number) => `¥${(value / 100).toFixed(2)}` },
            { title: "成交总价", dataIndex: "finalTotalCents", render: (value: number) => `¥${(value / 100).toFixed(2)}` },
            ...(canViewCosts ? [{ title: "预计毛利", dataIndex: "estimatedMarginBps", render: (value: number | null | undefined) => value === null || value === undefined ? "-" : `${(value / 100).toFixed(2)}%` }] : []),
            { title: "状态", dataIndex: "status", render: (value: SalesQuoteRow["status"]) => <Tag color={value === "PENDING_APPROVAL" ? "orange" : value === "APPROVED" ? "green" : "default"}>{STATUS_LABEL[value]}</Tag> },
            { title: "操作", key: "actions", render: (_, row) => <Space>
              <Button size="small" href={`/orders/quotes/${row.id}`}>详情</Button>
              {row.status === "PENDING_APPROVAL" ? <>
                <Popconfirm title="批准该报价？" onConfirm={() => reviewMutation.mutate({ id: row.id, approve: true })}><Button size="small" icon={<CheckOutlined />} loading={reviewMutation.isPending}>批准</Button></Popconfirm>
                <Popconfirm title="驳回该报价？" onConfirm={() => reviewMutation.mutate({ id: row.id, approve: false })}><Button size="small" danger icon={<CloseOutlined />} loading={reviewMutation.isPending}>驳回</Button></Popconfirm>
              </> : null}
              {row.status === "APPROVED" ? <Button size="small" type="primary" loading={convertMutation.isPending} onClick={() => convertMutation.mutate(row.id)}>转正式订单</Button> : null}
              {row.status === "PENDING_APPROVAL" ? <Popconfirm title="撤回该报价并释放预约占位？" onConfirm={() => withdrawMutation.mutate(row.id)}><Button size="small" loading={withdrawMutation.isPending}>撤回</Button></Popconfirm> : null}
            </Space> }
          ]}
        />
        <Typography.Paragraph type="secondary" className="mt-3 mb-0">销售人员只能查看本人报价；店长可查看本门店全部报价。报价有效期过后会释放容量占位。</Typography.Paragraph>
      </Card>
    </div>
  );
}
