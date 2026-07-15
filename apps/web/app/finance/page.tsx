"use client";

import { Button, Card, Col, Empty, Row, Skeleton, Space, Statistic, Typography } from "antd";
import { AuditOutlined, BankOutlined, DollarOutlined, FileTextOutlined, TransactionOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { financeApi } from "../../src/features/finance/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";

export default function FinanceOverviewPage() {
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const position = useAuthStore((state) => state.user?.storeMember?.position);
  const canManageFinance = position === "MANAGER" || position === "FINANCE";
  const query = useQuery({ queryKey: ["finance-overview", storeId], queryFn: () => financeApi.overview(storeId!), enabled: Boolean(storeId && canManageFinance) });
  const overview = query.data;
  return <div className="management-page finance-overview-page">
    <StorePageHeader title="财务管理" description="统一查看费用申请、报销审核、账户和资金流水。" />
    {!storeId ? <Empty description="当前账号未加入门店" /> : !canManageFinance ? <Card title="财务申请"><Typography.Paragraph>当前角色可提交和查询本人费用、报销申请。</Typography.Paragraph><Space><Button type="primary" href="/finance/expenses">费用申请</Button><Button href="/finance/reimbursements">报销申请</Button></Space></Card> : query.isLoading ? <Skeleton active /> : <>
      <Row gutter={[16, 16]} className="finance-overview-stats">
        <Col xs={24} md={12} xl={6}><Card><Statistic title="费用申请" value={overview?.expenseCount ?? 0} prefix={<FileTextOutlined />} /></Card></Col>
        <Col xs={24} md={12} xl={6}><Card><Statistic title="待处理费用" value={overview?.pendingExpenseCount ?? 0} prefix={<AuditOutlined />} /></Card></Col>
        <Col xs={24} md={12} xl={6}><Card><Statistic title="待付款报销" value={overview?.pendingReimbursementCount ?? 0} prefix={<DollarOutlined />} /></Card></Col>
        <Col xs={24} md={12} xl={6}><Card><Statistic title="资金流水" value={overview?.paymentCount ?? 0} prefix={<TransactionOutlined />} /></Card></Col>
      </Row>
      <Card title="财务工作区" className="finance-overview-workspaces">
        <Row gutter={[16, 16]}>
          {[{ href: "/finance/expenses", title: "费用申请", text: "新建、查询、撤回和审批费用申请。", icon: <FileTextOutlined /> }, { href: "/finance/reimbursements", title: "报销审核", text: "查看报销单、审核结果并登记付款。", icon: <AuditOutlined /> }, { href: "/finance/accounts", title: "收款账户", text: "维护可用收款和付款账户。", icon: <BankOutlined /> }, { href: "/finance/ledger", title: "财务流水", text: "按收支方向、账户和日期查询流水。", icon: <TransactionOutlined /> }].map((item) => <Col xs={24} md={12} key={item.href}><Link href={item.href}><Card hoverable><Typography.Title level={4}>{item.icon} {item.title}</Typography.Title><Typography.Text type="secondary">{item.text}</Typography.Text><div><Button type="link">进入工作区</Button></div></Card></Link></Col>)}
        </Row>
      </Card>
    </>}
  </div>;
}
