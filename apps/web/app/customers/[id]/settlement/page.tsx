"use client";

import {
  Alert,
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography
} from "antd";
import {
  ArrowLeftOutlined,
  BankOutlined,
  CheckCircleOutlined,
  FileDoneOutlined,
  ReloadOutlined,
  RollbackOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  customerSettlementApi,
  type CustomerReceipt,
  type CustomerStatement,
  type ReceiptAllocationInput,
  type SettlementOrder
} from "../../../../src/features/customer-settlements/api";
import { customerApi } from "../../../../src/features/customers/api";
import { orderApi } from "../../../../src/features/orders/api";
import { useAuthStore } from "../../../../src/stores/auth-store";

type CustomerSummary = {
  id: string;
  storeId: string;
  customerType: "PERSONAL" | "COMPANY";
  name?: string | null;
  companyName?: string | null;
};

type ReceiptFormValues = {
  amountYuan: number;
  accountId: string;
  receivedAt: Dayjs;
  payerName?: string;
  bankSerialNo?: string;
  note?: string;
};

type ReverseFormValues = {
  amountYuan: number;
  reason: string;
};

const statementStatus = {
  DRAFT: { text: "草稿", color: "default" },
  CONFIRMED: { text: "已确认", color: "green" },
  VOIDED: { text: "已作废", color: "red" }
} as const;

const receiptStatus = {
  DRAFT: { text: "草稿", color: "default" },
  POSTED: { text: "已入账", color: "green" },
  REVERSED: { text: "已全部红冲", color: "red" }
} as const;

