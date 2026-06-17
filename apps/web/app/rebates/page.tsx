"use client";

import type { RebateStatus, RebateSummary } from "@mallbay/shared";
import type { ApplyRebatePayload } from "../../src/lib/api";
import { App, Button, Card, Drawer, Form, Input, InputNumber, Select, Table, Tag } from "antd";
import { CheckCircleOutlined, InfoCircleOutlined, PayCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { orderApi, rebatesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { formatCentsAsYuan, yuanToCents } from "../../src/features/finance/display";
import {
  getRebateBusinessLabel,
  getRebateCustomerLabel,
  getRebateOrderLabel,
  getRebateReviewOptionsForRole,
  getRebateStatusLabel
} from "../../src/features/rebates/display";

type ApplyRebateFormValues = Omit<ApplyRebatePayload, "amountCents"> & {
  amountYuan: number;
};

type RebateActionValues = {
  id: string;
  status?: RebateStatus;
  note?: string;
  payoutMode?: "CASH" | "DEDUCT";
};

type RebateOrderOption = {
  id: string;
  orderNo?: string | null;
  customer?: { personalName?: string | null; companyName?: string | null; name?: string | null } | null;
  vehicle?: { plateNo?: string | null } | null;
};

type RebateWorkflowSectionKey = "application" | "review" | "finance" | "payout" | "report";

const REBATE_WORKFLOW_TABS: Array<{ key: RebateWorkflowSectionKey; label: string }> = [
  { key: "application", label: "返利申请" },
  { key: "review", label: "返利审核" },
  { key: "finance", label: "财务审批" },
  { key: "payout", label: "返利发放" },
  { key: "report", label: "返利报表" }
];

export default function RebatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [applyForm] = Form.useForm<ApplyRebateFormValues>();
  const [rebateActionForm] = Form.useForm<RebateActionValues>();
  const [selectedRebateId, setSelectedRebateId] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [applicationDrawerOpen, setApplicationDrawerOpen] = useState(false);
  const [activeRebateSection, setActiveRebateSection] = useState<RebateWorkflowSectionKey>("application");
  const rebateRulesSectionRef = useRef<HTMLDivElement | null>(null);
  const rebateReviewSectionRef = useRef<HTMLDivElement | null>(null);
  const rebatePayoutSectionRef = useRef<HTMLDivElement | null>(null);
  const rebateReportSectionRef = useRef<HTMLDivElement | null>(null);
  const rebateSectionRefs = useMemo(
    () => ({
      application: rebateRulesSectionRef,
      review: rebateReviewSectionRef,
      finance: rebateReviewSectionRef,
      payout: rebatePayoutSectionRef,
      report: rebateReportSectionRef
    }),
    []
  );

  const rebatesQuery = useQuery({
    queryKey: ["rebates", storeId],
    queryFn: () => rebatesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const rebateOrdersQuery = useQuery({
    queryKey: ["rebates", "orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "COMPLETED", paymentStatus: "PAID", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const rebateOrderOptions = ((rebateOrdersQuery.data?.items ?? []) as RebateOrderOption[]).map((order) => ({
    value: order.id,
    label: [
      order.orderNo ?? "未编号订单",
      order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name,
      order.vehicle?.plateNo
    ].filter(Boolean).join(" / ")
  }));
  const rebateRows = useMemo(() => rebatesQuery.data ?? [], [rebatesQuery.data]);
  const rebateOptions = rebateRows.map((rebate) => ({
    value: rebate.id,
    label: getRebateBusinessLabel(rebate)
  }));
  const activeRebateId = selectedRebateId ?? rebateRows[0]?.id;
  const selectedRebate = useMemo(
    () => rebateRows.find((rebate) => rebate.id === activeRebateId) ?? rebateRows[0],
    [activeRebateId, rebateRows]
  );
  const filteredRebateRows =
    statusFilter === "ALL" ? rebateRows : rebateRows.filter((rebate) => rebate.status === statusFilter);
  const rebateReviewOptions = getRebateReviewOptionsForRole(user?.storeMember?.position, user?.isAuditor);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["rebates", storeId] });

  useEffect(() => {
    rebateActionForm.resetFields();
    if (selectedRebate) {
      rebateActionForm.setFieldsValue({
        id: selectedRebate.id,
        payoutMode: "DEDUCT"
      });
    }
  }, [rebateActionForm, selectedRebate]);

  const applyRebate = useMutation({
    mutationFn: (values: ApplyRebateFormValues) =>
      rebatesApi.apply({
        orderId: values.orderId,
        amountCents: yuanToCents(values.amountYuan),
        reason: values.reason
      }),
    onSuccess: async (created) => {
      message.success("返利申请已提交");
      applyForm.resetFields();
      setApplicationDrawerOpen(false);
      setSelectedRebateId(created.id);
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const reviewRebate = useMutation({
    mutationFn: (values: RebateActionValues) => rebatesApi.review(values.id, { status: values.status!, note: values.note }),
    onSuccess: async () => {
      message.success("返利审核已更新");
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const payRebate = useMutation({
    mutationFn: (values: RebateActionValues) => rebatesApi.pay(values.id, values.note),
    onSuccess: async () => {
      message.success("返利已发放");
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const handleReview = async (status?: RebateStatus) => {
    const values = await rebateActionForm.validateFields(status ? ["id", "note"] : ["id", "status", "note"]);
    reviewRebate.mutate({ ...(values as RebateActionValues), status: status ?? (values as RebateActionValues).status });
  };
  const handlePay = async () => {
    const values = await rebateActionForm.validateFields(["id", "note"]);
    payRebate.mutate(values as RebateActionValues);
  };
  const scrollRebateSectionIntoView = useCallback(
    (sectionKey: RebateWorkflowSectionKey) => {
      setActiveRebateSection(sectionKey);
      rebateSectionRefs[sectionKey].current?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    [rebateSectionRefs]
  );

  return (
    <div className="management-page">
      <StorePageHeader title="返利管理" />

      <div className="rebate-tabs">
        {REBATE_WORKFLOW_TABS.map((item) => (
          <button
            key={item.key}
            className={activeRebateSection === item.key ? "is-active" : ""}
            type="button"
            aria-pressed={activeRebateSection === item.key}
            onClick={() => scrollRebateSectionIntoView(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="rebate-workspace">
        <div className="rebate-main-column">
          <div ref={rebateRulesSectionRef}>
            <Card className="rebate-rules-card">
              <h2>
                <InfoCircleOutlined />
                申请规则说明
              </h2>
              <ul className="rebate-rules-list">
                <li>关联订单必须处于「已完成」且「全额付款」状态。</li>
                <li>返利金额必须 &gt; 0，且必须填写明确的返利原因。</li>
              </ul>
            </Card>
          </div>

          <div ref={rebateReportSectionRef}>
            <Card
              className="rebate-application-list"
              title="返利申请列表"
              extra={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setApplicationDrawerOpen(true)}>
                  新建申请
                </Button>
              }
            >
              <div className="rebate-filter-row">
                <span>状态</span>
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "ALL", label: "全部" },
                    { value: "APPLIED", label: "待审核" },
                    { value: "REVIEWED", label: "待审批" },
                    { value: "APPROVED", label: "待发放" },
                    { value: "REJECTED", label: "已驳回" },
                    { value: "PAID", label: "已发放" }
                  ]}
                />
                <Button onClick={() => setStatusFilter("ALL")}>清除过滤</Button>
              </div>

            <div className="rebate-mobile-cards">
              {filteredRebateRows.length > 0 ? (
                filteredRebateRows.map((rebate) => (
                  <article
                    key={rebate.id}
                    className={`rebate-mobile-card${rebate.id === selectedRebate?.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedRebateId(rebate.id)}
                  >
                    <div className="rebate-mobile-card-head">
                      <div>
                        <strong>{getRebateBusinessLabel(rebate)}</strong>
                        <span>{getRebateOrderLabel(rebate)}</span>
                      </div>
                      <Tag>{getRebateStatusLabel(rebate.status)}</Tag>
                    </div>
                    <dl className="rebate-mobile-card-fields">
                      <div>
                        <dt>金额</dt>
                        <dd>{formatCentsAsYuan(rebate.amountCents)}</dd>
                      </div>
                      <div>
                        <dt>客户信息</dt>
                        <dd>{getRebateCustomerLabel(rebate)}</dd>
                      </div>
                      <div>
                        <dt>状态</dt>
                        <dd>{getRebateStatusLabel(rebate.status)}</dd>
                      </div>
                      <div className="rebate-mobile-card-reason">
                        <dt>原因</dt>
                        <dd>{rebate.reason}</dd>
                      </div>
                    </dl>
                  </article>
                ))
              ) : (
                <div className="rebate-mobile-empty">暂无返利申请</div>
              )}
            </div>

            <Table<RebateSummary>
              className="rebate-desktop-table"
              rowKey="id"
              loading={rebatesQuery.isLoading}
              dataSource={filteredRebateRows}
              pagination={{ pageSize: 8 }}
              onRow={(row) => ({
                onClick: () => setSelectedRebateId(row.id)
              })}
              rowClassName={(row) => (row.id === selectedRebate?.id ? "rebate-selected-row" : "")}
              columns={[
                { title: "返利单号", render: (_, row) => getRebateBusinessLabel(row) },
                { title: "关联订单", render: (_, row) => getRebateOrderLabel(row) },
                { title: "客户信息", render: (_, row) => getRebateCustomerLabel(row) },
                { title: "返利金额", render: (_, row) => formatCentsAsYuan(row.amountCents) },
                { title: "原因", dataIndex: "reason" },
                { title: "状态", render: (_, row) => <Tag>{getRebateStatusLabel(row.status)}</Tag> }
              ]}
            />
            </Card>
          </div>
        </div>

        <div ref={rebateReviewSectionRef}>
          <Card className="rebate-review-panel">
            <div className="rebate-review-head">
              <div>
                <h2>审核详情</h2>
                <p>{selectedRebate ? getRebateBusinessLabel(selectedRebate) : "选择左侧返利申请后进行审核和发放"}</p>
              </div>
              <Tag color={selectedRebate?.status === "PAID" ? "success" : "processing"}>
                {getRebateStatusLabel(selectedRebate?.status)}
              </Tag>
            </div>

            <div className="rebate-summary-box">
              <div>
                <span>关联订单</span>
                <strong>{selectedRebate ? getRebateOrderLabel(selectedRebate) : "-"}</strong>
              </div>
              <div>
                <span>客户信息</span>
                <strong>{selectedRebate ? getRebateCustomerLabel(selectedRebate) : "-"}</strong>
              </div>
              <div>
                <span>申请返利金额</span>
                <InputNumber
                  className="rebate-review-amount-field"
                  min={0.01}
                  precision={2}
                  prefix="¥"
                  readOnly
                  value={selectedRebate ? selectedRebate.amountCents / 100 : undefined}
                />
                <em className="rebate-review-amount-help">
                  原订单金额:{" "}
                  {selectedRebate?.order?.amount?.paidAmountCents
                    ? formatCentsAsYuan(selectedRebate.order.amount.paidAmountCents)
                    : "待确认"}{" "}
                  (推荐比例 10%)
                </em>
              </div>
              <div className="rebate-summary-full">
                <span>返利原因</span>
                <strong>{selectedRebate?.reason ?? "-"}</strong>
              </div>
            </div>

            <Form form={rebateActionForm} layout="vertical" className="rebate-action-form">
            <Form.Item name="id" label="返利申请" rules={[{ required: true, message: "请选择返利申请" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={rebatesQuery.isLoading}
                placeholder="选择返利申请"
                options={rebateOptions}
                onChange={(value) => setSelectedRebateId(value)}
              />
            </Form.Item>
            <Form.Item name="status" label="审核结果" rules={[{ required: true, message: "请选择结果" }]}>
              <Select placeholder="审核结果" options={rebateReviewOptions} />
            </Form.Item>

            <div className="rebate-payout-card">
              <h3>期望发放方式</h3>
              <Form.Item name="payoutMode">
                <Select
                  options={[
                    { value: "DEDUCT", label: "抵扣返利 (推荐)" },
                    { value: "CASH", label: "现金返利" }
                  ]}
                />
              </Form.Item>
            </div>

            <div ref={rebatePayoutSectionRef} className="rebate-payout-preview">
              <h3>发放操作预设</h3>
              <p>财务审批后核对转账凭证或抵扣确认单，再记录发放备注。</p>
            </div>

            <Form.Item name="note" label="审核 / 发放备注">
              <Input.TextArea rows={3} placeholder="填写审核意见、驳回原因或打款备注" />
            </Form.Item>

            <div className="rebate-action-buttons">
              <Button
                icon={<CheckCircleOutlined />}
                loading={reviewRebate.isPending}
                disabled={!selectedRebate}
                onClick={() => handleReview()}
              >
                审核
              </Button>
              <Button danger disabled={!selectedRebate} onClick={() => handleReview("REJECTED")}>
                驳回
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={reviewRebate.isPending}
                disabled={!selectedRebate}
                onClick={() => handleReview("APPROVED")}
              >
                审核通过
              </Button>
              <Button
                icon={<PayCircleOutlined />}
                loading={payRebate.isPending}
                disabled={!selectedRebate}
                onClick={handlePay}
              >
                发放返利
              </Button>
            </div>
            </Form>
          </Card>
        </div>
      </section>

      <Drawer
        title="返利申请"
        placement="right"
        open={applicationDrawerOpen}
        rootClassName="rebate-application-drawer"
        onClose={() => setApplicationDrawerOpen(false)}
        footer={
          <div className="rebate-drawer-footer">
            <Button onClick={() => setApplicationDrawerOpen(false)}>取消</Button>
            <Button type="primary" icon={<PlusOutlined />} loading={applyRebate.isPending} onClick={() => applyForm.submit()}>
              提交返利申请
            </Button>
          </div>
        }
      >
        <div className="rebate-drawer-rule-note">
          <strong>申请规则</strong>
          <span>仅支持已完成且全额付款订单；返利原因会进入审核流和后续财务发放记录。</span>
        </div>
        <Form
          form={applyForm}
          layout="vertical"
          className="rebate-apply-form rebate-drawer-form"
          onFinish={(values) => applyRebate.mutate(values)}
        >
          <Form.Item name="orderId" label="返利订单" rules={[{ required: true, message: "请选择返利订单" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={rebateOrdersQuery.isLoading}
              placeholder="选择返利订单"
              options={rebateOrderOptions}
            />
          </Form.Item>
          <Form.Item name="amountYuan" label="申请返利金额" rules={[{ required: true, message: "请输入申请返利金额" }]}>
            <InputNumber
              className="rebate-drawer-amount-field"
              min={0.01}
              precision={2}
              placeholder="申请返利金额"
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="reason" label="返利原因" rules={[{ required: true, message: "请输入返利原因" }]}>
            <Input.TextArea rows={4} placeholder="说明客户返利、抵扣或补贴原因" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
