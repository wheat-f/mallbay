"use client";

import type { ExpenseApplicationSummary, FinanceApprovalStatus } from "@mallbay/shared";
import type { CreateExpensePayload, CreateReimbursementPayload, OrderAuditEvent } from "../../src/lib/api";
import type { PaymentAccountOption } from "../../src/features/orders/api";
import { App, Button, Card, Form, Input, InputNumber, Select, Table, Tag } from "antd";
import { AuditOutlined, DollarOutlined, DownloadOutlined, EyeOutlined, FileAddOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { financeApi, orderApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  FINANCE_REVIEW_OPTIONS,
  formatCentsAsYuan,
  getAuditActorLabel,
  getAuditReasonText,
  getFinanceApplicationLabel,
  getFinanceAuditActionLabel,
  getFinanceApprovalStatusLabel,
  getPaymentAccountTypeLabel,
  getPaymentRecordSourceLabel,
  getPaymentRecordTypeLabel,
  yuanToCents
} from "../../src/features/finance/display";

type PaymentRecordRow = {
  id: string;
  type: string;
  amountCents: number;
  sourceId?: string;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdAt?: string;
};

type MoneyApplicationFormValues = Omit<CreateExpensePayload, "amountCents" | "storeId"> & {
  amountYuan: number;
  storeId?: string;
};

type MoneyReimbursementFormValues = Omit<CreateReimbursementPayload, "amountCents" | "storeId"> & {
  amountYuan: number;
  storeId?: string;
};

type ReviewFormValues = {
  id: string;
  status: FinanceApprovalStatus;
  note?: string;
};

type FinanceSectionKey = "expense" | "reimbursement" | "account" | "ledger";

const FINANCE_SECTION_NAV_ITEMS: Array<{ key: FinanceSectionKey; label: string }> = [
  { key: "expense", label: "费用申请" },
  { key: "reimbursement", label: "报销审核" },
  { key: "account", label: "打款管理" },
  { key: "ledger", label: "财务流水" }
];

export default function FinancePage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [expenseForm] = Form.useForm<MoneyApplicationFormValues>();
  const [reimbursementForm] = Form.useForm<MoneyReimbursementFormValues>();
  const [reviewForm] = Form.useForm<ReviewFormValues>();
  const [selectedReimbursementId, setSelectedReimbursementId] = useState<string>();
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccountOption | null>(null);
  const [ledgerFilter, setLedgerFilter] = useState<"ALL" | "INCOME" | "EXPENSE">("ALL");
  const [activeFinanceSection, setActiveFinanceSection] = useState<FinanceSectionKey>("expense");

  const expensesQuery = useQuery({
    queryKey: ["finance-expenses", storeId],
    queryFn: () => financeApi.expenses(storeId!),
    enabled: Boolean(storeId)
  });
  const reimbursementsQuery = useQuery({
    queryKey: ["finance-reimbursements", storeId],
    queryFn: () => financeApi.reimbursements(storeId!),
    enabled: Boolean(storeId)
  });
  const recordsQuery = useQuery({
    queryKey: ["finance-payment-records", storeId],
    queryFn: () => financeApi.paymentRecords(storeId!),
    enabled: Boolean(storeId)
  });
  const paymentAccountsQuery = useQuery({
    queryKey: ["finance-payment-accounts", storeId],
    queryFn: () => orderApi.paymentAccounts(storeId!),
    enabled: Boolean(storeId)
  });
  const expenseRows = useMemo(() => expensesQuery.data ?? [], [expensesQuery.data]);
  const reimbursementRows = useMemo(() => reimbursementsQuery.data ?? [], [reimbursementsQuery.data]);
  const paymentRecordRows = useMemo(() => (recordsQuery.data ?? []) as PaymentRecordRow[], [recordsQuery.data]);
  const paymentAccountRows = useMemo(() => paymentAccountsQuery.data ?? [], [paymentAccountsQuery.data]);
  const activeSelectedReimbursementId = selectedReimbursementId ?? reimbursementRows[0]?.id;
  const activeSelectedAccount = selectedAccount ?? paymentAccountRows[0] ?? null;
  const accountAuditQuery = useQuery({
    queryKey: ["finance-payment-account-audit", activeSelectedAccount?.id],
    queryFn: () => {
      if (!activeSelectedAccount?.id) throw new Error("请先选择账户");
      return orderApi.paymentAccountAuditEvents(activeSelectedAccount.id);
    },
    enabled: Boolean(activeSelectedAccount?.id)
  });
  const accountAuditRows = useMemo(() => accountAuditQuery.data ?? [], [accountAuditQuery.data]);
  const selectedReimbursement = useMemo(
    () => reimbursementRows.find((row) => row.id === activeSelectedReimbursementId) ?? reimbursementRows[0],
    [activeSelectedReimbursementId, reimbursementRows]
  );
  const expenseOptions = expenseRows.map((expense) => ({
    value: expense.id,
    label: getFinanceApplicationLabel(expense)
  }));
  const reimbursementOptions = reimbursementRows.map((reimbursement) => ({
    value: reimbursement.id,
    label: getFinanceApplicationLabel(reimbursement)
  }));
  const filteredPaymentRecordRows = paymentRecordRows.filter((row) => {
    if (ledgerFilter === "ALL") return true;
    if (ledgerFilter === "INCOME") return row.amountCents >= 0;
    return row.amountCents < 0;
  });
  const financeSummary = {
    expenses: expenseRows.length,
    reimbursements: reimbursementRows.length,
    pendingReimbursements: reimbursementRows.filter((row) => row.status === "PENDING").length,
    paymentRecords: paymentRecordRows.length,
    incomeCents: paymentRecordRows.filter((row) => row.amountCents > 0).reduce((total, row) => total + row.amountCents, 0),
    expenseCents: paymentRecordRows.filter((row) => row.amountCents < 0).reduce((total, row) => total + Math.abs(row.amountCents), 0)
  };

  useEffect(() => {
    reviewForm.resetFields();
    if (selectedReimbursement) {
      reviewForm.setFieldsValue({ id: selectedReimbursement.id });
    }
  }, [reviewForm, selectedReimbursement]);

  const invalidateFinance = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-expenses", storeId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-reimbursements", storeId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-payment-records", storeId] })
    ]);

  const createExpense = useMutation({
    mutationFn: (values: MoneyApplicationFormValues) => {
      if (!storeId) throw new Error("当前账号未加入门店");
      return financeApi.createExpense({
        storeId,
        title: values.title,
        amountCents: yuanToCents(values.amountYuan),
        reason: values.reason
      });
    },
    onSuccess: async () => {
      message.success("费用申请已提交");
      expenseForm.resetFields();
      await invalidateFinance();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const createReimbursement = useMutation({
    mutationFn: (values: MoneyReimbursementFormValues) => {
      if (!storeId) throw new Error("当前账号未加入门店");
      return financeApi.createReimbursement({
        storeId,
        title: values.title,
        amountCents: yuanToCents(values.amountYuan),
        reason: values.reason,
        expenseId: values.expenseId
      });
    },
    onSuccess: async (created) => {
      message.success("报销申请已提交");
      reimbursementForm.resetFields();
      setSelectedReimbursementId(created.id);
      await invalidateFinance();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const reviewReimbursement = useMutation({
    mutationFn: (values: ReviewFormValues) => financeApi.reviewReimbursement(values.id, { status: values.status, note: values.note }),
    onSuccess: async () => {
      message.success("报销审批已更新");
      await invalidateFinance();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const handleQuickReview = async (status: FinanceApprovalStatus) => {
    const values = await reviewForm.validateFields(["id", "note"]);
    reviewReimbursement.mutate({ ...(values as ReviewFormValues), status });
  };

  return (
    <div className="management-page">
      <StorePageHeader title="财务管理" description="费用申请、报销审批、打款记录和财务流水" />

      <div className="finance-command-bar finance-prototype-tabs">
        <div className="finance-tab-list" aria-label="财务模块导航">
          {FINANCE_SECTION_NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeFinanceSection === item.key ? "is-active" : ""}
              aria-pressed={activeFinanceSection === item.key}
              onClick={() => setActiveFinanceSection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="finance-command-actions">
          <Button icon={<DownloadOutlined />} onClick={() => setActiveFinanceSection("ledger")}>
            导出流水
          </Button>
          <Button
            type="primary"
            icon={<FileAddOutlined />}
            onClick={() => {
              if (activeFinanceSection === "expense") {
                expenseForm.submit();
                return;
              }
              setActiveFinanceSection("expense");
            }}
          >
            新增费用
          </Button>
        </div>
      </div>

      <section className="finance-stage-summary" aria-label="财务工作台概览">
        <div>
          <span>费用申请</span>
          <strong>{financeSummary.expenses}</strong>
          <small>已登记费用</small>
        </div>
        <div>
          <span>报销审核</span>
          <strong>{financeSummary.pendingReimbursements}</strong>
          <small>待处理单据</small>
        </div>
        <div>
          <span>打款管理</span>
          <strong>{paymentAccountRows.length}</strong>
          <small>可用账户</small>
        </div>
        <div>
          <span>财务流水</span>
          <strong>{financeSummary.paymentRecords}</strong>
          <small>流水记录</small>
        </div>
      </section>

      {activeFinanceSection === "expense" ? (
      <section className="finance-operation-hero finance-section-panel is-active">
        <Card className="finance-application-panel" title="新建费用申请">
          <Form
            form={expenseForm}
            layout="vertical"
            className="finance-expense-form"
            onFinish={(values) => createExpense.mutate(values)}
          >
            <div className="finance-form-grid">
              <Form.Item name="title" label="费用标题" rules={[{ required: true, message: "请输入费用标题" }]}>
                <Input placeholder="费用标题" />
              </Form.Item>
              <Form.Item name="amountYuan" label="费用金额（元）" rules={[{ required: true, message: "请输入金额" }]}>
                <InputNumber className="w-full" min={0.01} precision={2} placeholder="0.00" />
              </Form.Item>
            </div>
            <Form.Item name="reason" label="费用用途描述" rules={[{ required: true, message: "请输入用途" }]}>
              <Input.TextArea rows={4} placeholder="请详细描述费用产生的原因及用途..." />
            </Form.Item>
            <div className="finance-upload-placeholder">
              <FileAddOutlined />
              <strong>附件上传（发票、凭证等）</strong>
              <span>支持上传发票、付款截图或合同扫描件，审批通过后归档到费用记录。</span>
            </div>
            <div className="finance-form-actions">
              <Button>取消</Button>
              <Button type="primary" htmlType="submit" icon={<FileAddOutlined />} loading={createExpense.isPending}>
                提交申请
              </Button>
            </div>
          </Form>
        </Card>

        <aside className="finance-overview-rail">
          <Card className="finance-flow-card" title="审批流预览">
            <ol className="finance-flow-list">
              <li className="is-done">
                <b>提交申请</b>
                <span>申请人起草</span>
              </li>
              <li className="is-current">
                <b>部门主管审批</b>
                <span>业务合理性审核</span>
              </li>
              <li>
                <b>财务审批</b>
                <span>票据及合规性审核</span>
              </li>
              <li>
                <b>总经理审批</b>
                <span>超额度需终审</span>
              </li>
            </ol>
          </Card>

          <Card className="finance-month-card">
            <span>本月费用概览</span>
            <strong>{formatCentsAsYuan(financeSummary.expenseCents)}</strong>
            <small>已记录支出总额</small>
          </Card>

          <Card className="finance-reimbursement-panel" title="报销申请">
            <Form
              form={reimbursementForm}
              layout="vertical"
              className="finance-reimbursement-form"
              onFinish={(values) => createReimbursement.mutate(values)}
            >
              <Form.Item name="title" label="报销标题" rules={[{ required: true, message: "请输入报销标题" }]}>
                <Input placeholder="报销标题" />
              </Form.Item>
              <Form.Item name="amountYuan" label="金额（元）" rules={[{ required: true, message: "请输入金额" }]}>
                <InputNumber className="w-full" min={0.01} precision={2} placeholder="金额（元）" />
              </Form.Item>
              <Form.Item name="reason" label="事由" rules={[{ required: true, message: "请输入事由" }]}>
                <Input placeholder="事由" />
              </Form.Item>
              <Form.Item name="expenseId" label="关联费用">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  loading={expensesQuery.isLoading}
                  placeholder="选择关联费用"
                  options={expenseOptions}
                />
              </Form.Item>
              <Button type="primary" htmlType="submit" block icon={<DollarOutlined />} loading={createReimbursement.isPending}>
                申请报销
              </Button>
            </Form>
          </Card>
        </aside>
      </section>
      ) : null}

      {activeFinanceSection === "ledger" ? (
      <section className="finance-workspace finance-section-panel finance-workspace-single is-active">
        <div className="finance-main-column">
            <Card className="finance-ledger-list" title="财务流水">
            <div className="finance-ledger-toolbar">
              {[
                ["ALL", "全部流水"],
                ["INCOME", "收入"],
                ["EXPENSE", "支出"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={ledgerFilter === value ? "is-active" : ""}
                  onClick={() => setLedgerFilter(value as "ALL" | "INCOME" | "EXPENSE")}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="finance-ledger-mobile-cards">
              {filteredPaymentRecordRows.length > 0 ? (
                filteredPaymentRecordRows.map((record) => (
                  <article key={record.id} className="finance-ledger-mobile-card">
                    <div className="finance-ledger-mobile-card-head">
                      <div>
                        <strong>{getPaymentRecordTypeLabel(record.type)}</strong>
                        <span>{record.createdAt?.slice(0, 19).replace("T", " ") ?? "-"}</span>
                      </div>
                      <Tag color={record.amountCents >= 0 ? "success" : "error"}>{formatCentsAsYuan(record.amountCents)}</Tag>
                    </div>
                    <dl className="finance-ledger-mobile-card-fields">
                      <div>
                        <dt>来源</dt>
                        <dd>
                          {getPaymentRecordSourceLabel(record, {
                            expenses: expensesQuery.data ?? [],
                            reimbursements: reimbursementsQuery.data ?? []
                          })}
                        </dd>
                      </div>
                      <div>
                        <dt>备注</dt>
                        <dd>{record.note ?? "-"}</dd>
                      </div>
                    </dl>
                    <div className="finance-ledger-mobile-card-actions">
                      <Button type="link" icon={<EyeOutlined />} onClick={() => router.push(`/finance/payment-records/${record.id}`)}>
                        查看详情
                      </Button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="finance-ledger-mobile-empty">暂无财务流水</div>
              )}
            </div>

            <Table<PaymentRecordRow>
              className="finance-ledger-desktop-table"
              rowKey="id"
              loading={recordsQuery.isLoading}
              dataSource={filteredPaymentRecordRows}
              pagination={{ pageSize: 8 }}
              columns={[
                { title: "类型", render: (_, row) => getPaymentRecordTypeLabel(row.type) },
                { title: "金额", render: (_, row) => formatCentsAsYuan(row.amountCents) },
                {
                  title: "来源",
                  render: (_, row) =>
                    getPaymentRecordSourceLabel(row, {
                      expenses: expensesQuery.data ?? [],
                      reimbursements: reimbursementsQuery.data ?? []
                    })
                },
                { title: "备注", dataIndex: "note" },
                { title: "时间", render: (_, row) => row.createdAt?.slice(0, 19).replace("T", " ") ?? "-" },
                {
                  title: "操作",
                  render: (_, row) => (
                    <Button type="link" icon={<EyeOutlined />} onClick={() => router.push(`/finance/payment-records/${row.id}`)}>
                      查看详情
                    </Button>
                  )
                }
              ]}
            />
            </Card>

          <Card className="finance-application-list" title="费用 / 报销单据">
            <div className="finance-application-tables">
              <FinanceTable title="费用申请" rows={expenseRows} loading={expensesQuery.isLoading} />
              <FinanceTable
                title="报销审批"
                rows={reimbursementRows}
                loading={reimbursementsQuery.isLoading}
                onSelect={(row) => setSelectedReimbursementId(row.id)}
                selectedId={selectedReimbursement?.id}
              />
            </div>
          </Card>
        </div>
      </section>
      ) : null}

      {activeFinanceSection === "reimbursement" ? (
      <section className="finance-workspace finance-section-panel is-active">
        <div className="finance-main-column">
          <Card className="finance-reimbursement-panel" title="新建报销申请">
            <Form
              form={reimbursementForm}
              layout="vertical"
              className="finance-reimbursement-form"
              onFinish={(values) => createReimbursement.mutate(values)}
            >
              <div className="finance-form-grid">
                <Form.Item name="title" label="报销标题" rules={[{ required: true, message: "请输入报销标题" }]}>
                  <Input placeholder="报销标题" />
                </Form.Item>
                <Form.Item name="amountYuan" label="金额（元）" rules={[{ required: true, message: "请输入金额" }]}>
                  <InputNumber className="w-full" min={0.01} precision={2} placeholder="金额（元）" />
                </Form.Item>
              </div>
              <Form.Item name="reason" label="事由" rules={[{ required: true, message: "请输入事由" }]}>
                <Input placeholder="事由" />
              </Form.Item>
              <Form.Item name="expenseId" label="关联费用">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  loading={expensesQuery.isLoading}
                  placeholder="选择关联费用"
                  options={expenseOptions}
                />
              </Form.Item>
              <div className="finance-form-actions">
                <Button>取消</Button>
                <Button type="primary" htmlType="submit" icon={<DollarOutlined />} loading={createReimbursement.isPending}>
                  申请报销
                </Button>
              </div>
            </Form>
          </Card>

          <Card className="finance-application-list" title="报销单据队列">
            <FinanceTable
              title="报销审批"
              rows={reimbursementRows}
              loading={reimbursementsQuery.isLoading}
              onSelect={(row) => setSelectedReimbursementId(row.id)}
              selectedId={selectedReimbursement?.id}
            />
          </Card>
        </div>

        <aside className="finance-side-column">
            <Card className="finance-approval-panel">
            <div className="finance-approval-head">
              <div>
                <h2>审批详情</h2>
                <p>{selectedReimbursement ? getFinanceApplicationLabel(selectedReimbursement) : "选择报销单后进行审批"}</p>
              </div>
              <Tag color={selectedReimbursement?.status === "APPROVED" ? "success" : "processing"}>
                {getFinanceApprovalStatusLabel(selectedReimbursement?.status)}
              </Tag>
            </div>

            <div className="finance-approval-summary">
              <div>
                <span>申请金额</span>
                <strong>{selectedReimbursement ? formatCentsAsYuan(selectedReimbursement.amountCents) : "-"}</strong>
              </div>
              <div>
                <span>申请标题</span>
                <strong>{selectedReimbursement?.title ?? "-"}</strong>
              </div>
              <div className="finance-summary-full">
                <span>费用说明</span>
                <strong>{selectedReimbursement?.reason ?? "-"}</strong>
              </div>
            </div>

            <div className="finance-audit-timeline">
              <h3>审核流轨迹</h3>
              <ol>
                <li>
                  <b>创建申请</b>
                  <span>业务人员提交费用或报销申请</span>
                </li>
                <li>
                  <b>财务终审</b>
                  <span>{selectedReimbursement ? getFinanceApprovalStatusLabel(selectedReimbursement.status) : "待选择单据"}</span>
                </li>
              </ol>
            </div>

            <Form
              form={reviewForm}
              layout="vertical"
              className="finance-review-form"
              onFinish={(values) => reviewReimbursement.mutate(values)}
            >
              <Form.Item name="id" label="报销申请" rules={[{ required: true, message: "请选择报销申请" }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={reimbursementsQuery.isLoading}
                  placeholder="选择报销申请"
                  options={reimbursementOptions}
                  onChange={(value) => setSelectedReimbursementId(value)}
                />
              </Form.Item>
              <Form.Item name="status" label="审批结果" rules={[{ required: true, message: "请选择结果" }]}>
                <Select placeholder="审批结果" options={FINANCE_REVIEW_OPTIONS} />
              </Form.Item>
              <Form.Item name="note" label="审批备注">
                <Input.TextArea rows={3} placeholder="填写审批意见或驳回原因" />
              </Form.Item>
              <div className="finance-review-actions">
                <Button htmlType="submit" icon={<AuditOutlined />} loading={reviewReimbursement.isPending}>
                  审批
                </Button>
                <Button danger disabled={!selectedReimbursement} onClick={() => handleQuickReview("REJECTED")}>
                  驳回申请
                </Button>
                <Button
                  type="primary"
                  disabled={!selectedReimbursement}
                  loading={reviewReimbursement.isPending}
                  onClick={() => handleQuickReview("APPROVED")}
                >
                  批准拨款
                </Button>
              </div>
            </Form>
            </Card>
        </aside>
      </section>
      ) : null}

      {activeFinanceSection === "account" ? (
      <section className="finance-workspace finance-section-panel finance-workspace-single is-active">
        <div className="finance-main-column">
            <Card className="finance-account-audit-panel" title="打款管理与对账">
            <div className="finance-subsection-title">待打款列表</div>
            <div className="finance-account-mobile-cards">
              {paymentAccountRows.length > 0 ? (
                paymentAccountRows.map((account) => (
                  <article
                    key={account.id}
                    className={`finance-account-mobile-card${account.id === activeSelectedAccount?.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedAccount(account)}
                  >
                    <div className="finance-account-mobile-card-head">
                      <div>
                        <strong>{account.name}</strong>
                        <span>{maskAccountNo(account.accountNo)}</span>
                      </div>
                      <Tag>{getPaymentAccountTypeLabel(account.type)}</Tag>
                    </div>
                  </article>
                ))
              ) : (
                <div className="finance-account-mobile-empty">暂无账户</div>
              )}
            </div>
            <Table<PaymentAccountOption>
              className="finance-account-desktop-table"
              rowKey="id"
              size="small"
              loading={paymentAccountsQuery.isLoading}
              dataSource={paymentAccountRows}
              pagination={false}
              onRow={(row) => ({
                onClick: () => setSelectedAccount(row)
              })}
              rowClassName={(row) => (row.id === activeSelectedAccount?.id ? "finance-selected-row" : "")}
              columns={[
                { title: "账户", dataIndex: "name" },
                { title: "类型", render: (_, row) => getPaymentAccountTypeLabel(row.type) },
                { title: "账号", render: (_, row) => maskAccountNo(row.accountNo) }
              ]}
            />
            <div className="finance-payout-distribution">
              <div className="finance-subsection-title">打款类型分布</div>
              <div className="finance-payout-distribution-chart" aria-label="打款类型分布">
                <div className="finance-payout-donut">
                  <span>占比</span>
                </div>
                <div className="finance-payout-legend">
                  <span><i className="is-reimbursement" />报销</span>
                  <span><i className="is-ledger" />流水</span>
                </div>
              </div>
              <div className="finance-payout-distribution-metrics">
                <div>
                  <span>待打款报销</span>
                  <strong>{financeSummary.pendingReimbursements} 笔</strong>
                </div>
                <div>
                  <span>支出流水</span>
                  <strong>{formatCentsAsYuan(financeSummary.expenseCents)}</strong>
                </div>
              </div>
            </div>
            <div className="finance-subsection-title">最近对账动态</div>
            <div className="finance-audit-mobile-cards">
              {accountAuditRows.length > 0 ? (
                accountAuditRows.map((event) => (
                  <article key={event.id} className="finance-audit-mobile-card">
                    <div className="finance-audit-mobile-card-head">
                      <div>
                        <strong>{getFinanceAuditActionLabel(event.action)}</strong>
                        <span>{formatDateTime(event.createdAt)}</span>
                      </div>
                    </div>
                    <dl className="finance-audit-mobile-card-fields">
                      <div>
                        <dt>原因</dt>
                        <dd>{getAuditReasonText(event.metadata)}</dd>
                      </div>
                      <div>
                        <dt>操作人</dt>
                        <dd>{getAuditActorLabel(event)}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              ) : (
                <div className="finance-audit-mobile-empty">暂无审计记录</div>
              )}
            </div>
            <Table<OrderAuditEvent>
              rowKey="id"
              className="finance-audit-table finance-audit-desktop-table"
              size="small"
              loading={accountAuditQuery.isLoading}
              dataSource={accountAuditRows}
              pagination={false}
              columns={[
                { title: "类型", render: (_, row) => getFinanceAuditActionLabel(row.action) },
                { title: "原因", render: (_, row) => getAuditReasonText(row.metadata) },
                { title: "操作人", render: (_, row) => getAuditActorLabel(row) },
                { title: "时间", render: (_, row) => formatDateTime(row.createdAt) }
              ]}
            />
            </Card>
        </div>
      </section>
      ) : null}
    </div>
  );
}

function FinanceTable({
  title,
  rows,
  loading,
  selectedId,
  onSelect
}: {
  title: string;
  rows: ExpenseApplicationSummary[];
  loading: boolean;
  selectedId?: string;
  onSelect?: (row: ExpenseApplicationSummary) => void;
}) {
  return (
    <div>
      <h3>{title}</h3>
      <div className="finance-application-mobile-cards">
        {rows.length > 0 ? (
          rows.map((row) => (
            <article
              key={row.id}
              className={`finance-application-mobile-card${row.id === selectedId ? " is-selected" : ""}`}
              onClick={() => onSelect?.(row)}
            >
              <div className="finance-application-mobile-card-head">
                <div>
                  <strong>{getFinanceApplicationLabel(row)}</strong>
                  <span>{row.title}</span>
                </div>
                <Tag>{getFinanceApprovalStatusLabel(row.status)}</Tag>
              </div>
              <dl className="finance-application-mobile-card-fields">
                <div>
                  <dt>金额</dt>
                  <dd>{formatCentsAsYuan(row.amountCents)}</dd>
                </div>
                <div>
                  <dt>事由</dt>
                  <dd>{row.reason}</dd>
                </div>
              </dl>
            </article>
          ))
        ) : (
          <div className="finance-application-mobile-empty">暂无数据</div>
        )}
      </div>
      <Table<ExpenseApplicationSummary>
        className="finance-application-desktop-table"
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={rows}
        pagination={{ pageSize: 5 }}
        onRow={(row) => ({
          onClick: () => onSelect?.(row)
        })}
        rowClassName={(row) => (row.id === selectedId ? "finance-selected-row" : "")}
        columns={[
          { title: "申请", render: (_, row) => getFinanceApplicationLabel(row) },
          { title: "标题", dataIndex: "title" },
          { title: "金额", render: (_, row) => formatCentsAsYuan(row.amountCents) },
          { title: "事由", dataIndex: "reason" },
          { title: "状态", render: (_, row) => <Tag>{getFinanceApprovalStatusLabel(row.status)}</Tag> }
        ]}
      />
    </div>
  );
}

function maskAccountNo(value?: string | null) {
  if (!value) return "-";
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