export default function CustomerSettlementPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [receiptForm] = Form.useForm<ReceiptFormValues>();
  const [reverseForm] = Form.useForm<ReverseFormValues>();
  const [period, setPeriod] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("month"),
    dayjs().endOf("month")
  ]);
  const [selectedStatementOrders, setSelectedStatementOrders] = useState<React.Key[]>([]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptOrderIds, setReceiptOrderIds] = useState<React.Key[]>([]);
  const [receiptAllocations, setReceiptAllocations] = useState<ReceiptAllocationInput[]>([]);
  const [reverseReceipt, setReverseReceipt] = useState<CustomerReceipt | null>(null);

  const customerId = params.id;
  const position = user?.storeMember?.position;
  const canManageReceipts = Boolean(
    user?.isAuditor || position === "MANAGER" || position === "FINANCE"
  );
  const canReverseReceipts = Boolean(user?.isAuditor || position === "FINANCE");

  const customerQuery = useQuery({
    queryKey: ["customer-settlement-customer", customerId],
    queryFn: async () => customerApi.detail(customerId) as Promise<CustomerSummary>
  });
  const customer = customerQuery.data;
  const storeId = customer?.storeId ?? user?.storeMember?.store.id;
  const periodStart = period[0].format("YYYY-MM-DD");
  const periodEnd = period[1].format("YYYY-MM-DD");
  const isCompany = customer?.customerType === "COMPANY";

  const candidatesQuery = useQuery({
    queryKey: [
      "customer-statement-candidates",
      storeId,
      customerId,
      periodStart,
      periodEnd
    ],
    queryFn: () => customerSettlementApi.statementCandidates({
      storeId: storeId!,
      customerId,
      periodStart,
      periodEnd
    }),
    enabled: Boolean(storeId && isCompany)
  });
  const statementsQuery = useQuery({
    queryKey: ["customer-statements", storeId, customerId],
    queryFn: () => customerSettlementApi.statements({
      storeId: storeId!,
      customerId
    }),
    enabled: Boolean(storeId && isCompany)
  });
  const receiptsQuery = useQuery({
    queryKey: ["customer-receipts", storeId, customerId],
    queryFn: () => customerSettlementApi.receipts({
      storeId: storeId!,
      customerId
    }),
    enabled: Boolean(storeId && isCompany && canManageReceipts)
  });
  const accountsQuery = useQuery({
    queryKey: ["payment-accounts", storeId],
    queryFn: () => orderApi.paymentAccounts(storeId!),
    enabled: Boolean(storeId && receiptOpen)
  });

  const candidates = candidatesQuery.data?.items ?? [];
  const summary = useMemo(
    () => candidates.reduce(
      (total, order) => ({
        orders: total.orders + 1,
        receivableCents: total.receivableCents + (order.amount?.totalAmountCents ?? 0),
        receivedCents: total.receivedCents + (order.amount?.paidAmountCents ?? 0),
        outstandingCents: total.outstandingCents + (order.amount?.outstandingCents ?? 0)
      }),
      { orders: 0, receivableCents: 0, receivedCents: 0, outstandingCents: 0 }
    ),
    [candidates]
  );

  const refreshSettlementData = () => {
    void queryClient.invalidateQueries({ queryKey: ["customer-statement-candidates", storeId, customerId] });
    void queryClient.invalidateQueries({ queryKey: ["customer-statements", storeId, customerId] });
    void queryClient.invalidateQueries({ queryKey: ["customer-receipts", storeId, customerId] });
    void queryClient.invalidateQueries({ queryKey: ["customer", customerId] });
  };

  const createStatementMutation = useMutation({
    mutationFn: () => customerSettlementApi.createStatement({
      storeId: storeId!,
      customerId,
      periodStart,
      periodEnd,
      orderIds: selectedStatementOrders.map(String)
    }),
    onSuccess: () => {
      message.success("对账单草稿已生成");
      setSelectedStatementOrders([]);
      refreshSettlementData();
    }
  });
  const confirmStatementMutation = useMutation({
    mutationFn: (id: string) => customerSettlementApi.confirmStatement(id),
    onSuccess: () => {
      message.success("对账单已确认");
      refreshSettlementData();
    }
  });
  const voidStatementMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      customerSettlementApi.voidStatement(id, reason),
    onSuccess: () => {
      message.success("对账单已作废");
      refreshSettlementData();
    }
  });
  const previewReceiptMutation = useMutation({
    mutationFn: (values: ReceiptFormValues) =>
      customerSettlementApi.previewReceipt({
        storeId: storeId!,
        customerId,
        amountCents: yuanToCents(values.amountYuan),
        orderIds: receiptOrderIds.map(String)
      }),
    onSuccess: (preview) => setReceiptAllocations(preview.allocations)
  });
  const createReceiptMutation = useMutation({
    mutationFn: (values: ReceiptFormValues) =>
      customerSettlementApi.createReceipt({
        storeId: storeId!,
        customerId,
        accountId: values.accountId,
        amountCents: yuanToCents(values.amountYuan),
        receivedAt: values.receivedAt.toISOString(),
        payerName: values.payerName,
        bankSerialNo: values.bankSerialNo,
        note: values.note,
        allocations: receiptAllocations
      }),
    onSuccess: () => {
      message.success("企业统一收款已入账并完成逐单分摊");
      setReceiptOpen(false);
      setReceiptAllocations([]);
      receiptForm.resetFields();
      refreshSettlementData();
    }
  });
  const reverseReceiptMutation = useMutation({
    mutationFn: (values: ReverseFormValues) =>
      customerSettlementApi.reverseReceipt(reverseReceipt!.id, {
        amountCents: yuanToCents(values.amountYuan),
        reason: values.reason
      }),
    onSuccess: () => {
      message.success("收款红冲已入账，订单待收金额已恢复");
      setReverseReceipt(null);
      reverseForm.resetFields();
      refreshSettlementData();
    }
  });

  const openReceipt = () => {
    const outstandingOrderIds = candidates
      .filter((order) => (order.amount?.outstandingCents ?? 0) > 0)
      .map((order) => order.id);
    setReceiptOrderIds(outstandingOrderIds);
    setReceiptAllocations([]);
    setReceiptOpen(true);
    const defaultAccount = accountsQuery.data?.find((account) => account.isDefault)
      ?? accountsQuery.data?.[0];
    receiptForm.setFieldsValue({
      receivedAt: dayjs(),
      amountYuan: summary.outstandingCents / 100,
      accountId: defaultAccount?.id
    });
  };

  const previewReceipt = async () => {
    const values = await receiptForm.validateFields(["amountYuan"]);
    if (receiptOrderIds.length === 0) {
      message.warning("请选择至少一笔仍有待收金额的订单");
      return;
    }
    await previewReceiptMutation.mutateAsync(values as ReceiptFormValues);
  };

  const submitReceipt = async () => {
    const values = await receiptForm.validateFields();
    const amountCents = yuanToCents(values.amountYuan);
    const allocationTotal = receiptAllocations.reduce(
      (sum, allocation) => sum + allocation.amountCents,
      0
    );
    if (receiptAllocations.length === 0 || allocationTotal !== amountCents) {
      message.warning("请先预览分摊，并确保分摊合计等于本次收款");
      return;
    }
    await createReceiptMutation.mutateAsync(values);
  };

  const requestVoidStatement = (statement: CustomerStatement) => {
    let reason = "";
    modal.confirm({
      title: "作废对账单",
      content: (
        <Input.TextArea
          autoSize={{ minRows: 3 }}
          placeholder="请输入作废原因，操作将写入审计记录"
          onChange={(event) => { reason = event.target.value; }}
        />
      ),
      okText: "确认作废",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        if (!reason.trim()) {
          message.warning("请输入作废原因");
          return Promise.reject();
        }
        await voidStatementMutation.mutateAsync({ id: statement.id, reason });
      }
    });
  };

  if (customerQuery.isLoading) {
    return <Card loading />;
  }
  if (!customer) {
    return <Empty description="客户不存在或无权访问" />;
  }
  if (!isCompany) {
    return (
      <Card>
        <Empty description="企业统一对账与收款仅适用于企业客户">
          <Button onClick={() => router.push(`/customers/${customerId}`)}>返回客户详情</Button>
        </Empty>
      </Card>
    );
  }

  return (
    <div className="customer-settlement-page">
      <Card className="customer-settlement-hero">
        <div className="customer-settlement-hero-content">
          <div>
            <Typography.Title level={2} className="customer-settlement-title">
              {customer.companyName ?? customer.name ?? "企业客户"} · 对账与统一收款
            </Typography.Title>
            <Typography.Text type="secondary" className="customer-settlement-description">
              一车一订单保持不变；此处按企业汇总对账，并把一笔收款逐单分摊。
            </Typography.Text>
          </div>
          <Space wrap className="customer-settlement-actions">
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push(`/customers/${customerId}`)}
            >
              返回客户详情
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={refreshSettlementData}
            >
              刷新
            </Button>
            {canManageReceipts ? (
              <Button
                type="primary"
                icon={<BankOutlined />}
                disabled={summary.outstandingCents <= 0}
                onClick={openReceipt}
              >
                登记统一收款
              </Button>
            ) : null}
          </Space>
        </div>
        {canManageReceipts && summary.outstandingCents <= 0 ? (
          <Typography.Text type="secondary" className="customer-settlement-action-note">
            当前对账期间没有待收金额，登记统一收款暂不可用。
          </Typography.Text>
        ) : null}
      </Card>

      <Card title="对账期间" className="customer-settlement-period-card">
        <div className="customer-settlement-period-content">
          <DatePicker.RangePicker
            className="customer-settlement-period-picker"
            value={period}
            allowClear={false}
            onChange={(value) => {
              if (value?.[0] && value[1]) {
                setPeriod([value[0], value[1]]);
                setSelectedStatementOrders([]);
                setReceiptAllocations([]);
              }
            }}
          />
          <Typography.Text type="secondary">
            默认本月；对账单只纳入期间内已完工或已质保订单。
          </Typography.Text>
        </div>
      </Card>

      <div className="customer-settlement-summary-grid" aria-label="对账汇总">
        <Card className="customer-settlement-summary-card">
          <Statistic title="订单数" value={summary.orders} suffix="单" />
        </Card>
        <Card className="customer-settlement-summary-card">
          <Statistic title="应收金额" value={summary.receivableCents / 100} precision={2} prefix="¥" />
        </Card>
        <Card className="customer-settlement-summary-card customer-settlement-summary-card-success">
          <Statistic title="已收金额" value={summary.receivedCents / 100} precision={2} prefix="¥" />
        </Card>
        <Card className="customer-settlement-summary-card customer-settlement-summary-card-warning">
          <Statistic title="待收金额" value={summary.outstandingCents / 100} precision={2} prefix="¥" />
        </Card>
      </div>

      <Card
        className="customer-settlement-section-card"
        title="可对账订单"
        extra={
          <Button
            type="primary"
            icon={<FileDoneOutlined />}
            disabled={selectedStatementOrders.length === 0}
            loading={createStatementMutation.isPending}
            onClick={() => createStatementMutation.mutate()}
          >
            生成对账单草稿（{selectedStatementOrders.length}）
          </Button>
        }
      >
        <div className="customer-settlement-selection-bar" aria-live="polite">
          <span>仅显示当前期间内已完工或已质保的订单</span>
          <strong>已选择 {selectedStatementOrders.length} 单</strong>
        </div>
