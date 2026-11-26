"use client";

import { Button, Card, Col, Empty, Row, Skeleton, Space, Statistic, Typography } from "antd";
import { AuditOutlined, BankOutlined, DollarOutlined, FileTextOutlined, TransactionOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { financeApi } from "../../src/features/finance/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../src/features/permissions/use-effective-permissions";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";

export default function FinanceOverviewPage() {
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const permissionsQuery = useEffectivePermissions(storeId);
  const canManageFinance = hasEffectivePermission(permissionsQuery.data?.permissions, "finance", "read", storeId);
  const query = useQuery({ queryKey: ["finance-overview", storeId], queryFn: () => financeApi.overview(storeId!), enabled: Boolean(storeId && canManageFinance) });
  const overview = query.data;
  return <div className="management-page finance-overview-page">
    <StorePageHeader title="财务管理" description="统一查看费用申请、报销审核、账户和资金流水。" />
    {!storeId ? <Empty description="当前账号未加入门店" /> : !canManageFinance ? <Card title="财务申请"><Typography.Paragraph>当前角色可提交和查询本人费用、报销申请。</Typography.Paragraph><Space><Button type="primary" href="/finance/expenses">费用申请</Button><Button href="/finance/reimbursements">报销申请</Button></Space></Card> : query.isLoading ? <Skeleton active /> : <>
      <Row gutter={[16, 16]} className="finance-overview-stats">
        {[
          { href: "/finance/expenses", title: "费用申请", value: overview?.expenseCount ?? 0, text: `待处理 ${overview?.pendingExpenseCount ?? 0} 笔 · 新建、查询、撤回和审批费用申请`, icon: <FileTextOutlined /> },
          { href: "/finance/reimbursements", title: "报销审核", value: overview?.pendingReimbursementCount ?? 0, text: "待付款报销 · 查看报销单、审核结果并登记付款", icon: <AuditOutlined /> },
          { href: "/finance/accounts", title: "收款账户", value: undefined, text: "维护可用收款和付款账户", icon: <BankOutlined /> },
          { href: "/finance/ledger", title: "财务流水", value: overview?.paymentCount ?? 0, text: "按收支方向、账户和日期查询资金流水", icon: <TransactionOutlined /> }
        ].map((item) => (
          <Col xs={24} md={12} xl={6} key={item.href}>
            <Link href={item.href} className="block no-underline">
              <Card hoverable>
                {item.value !== undefined ? (
                  <Statistic title={item.title} value={item.value} prefix={item.icon} />
                ) : (
                  <Typography.Title level={4} style={{ marginTop: 4 }}>{item.icon} {item.title}</Typography.Title>
                )}
                <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                  {item.text}
                </Typography.Paragraph>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    </>}
  </div>;
}