<Table<SettlementOrder>
          rowKey="id"
          loading={candidatesQuery.isLoading}
          dataSource={candidates}
          pagination={false}
          scroll={{ x: 920 }}
          rowSelection={{
            selectedRowKeys: selectedStatementOrders,
            onChange: setSelectedStatementOrders
          }}
          columns={[
            { title: "订单号", dataIndex: "orderNo", width: 180 },
            {
              title: "车辆",
              width: 150,
              render: (_, order) => order.vehicle?.carPlate ?? order.vehicle?.carModel ?? "-"
            },
            {
              title: "联系人/部门",
              width: 160,
              render: (_, order) => [
                order.contactSnapshot?.contactName,
                order.contactSnapshot?.department ?? order.vehicle?.department
              ].filter(Boolean).join(" / ") || "-"
            },
            {
              title: "订单日期",
              width: 120,
              render: (_, order) => dayjs(order.createdAt).format("YYYY-MM-DD")
            },
            {
              title: "订单金额",
              align: "right",
              render: (_, order) => formatCurrency(order.amount?.totalAmountCents)
            },
            {
              title: "已收",
              align: "right",
              render: (_, order) => formatCurrency(order.amount?.paidAmountCents)
            },
            {
              title: "待收",
              align: "right",
              render: (_, order) => formatCurrency(order.amount?.outstandingCents)
            }
          ]}
          locale={{ emptyText: <Empty description="当前期间暂无可对账订单" /> }}
        />
      </Card>

      <Card title="对账单记录" className="customer-settlement-section-card">
        {statementsQuery.data?.semantics ? (
          <Alert
            showIcon
            type="info"
            className="mb-4"
            message="对账口径已明确"
            description={`按订单创建时间纳入已完成或已质保订单；应收按订单总额，已收按订单已收，待收按订单未收，逐单分摊记录为对账单明细。生成于 ${dayjs(statementsQuery.data.generatedAt).format("YYYY-MM-DD HH:mm")}`}
          />
        ) : null}
        <Table<CustomerStatement>
          rowKey="id"
          loading={statementsQuery.isLoading}
          dataSource={statementsQuery.data?.items ?? []}
          pagination={{ pageSize: 8 }}
          scroll={{ x: 980 }}
          expandable={{
            expandedRowRender: (statement) => (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={statement.items}
                columns={[
                  { title: "订单号", render: (_, item) => item.order.orderNo },
                  { title: "车辆", render: (_, item) => item.order.vehicle?.carPlate ?? item.order.vehicle?.carModel ?? "-" },
                  { title: "订单金额", align: "right", render: (_, item) => formatCurrency(item.orderAmountCents) },
                  { title: "已收", align: "right", render: (_, item) => formatCurrency(item.paidAmountCents) },
                  { title: "待收", align: "right", render: (_, item) => formatCurrency(item.outstandingCents) }
                ]}
              />
            )
          }}
          columns={[
            { title: "对账单号", dataIndex: "statementNo", width: 210 },
            {
              title: "期间",
              width: 210,
              render: (_, item) => `${dayjs(item.periodStart).format("YYYY-MM-DD")} 至 ${dayjs(item.periodEnd).format("YYYY-MM-DD")}`
            },
            { title: "订单数", render: (_, item) => item.items.length },
            { title: "应收", align: "right", render: (_, item) => formatCurrency(item.receivableCents) },
            { title: "已收", align: "right", render: (_, item) => formatCurrency(item.receivedCents) },
            { title: "待收", align: "right", render: (_, item) => formatCurrency(item.outstandingCents) },
            {
              title: "状态",
              render: (_, item) => {
                const status = statementStatus[item.status];
                return <Tag color={status.color}>{status.text}</Tag>;
              }
            },
            {
              title: "操作",
              fixed: "right",
              render: (_, item) => (
                <Space>
                  {item.status === "DRAFT" ? (
                    <Button
                      size="small"
                      type="link"
                      loading={confirmStatementMutation.isPending}
                      onClick={() => confirmStatementMutation.mutate(item.id)}
                    >
                      确认
                    </Button>
                  ) : null}
                  {item.status !== "VOIDED" && canManageReceipts ? (
                    <Button size="small" type="link" danger onClick={() => requestVoidStatement(item)}>
                      作废
                    </Button>
                  ) : null}
                </Space>
              )
            }
          ]}
          locale={{ emptyText: <Empty description="尚未生成对账单" /> }}
        />
      </Card>

      {canManageReceipts ? (
        <Card title="统一收款与红冲记录" className="customer-settlement-section-card">
          <Alert
            showIcon
            type="info"
            className="mb-4"
            message="一笔企业收款只形成一条资金流水，但会保留逐单分摊；红冲不删除原记录。"
          />
          <Table<CustomerReceipt>
            rowKey="id"
            loading={receiptsQuery.isLoading}
            dataSource={receiptsQuery.data?.items ?? []}
            pagination={{ pageSize: 8 }}
            scroll={{ x: 980 }}
            expandable={{
              expandedRowRender: (receipt) => (
                <Descriptions bordered size="small" column={1}>
                  {receipt.allocations.map((allocation) => {
                    const reversed = allocation.reversalAllocations.reduce(
                      (sum, item) => sum + item.amountCents,
                      0
                    );
                    return (
                      <Descriptions.Item key={allocation.id} label={allocation.order.orderNo}>
                        分摊 {formatCurrency(allocation.amountCents)}
                        {reversed > 0 ? ` / 已红冲 ${formatCurrency(reversed)}` : ""}
                      </Descriptions.Item>
                    );
                  })}
                </Descriptions>
              )
            }}
            columns={[
              { title: "收款单号", dataIndex: "receiptNo", width: 210 },
              { title: "收款日期", render: (_, item) => dayjs(item.receivedAt).format("YYYY-MM-DD HH:mm") },
              { title: "资金账户", render: (_, item) => item.account?.name ?? "-" },
              { title: "收款金额", align: "right", render: (_, item) => formatCurrency(item.amountCents) },
              { title: "已红冲", align: "right", render: (_, item) => formatCurrency(item.reversedAmountCents) },
              { title: "分摊订单", render: (_, item) => `${item.allocations.length} 单` },
              {
                title: "状态",
                render: (_, item) => {
                  const status = receiptStatus[item.status];
                  return <Tag color={status.color}>{status.text}</Tag>;
                }
              },
              {
                title: "操作",
                fixed: "right",
                render: (_, item) => canReverseReceipts && item.reversibleAmountCents > 0 ? (
                  <Button
                    type="link"
                    danger
                    icon={<RollbackOutlined />}
                    onClick={() => {
                      setReverseReceipt(item);
                      reverseForm.setFieldsValue({
                        amountYuan: item.reversibleAmountCents / 100,
                        reason: ""
                      });
                    }}
                  >
                    红冲
                  </Button>
                ) : "-"
              }
            ]}
            locale={{ emptyText: <Empty description="暂无企业统一收款记录" /> }}
          />
        </Card>
      ) : null}

      <Drawer
        width={720}
        open={receiptOpen}
        title="登记企业统一收款"
        onClose={() => {
          setReceiptOpen(false);
          setReceiptAllocations([]);
        }}
        extra={
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={createReceiptMutation.isPending}
            onClick={submitReceipt}
          >
            确认入账
          </Button>
        }
      >
        <Alert
          showIcon
          type="info"
          message="先选择订单并预览分摊；系统按完工时间、下单时间、订单号依次冲销最早欠款，您可以在入账前手工调整。"
          className="mb-4"
        />
        <Form<ReceiptFormValues> form={receiptForm} layout="vertical">
          <div className="grid gap-4 md:grid-cols-2">
            <Form.Item name="amountYuan" label="本次收款（元）" rules={[{ required: true, message: "请输入收款金额" }]}>
              <InputNumber min={0.01} precision={2} className="w-full" prefix="¥" />
            </Form.Item>
            <Form.Item name="receivedAt" label="收款时间" rules={[{ required: true, message: "请选择收款时间" }]}>
              <DatePicker showTime className="w-full" />
            </Form.Item>
            <Form.Item name="accountId" label="资金账户" rules={[{ required: true, message: "请选择资金账户" }]}>
              <Select
                loading={accountsQuery.isLoading}
                options={(accountsQuery.data ?? []).map((account) => ({
                  label: account.name,
                  value: account.id
                }))}
              />
            </Form.Item>
            <Form.Item name="payerName" label="付款方名称">
              <Input placeholder="例如：企业全称或付款人" />
            </Form.Item>
            <Form.Item name="bankSerialNo" label="银行流水号">
              <Input placeholder="可选，用于财务核对" />
            </Form.Item>
          </div>
          <Form.Item name="note" label="收款备注">
            <Input.TextArea autoSize={{ minRows: 2 }} />
          </Form.Item>
        </Form>

        <Card
          size="small"
          title="参与分摊的订单"
          extra={
            <Button loading={previewReceiptMutation.isPending} onClick={previewReceipt}>
              预览自动分摊
            </Button>
          }
        >
          <Table<SettlementOrder>
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={candidates.filter((order) => (order.amount?.outstandingCents ?? 0) > 0)}
            rowSelection={{
              selectedRowKeys: receiptOrderIds,
              onChange: (keys) => {
                setReceiptOrderIds(keys);
                setReceiptAllocations([]);
              }
            }}
            columns={[
              { title: "订单", dataIndex: "orderNo" },
              { title: "车辆", render: (_, item) => item.vehicle?.carPlate ?? item.vehicle?.carModel ?? "-" },
              { title: "待收", align: "right", render: (_, item) => formatCurrency(item.amount?.outstandingCents) }
            ]}
          />
        </Card>

        {receiptAllocations.length > 0 ? (
          <Card size="small" title="逐单分摊结果" className="mt-4">
            <Table
              rowKey="orderId"
              size="small"
              pagination={false}
              dataSource={receiptAllocations}
              columns={[
                {
                  title: "订单号",
                  render: (_, allocation) =>
                    candidates.find((order) => order.id === allocation.orderId)?.orderNo ?? allocation.orderId
                },
                {
                  title: "本次分摊（元）",
                  align: "right",
                  render: (_, allocation) => (
                    <InputNumber
                      min={0.01}
                      precision={2}
                      value={allocation.amountCents / 100}
                      onChange={(value) => setReceiptAllocations((current) =>
                        current.map((item) => item.orderId === allocation.orderId
                          ? { ...item, amountCents: yuanToCents(value ?? 0) }
                          : item
                        )
                      )}
                    />
                  )
                }
              ]}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>分摊合计</Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="right">
                    {formatCurrency(receiptAllocations.reduce((sum, item) => sum + item.amountCents, 0))}
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />
          </Card>
        ) : null}
      </Drawer>

      <Drawer
        width={480}
        open={Boolean(reverseReceipt)}
        title="红冲企业收款"
        onClose={() => setReverseReceipt(null)}
        extra={
          <Popconfirm
            title="确认执行收款红冲？"
            description="原收款与分摊记录会保留，并新增反向资金流水。"
            okText="确认红冲"
            cancelText="取消"
            onConfirm={async () => {
              const values = await reverseForm.validateFields();
              await reverseReceiptMutation.mutateAsync(values);
            }}
          >
            <Button danger loading={reverseReceiptMutation.isPending}>确认红冲</Button>
          </Popconfirm>
        }
      >
        <Alert
          showIcon
          type="warning"
          message={`原收款 ${formatCurrency(reverseReceipt?.amountCents)}，剩余可红冲 ${formatCurrency(reverseReceipt?.reversibleAmountCents)}`}
          className="mb-4"
        />
        <Form<ReverseFormValues> form={reverseForm} layout="vertical">
          <Form.Item name="amountYuan" label="红冲金额（元）" rules={[{ required: true, message: "请输入红冲金额" }]}>
            <InputNumber
              min={0.01}
              max={(reverseReceipt?.reversibleAmountCents ?? 0) / 100}
              precision={2}
              prefix="¥"
              className="w-full"
            />
          </Form.Item>
          <Form.Item name="reason" label="红冲原因" rules={[{ required: true, whitespace: true, message: "请输入红冲原因" }]}>
            <Input.TextArea autoSize={{ minRows: 4 }} />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

function yuanToCents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

function formatCurrency(value?: number | null) {
  return `¥${((value ?? 0) / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
