"use client";

import type { AfterSaleResponsibility, AfterSaleStatus, AfterSaleSummary, StorePosition } from "@mallbay/shared";
import type { FormInstance } from "antd";
import type { UploadFile } from "antd";
import { App, AutoComplete, Button, Card, Empty, Form, Image, Input, InputNumber, Modal, Select, Skeleton, Tag, Upload } from "antd";
import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  FileSearchOutlined,
  InboxOutlined,
  SendOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useState } from "react";
import { afterSalesApi, constructionApi } from "../../../src/lib/api";
import {
  AFTER_SALE_RESPONSIBILITY_OPTIONS,
  getAfterSaleBusinessLabel,
  getAfterSaleOrderLabel,
  getAfterSalePenaltyRiskNote,
  getAfterSalePenaltyRows,
  getAfterSaleResponsibilityDescription,
  getAfterSaleResponsibilityLabel,
  getAfterSaleResponsiblePersonLabel,
  getAfterSaleStatusLabel,
  yuanToCents
} from "../../../src/features/after-sales/display";
import { getConstructionWorkerLabel } from "../../../src/features/construction/display";
import { useAuthStore } from "../../../src/stores/auth-store";

type AfterSaleTimelineItem = {
  key: string;
  title: string;
  description: string;
  tone: "primary" | "success" | "warning" | "muted";
};

type AfterSaleWorkerOption = {
  userId: string;
  skillTags?: string[];
  isActive?: boolean;
  user?: { username?: string | null; nickname?: string | null } | null;
};

type AssignFormValues = {
  workerUserIds: string[];
};

type JudgeFormValues = {
  responsibility: AfterSaleResponsibility;
  constructionIssueCategory?: string;
  penaltyWorkerUserId?: string;
  penaltyAmountYuan?: number;
  penaltyReason?: string;
  resolutionNote?: string;
};

type EvidenceFormValues = {
  constructionPhotos?: UploadFile[];
  supplementPhotos?: UploadFile[];
  evidenceNote?: string;
};


export default function AfterSaleDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [assignForm] = Form.useForm<AssignFormValues>();
  const [judgeForm] = Form.useForm<JudgeFormValues>();
  const [evidenceForm] = Form.useForm<EvidenceFormValues>();
  const afterSaleId = params.id;
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;

  const afterSaleQuery = useQuery({
    queryKey: ["after-sales", afterSaleId],
    queryFn: () => afterSalesApi.detail(afterSaleId),
    enabled: Boolean(afterSaleId)
  });

  const afterSale = afterSaleQuery.data;
  const photoGroups = afterSale ? getAfterSalePhotoGroups(afterSale.photos) : getAfterSalePhotoGroups([]);
  const constructionPhotos = afterSale ? getConstructionPhotoEvidence(afterSale) : [];
  const hasPersistedConstructionPhoto = Boolean(afterSale?.photos?.some((photo) => photo.stage === "CONSTRUCTION_AFTER"));
  const timeline = getAfterSaleDetailTimeline(afterSale);
  const workersQuery = useQuery({
    queryKey: ["after-sales", "workers", storeId],
    queryFn: () => constructionApi.workers(storeId!),
    enabled: Boolean(storeId && afterSale && afterSale.status !== "CLOSED")
  });
  const workerOptions = ((workersQuery.data ?? []) as AfterSaleWorkerOption[])
    .filter((worker) => worker.isActive !== false)
    .map((worker) => ({
      value: worker.userId,
      label: getConstructionWorkerLabel(worker)
    }));
  const selectedResponsibility = Form.useWatch("responsibility", judgeForm);
  const hasAssignments = (afterSale?.assignments?.length ?? 0) > 0;
  const hasJudgedResponsibility = Boolean(afterSale && afterSale.responsibility !== "PENDING");
  const userPosition = user?.storeMember?.position;
  const isAfterSalesManager = Boolean(user?.isAuditor || isAfterSalesManagerPosition(userPosition));
  const isAssignedAfterSalesWorker = Boolean(
    user?.id &&
      isAfterSalesWorkerPosition(userPosition) &&
      afterSale?.assignments?.some((assignment) => assignment.workerUserId === user.id)
  );
  const canAssign = afterSale?.capabilities?.canAssign ?? (isAfterSalesManager && (afterSale?.status === "OPEN" || afterSale?.status === "ASSIGNED"));
  const canSubmitEvidence = afterSale?.capabilities?.canSubmitEvidence ?? isAssignedAfterSalesWorker;
  const canJudgeResponsibility = afterSale?.capabilities?.canJudgeResponsibility ?? (isAfterSalesManager && afterSale?.status === "ASSIGNED");
  const canClose = afterSale?.capabilities?.canClose ?? (isAfterSalesManager && afterSale?.status === "RESOLVED");

  useEffect(() => {
    if (!afterSale) return;
    assignForm.setFieldsValue({
      workerUserIds: afterSale.assignments?.map((assignment) => assignment.workerUserId).filter(isNonEmptyString) ?? []
    });
    judgeForm.setFieldsValue({
      responsibility: afterSale.responsibility === "PENDING" ? undefined : afterSale.responsibility,
      constructionIssueCategory: afterSale.constructionIssueCategory ?? undefined,
      resolutionNote: afterSale.resolutionNote ?? undefined
    });
  }, [afterSale, assignForm, judgeForm]);

  const invalidateAfterSale = async () => {
    await queryClient.invalidateQueries({ queryKey: ["after-sales", afterSaleId] });
    await queryClient.invalidateQueries({ queryKey: ["after-sales", storeId] });
  };
  const assignMutation = useMutation({
    mutationFn: (values: AssignFormValues) => {
      if (!afterSale) throw new Error("售后工单未加载");
      if (!values.workerUserIds?.length) throw new Error("请选择售后处理人员");
      return afterSalesApi.assign(afterSale.id, values.workerUserIds);
    },
    onSuccess: async () => {
      message.success("售后工单已派单");
      await invalidateAfterSale();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const judgeMutation = useMutation({
    mutationFn: (values: JudgeFormValues) => {
      if (!afterSale) throw new Error("售后工单未加载");
      return afterSalesApi.judge(afterSale.id, {
        responsibility: values.responsibility,
        constructionIssueCategory: values.constructionIssueCategory,
        penaltyWorkerUserId: values.penaltyWorkerUserId,
        penaltyAmountCents: yuanToCents(values.penaltyAmountYuan),
        penaltyReason: values.penaltyReason,
        resolutionNote: values.resolutionNote
      });
    },
    onSuccess: async () => {
      message.success("售后处理结果已保存");
      await invalidateAfterSale();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const evidenceMutation = useMutation({
    mutationFn: async (values: EvidenceFormValues) => {
      if (!afterSale) throw new Error("售后工单未加载");
      if ((values.constructionPhotos ?? []).length === 0 && !hasPersistedConstructionPhoto) {
        throw new Error("请至少上传一张施工后照片");
      }
      return afterSalesApi.submitEvidence(afterSale.id, {
        evidenceNote: values.evidenceNote
      });
    },
    onSuccess: async () => {
      message.success("售后处理证据已提交");
      evidenceForm.resetFields();
      await invalidateAfterSale();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const closeMutation = useMutation({
    mutationFn: () => {
      if (!afterSale) throw new Error("售后工单未加载");
      return afterSalesApi.close(afterSale.id);
    },
    onSuccess: async () => {
      message.success("售后工单已归档");
      await invalidateAfterSale();
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page after-sale-detail-page">
      <section className="after-sale-detail-hero">
        <div>
          <div className="after-sale-detail-breadcrumb">
            <span>售后管理</span>
            <span>/</span>
            <span>{afterSale ? getAfterSaleBusinessLabel(afterSale) : "工单详情"}</span>
          </div>
          <h1>售后工单处理</h1>
          <p>{afterSale ? getAfterSaleBusinessLabel(afterSale) : "按派单、判责、处理方案和归档关闭的顺序处理售后问题"}</p>
        </div>
        <div className="after-sale-detail-actions">
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/after-sales")}>
            返回售后列表
          </Button>
          <Button icon={<ExportOutlined />} disabled={!afterSale}>
            导出报告
          </Button>
          <Button
            type="primary"
            disabled={!canClose}
            loading={closeMutation.isPending}
            onClick={() => closeMutation.mutate()}
          >
            确认判罚并归档
          </Button>
        </div>
      </section>

      {afterSaleQuery.isLoading ? (
        <Card className="after-sale-detail-loading">
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      ) : !afterSale ? (
        <Card className="after-sale-detail-empty">
          <Empty description="未找到该售后工单，或当前账号无权查看该门店售后记录" />
        </Card>
      ) : (
        <section className="after-sale-detail-grid">
          <div className="after-sale-detail-main">
            <Card className="after-sale-detail-card after-sale-order-summary">
              <div className="after-sale-card-title">
                <FileSearchOutlined />
                <h2>原订单摘要</h2>
                <Tag color={getAfterSaleStatusColor(afterSale.status)}>{getAfterSaleStatusLabel(afterSale.status)}</Tag>
              </div>
              <div className="after-sale-summary-grid">
                <DetailMetric label="客户信息" value={getOrderCustomerLabel(afterSale)} hint={getOrderVehicleLabel(afterSale)} />
                <DetailMetric label="车型/膜卷号" value={getVehicleModelLabel(afterSale)} hint="材料批次由库存出库后自动追溯" />
                <DetailMetric label="原订单" value={getAfterSaleOrderLabel(afterSale)} hint="原订单记录已关联售后流程" />
              </div>
            </Card>

            <Card className="after-sale-detail-card">
              <div className="after-sale-card-title">
                <SafetyCertificateOutlined />
                <h2>售后处理流程</h2>
              </div>
              <AfterSaleWorkflowSteps afterSale={afterSale} />
            </Card>

            <Card className="after-sale-detail-card">
              <div className="after-sale-card-title">
                <WarningOutlined />
                <h2>问题描述与取证</h2>
              </div>
              <div className="after-sale-issue-box">
                <strong>客户诉求：</strong>
                <span>{afterSale.description || "暂无问题描述"}</span>
              </div>
              <div className="after-sale-evidence-grid">
                <PhotoEvidenceCard title="问题照片" photos={photoGroups.issuePhotos} emptyText="暂无问题照片" tone="defect" />
                <PhotoEvidenceCard title="原施工照片" photos={constructionPhotos} emptyText="暂无原施工照片" tone="vehicle" />
                <PhotoEvidenceCard title="售后施工后照片" photos={photoGroups.constructionAfterPhotos} emptyText="暂无施工后照片" tone="after" />
                <PhotoEvidenceCard title="补充证据" photos={photoGroups.supplementPhotos} emptyText="暂无补充证据" tone="supplement" />
              </div>
            </Card>

            <Card className="after-sale-detail-card after-sale-action-panel">
              <div className="after-sale-card-title">
                <ToolOutlined />
                <h2>当前处理</h2>
              </div>
              <AfterSaleActionPanel
                afterSale={afterSale}
                assignForm={assignForm}
                judgeForm={judgeForm}
                evidenceForm={evidenceForm}
                mode={isAfterSalesManager ? "manager" : "worker"}
                canAssign={canAssign}
                canSubmitEvidence={canSubmitEvidence}
                canJudgeResponsibility={canJudgeResponsibility}
                canClose={canClose}
                workerOptions={workerOptions}
                workersLoading={workersQuery.isLoading}
                selectedResponsibility={selectedResponsibility}
                hasAssignments={hasAssignments}
                hasJudgedResponsibility={hasJudgedResponsibility}
                assignPending={assignMutation.isPending}
                judgePending={judgeMutation.isPending}
                evidencePending={evidenceMutation.isPending}
                closePending={closeMutation.isPending}
                onAssign={(values) => assignMutation.mutate(values)}
                onJudge={(values) => judgeMutation.mutate(values)}
                onSubmitEvidence={(values) => evidenceMutation.mutate(values)}
                onClose={() => closeMutation.mutate()}
              />
            </Card>

            <Card className="after-sale-detail-card">
              <div className="after-sale-card-title">
                <CheckCircleOutlined />
                <h2>售后处理记录</h2>
              </div>
              <div className="after-sale-treatment-record">
                <DetailMetric label="处理分类" value={afterSale.constructionIssueCategory || "未填写"} hint="真实记录：来自售后处理表单" />
                <DetailMetric label="处理方案" value={afterSale.resolutionNote || "未填写"} hint="处理完成前可在当前处理区补充" />
                <DetailMetric label="施工后照片" value={getPhotoCountLabel(photoGroups.constructionAfterPhotos, "暂无照片")} hint="真实记录：来自 afterSale.photos" />
              </div>
            </Card>
          </div>

          <aside className="after-sale-detail-side">
            <Card className="after-sale-detail-card after-sale-responsibility-panel">
              <h2>责任判定</h2>
              <div className="after-sale-responsibility-list">
                <div className={afterSale.responsibility !== "PENDING" ? "is-active" : undefined}>
                  {getResponsibilityIcon(afterSale.responsibility)}
                  <div>
                    <strong>{getAfterSaleResponsibilityLabel(afterSale.responsibility)}</strong>
                    <span>{getAfterSaleResponsibilityDescription(afterSale.responsibility)}</span>
                  </div>
                  {afterSale.responsibility !== "PENDING" ? <CheckCircleOutlined /> : null}
                </div>
              </div>
              <div className="after-sale-worker-card">
                <span>责任对象</span>
                <strong>{getAfterSaleResponsiblePersonLabel(afterSale)}</strong>
                <p>{[
                  getAfterSaleResponsibilityLabel(afterSale.responsibility),
                  getAfterSaleResponsibilityDescription(afterSale.responsibility),
                  afterSale.constructionIssueCategory
                ].filter(Boolean).join(" / ")}</p>
              </div>
              <div className="after-sale-worker-card">
                <span>处理人员</span>
                <strong>{getAfterSaleAssignmentLabels(afterSale).join("、") || "暂无派单人员"}</strong>
                <p>真实记录：来自售后派单记录 afterSale.assignments</p>
              </div>
            </Card>

            <Card className="after-sale-detail-card after-sale-penalty-panel">
              <h2>处罚与追责摘要</h2>
              {getAfterSalePenaltyRows(afterSale).map((row) => (
                <PenaltyRow key={row.key} icon={getPenaltyIcon(row.key)} label={row.label} value={row.value} />
              ))}
              <PenaltyRecordList afterSale={afterSale} />
              <div className="after-sale-risk-note">
                <ExclamationCircleOutlined />
                <span>{getAfterSalePenaltyRiskNote(afterSale)}</span>
              </div>
            </Card>

            <Card className="after-sale-detail-card">
              <h2>处理日志</h2>
              <div className="after-sale-detail-timeline">
                {timeline.map((item) => (
                  <div key={item.key} className={`after-sale-timeline-item is-${item.tone}`}>
                    <span />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        </section>
      )}
    </div>
  );
}

function DetailMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </div>
  );
}

function AfterSaleWorkflowSteps({ afterSale }: { afterSale: AfterSaleSummary }) {
  const steps = [
    { key: "assign", title: "派单处理", done: (afterSale.assignments?.length ?? 0) > 0, description: "选择售后处理师傅" },
    { key: "judge", title: "责任判定", done: afterSale.responsibility !== "PENDING", description: "确认责任、分类和方案" },
    { key: "resolve", title: "处理完成", done: afterSale.status === "RESOLVED" || afterSale.status === "CLOSED", description: "沉淀照片、方案和处罚" },
    { key: "close", title: "归档关闭", done: afterSale.status === "CLOSED", description: "关闭售后并留存记录" }
  ];

  return (
    <div className="after-sale-workflow-steps">
      {steps.map((step, index) => (
        <div key={step.key} className={step.done ? "after-sale-workflow-step is-done" : "after-sale-workflow-step"}>
          <span>{step.done ? <CheckCircleOutlined /> : index + 1}</span>
          <strong>{step.title}</strong>
          <p>{step.description}</p>
        </div>
      ))}
    </div>
  );
}

type AfterSaleActionPanelProps = {
  afterSale: AfterSaleSummary;
  assignForm: FormInstance<AssignFormValues>;
  judgeForm: FormInstance<JudgeFormValues>;
  evidenceForm: FormInstance<EvidenceFormValues>;
  mode: "manager" | "worker";
  canAssign: boolean;
  canSubmitEvidence: boolean;
  canJudgeResponsibility: boolean;
  canClose: boolean;
  workerOptions: { value: string; label: string }[];
  workersLoading: boolean;
  selectedResponsibility?: AfterSaleResponsibility;
  hasAssignments: boolean;
  hasJudgedResponsibility: boolean;
  assignPending: boolean;
  judgePending: boolean;
  evidencePending: boolean;
  closePending: boolean;
  onAssign: (values: AssignFormValues) => void;
  onJudge: (values: JudgeFormValues) => void;
  onSubmitEvidence: (values: EvidenceFormValues) => void;
  onClose: () => void;
};

function AfterSaleActionPanel({
  afterSale,
  assignForm,
  judgeForm,
  evidenceForm,
  mode,
  canAssign,
  canSubmitEvidence,
  canJudgeResponsibility,
  canClose,
  workerOptions,
  workersLoading,
  selectedResponsibility,
  hasAssignments,
  hasJudgedResponsibility,
  assignPending,
  judgePending,
  evidencePending,
  closePending,
  onAssign,
  onJudge,
  onSubmitEvidence,
  onClose
}: AfterSaleActionPanelProps) {
  if (afterSale.status === "CLOSED") {
    return (
      <div className="after-sale-action-result">
        <CheckCircleOutlined />
        <div>
          <strong>售后已归档</strong>
          <p>处理结果、责任判定、处罚记录和照片证据已沉淀到售后档案。</p>
        </div>
      </div>
    );
  }

  if (!hasAssignments && mode === "manager" && canAssign) {
    return (
      <div className="after-sale-action-section">
        <div className="after-sale-action-copy">
          <strong>派单处理</strong>
          <span>先选择负责处理该售后问题的师傅，后续责任判定和处罚会基于真实处理记录继续。</span>
        </div>
        <Form form={assignForm} layout="vertical" className="after-sale-action-form" onFinish={onAssign}>
          <Form.Item name="workerUserIds" label="派单处理师傅" rules={[{ required: true, message: "请选择售后处理人员" }]}>
            <Select
              mode="multiple"
              optionFilterProp="label"
              loading={workersLoading}
              placeholder="选择施工人员"
              options={workerOptions}
            />
          </Form.Item>
          <Button htmlType="submit" type="primary" icon={<TeamOutlined />} loading={assignPending}>
            确认派单
          </Button>
        </Form>
      </div>
    );
  }

  if (!hasAssignments) {
    return (
      <div className="after-sale-action-result">
        <TeamOutlined />
        <div>
          <strong>等待店长派单</strong>
          <p>售后工单尚未分配给处理人员，施工员暂时不能提交处理证据。</p>
        </div>
      </div>
    );
  }

  if (mode === "worker") {
    if (!canSubmitEvidence) {
      return (
        <div className="after-sale-action-result">
          <TeamOutlined />
          <div>
            <strong>当前账号暂不能提交证据</strong>
            <p>请确认售后已派单给当前施工人员，或等待店长完成后续处理。</p>
          </div>
        </div>
      );
    }
    return (
      <div className="after-sale-action-section">
        <div className="after-sale-action-copy">
          <strong>售后处理取证</strong>
          <span>施工员仅提交售后处理证据，责任判定、处罚和归档由店长根据证据处理。</span>
        </div>
        <Form form={evidenceForm} layout="vertical" className="after-sale-action-form" onFinish={onSubmitEvidence}>
          <div className="after-sale-evidence-upload-grid">
            <Form.Item
              name="constructionPhotos"
              label="施工后照片"
              valuePropName="fileList"
              getValueFromEvent={normalizeUploadFileList}
              rules={[{ validator: validateRequiredUpload("请上传至少一张施工后照片") }]}
            >
              <AfterSaleEvidenceUploader afterSaleId={afterSale.id} stage="CONSTRUCTION_AFTER" disabled={!canSubmitEvidence || hasJudgedResponsibility} emptyText="上传施工后照片" />
            </Form.Item>
            <Form.Item
              name="supplementPhotos"
              label="补充证据图片"
              valuePropName="fileList"
              getValueFromEvent={normalizeUploadFileList}
            >
              <AfterSaleEvidenceUploader afterSaleId={afterSale.id} stage="SUPPLEMENT" disabled={!canSubmitEvidence || hasJudgedResponsibility} emptyText="上传沟通截图、供应商反馈或补充证据" />
            </Form.Item>
          </div>
          <Form.Item name="evidenceNote" label="补充说明">
            <Input.TextArea rows={3} placeholder="说明客户确认、供应商反馈、二次施工细节或异常原因" disabled={!canSubmitEvidence || hasJudgedResponsibility} />
          </Form.Item>
          <Button
            htmlType="submit"
            type="primary"
            icon={<SendOutlined />}
            loading={evidencePending}
            disabled={!canSubmitEvidence || hasJudgedResponsibility}
          >
            提交处理证据
          </Button>
          {hasJudgedResponsibility ? <p className="after-sale-evidence-uploader-note">店长已完成责任判定，证据已进入售后处理记录。</p> : null}
        </Form>
      </div>
    );
  }

  if (!hasJudgedResponsibility && canJudgeResponsibility) {
    return (
      <div className="after-sale-action-section">
        <div className="after-sale-action-copy">
          <strong>责任判定与处理方案</strong>
          <span>店长根据证据进行责任判定，确认责任来源、处理分类、处理方案和必要处罚。</span>
        </div>
        <Form form={judgeForm} layout="vertical" className="after-sale-action-form" onFinish={onJudge}>
          <div className="after-sale-action-grid">
            <Form.Item name="responsibility" label="责任判定" rules={[{ required: true, message: "请选择责任" }]}>
              <Select placeholder="责任待判定" options={AFTER_SALE_RESPONSIBILITY_OPTIONS} />
            </Form.Item>
            {selectedResponsibility === "CONSTRUCTION" ? (
              <Form.Item name="constructionIssueCategory" label="施工问题分类">
                <AutoComplete
                  placeholder="选择或输入施工问题分类"
                  options={[
                    { value: "刀工问题" },
                    { value: "个人疏忽问题" },
                    { value: "裁膜问题" },
                    { value: "包边凹槽处理问题" }
                  ]}
                />
              </Form.Item>
            ) : null}
            <Form.Item name="resolutionNote" label="处理方案说明" rules={[{ required: true, message: "请填写处理方案" }]}>
              <Input.TextArea rows={3} placeholder="记录返工、补膜、客户沟通或供应商追踪方案" />
            </Form.Item>
            <div className="after-sale-penalty-fields">
              <strong>施工处罚设定</strong>
              <Form.Item name="penaltyWorkerUserId" label="处罚人员">
                <Select allowClear optionFilterProp="label" placeholder="选择处罚人员" options={workerOptions} />
              </Form.Item>
              <Form.Item name="penaltyAmountYuan" label="处罚金额（元）">
                <InputNumber min={0} precision={2} placeholder="处罚金额" />
              </Form.Item>
              <Form.Item name="penaltyReason" label="处罚原因">
                <Input placeholder="填写处罚原因" />
              </Form.Item>
            </div>
          </div>
          <Button htmlType="submit" type="primary" icon={<SendOutlined />} loading={judgePending}>
            保存处理结果
          </Button>
        </Form>
      </div>
    );
  }

  return (
    <div className="after-sale-action-result">
      <CheckCircleOutlined />
      <div>
        <strong>{afterSale.status === "RESOLVED" ? "归档关闭" : "处理结果已保存"}</strong>
        <p>责任判定和处理方案已保存。确认客户沟通、处罚和售后追踪完成后，可关闭该售后工单。</p>
      </div>
      <Button type="primary" disabled={!canClose} loading={closePending} onClick={onClose}>
        确认判罚并归档
      </Button>
    </div>
  );
}

function AfterSaleEvidenceUploader({ afterSaleId, stage, disabled, emptyText }: {
  afterSaleId: string;
  stage: "CONSTRUCTION_AFTER" | "SUPPLEMENT";
  disabled?: boolean;
  emptyText: string;
}) {
  return (
    <Upload
      accept="image/*"
      customRequest={async ({ file, onSuccess, onError }) => {
        try {
          const result = await afterSalesApi.uploadPhoto(afterSaleId, { stage, file: file as File });
          onSuccess?.(result);
        } catch (error) {
          onError?.(error as Error);
        }
      }}
      disabled={disabled}
      listType="picture-card"
      multiple
    >
      <div className="after-sale-evidence-uploader-trigger">
        <InboxOutlined />
        <span>{emptyText}</span>
      </div>
    </Upload>
  );
}

function PhotoEvidenceCard({
  title,
  photos,
  emptyText,
  tone
}: {
  title: string;
  photos: AfterSalePhotoEvidence[];
  emptyText: string;
  tone: "defect" | "after" | "supplement" | "vehicle";
}) {
  const [previewPhoto, setPreviewPhoto] = useState<AfterSalePhotoEvidence | null>(null);
  const viewableCount = photos.filter((photo) => isViewablePhotoUrl(photo.url)).length;
  const photoCountLabel =
    photos.length === 0 ? emptyText : viewableCount === photos.length ? `${photos.length} 张照片已归档` : `${viewableCount}/${photos.length} 张可查看`;
  return (
    <div className={`after-sale-photo-card is-${tone}`}>
      <CameraOutlined />
      <strong>{title}</strong>
      <span>{photoCountLabel}</span>
      {photos.length > 0 ? (
        <div className="after-sale-photo-links">
          {photos.map((photo, index) => (
            <div key={photo.id ?? photo.url} className="after-sale-photo-evidence-row">
              {isViewablePhotoUrl(photo.url) ? (
                <button type="button" onClick={() => setPreviewPhoto(photo)}>
                  查看照片 {index + 1}
                </button>
              ) : (
                <em>地址无效</em>
              )}
              <span>{photo.note || "无备注"} / {getUserDisplayName(photo.uploadedBy) || "上传人待确认"}</span>
            </div>
          ))}
        </div>
      ) : null}
      <Modal
        title={previewPhoto?.note || title}
        open={Boolean(previewPhoto)}
        onCancel={() => setPreviewPhoto(null)}
        footer={null}
        width={760}
        centered
      >
        {previewPhoto ? (
          <div className="after-sale-photo-preview">
            <Image src={previewPhoto.url} alt={previewPhoto.note || title} />
            <a href={previewPhoto.url} target="_blank" rel="noreferrer">
              在新窗口打开原图
            </a>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function PenaltyRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="after-sale-penalty-row">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function PenaltyRecordList({ afterSale }: { afterSale: AfterSaleSummary }) {
  const penalties = afterSale.penalties ?? [];
  if (penalties.length === 0) {
    return <div className="after-sale-penalty-empty">真实记录：暂无已保存处罚记录</div>;
  }
  return (
    <div className="after-sale-penalty-records">
      <span>真实记录：afterSale.penalties</span>
      {penalties.map((penalty) => (
        <div key={penalty.id ?? `${penalty.workerUserId}-${penalty.reason}`} className="after-sale-penalty-record">
          <strong>{getUserDisplayName(penalty.worker) || "处罚对象待确认"}</strong>
          <span>{formatPenaltyAmount(penalty.amountCents)} / {penalty.reason || "未填写原因"}</span>
        </div>
      ))}
    </div>
  );
}

function getResponsibilityIcon(responsibility: AfterSaleResponsibility) {
  if (responsibility === "CONSTRUCTION") return <ToolOutlined />;
  if (responsibility === "MATERIAL") return <SafetyCertificateOutlined />;
  if (responsibility === "CUSTOMER") return <UserOutlined />;
  return <FileSearchOutlined />;
}

function getPenaltyIcon(key: string) {
  if (key === "responsibility") return <SafetyCertificateOutlined />;
  if (key === "category") return <ExclamationCircleOutlined />;
  return <DollarOutlined />;
}

type AfterSalePhotoEvidence = NonNullable<AfterSaleSummary["photos"]>[number];
type ConstructionPhotoEvidence = NonNullable<NonNullable<AfterSaleSummary["order"]>["constructionRecord"]>["photos"];

function getAfterSalePhotoGroups(photos?: AfterSaleSummary["photos"]) {
  const photoList = photos ?? [];
  return {
    issuePhotos: photoList.filter((photo) => photo.stage === "ISSUE"),
    constructionAfterPhotos: photoList.filter((photo) => photo.stage === "CONSTRUCTION_AFTER"),
    supplementPhotos: photoList.filter((photo) => photo.stage === "SUPPLEMENT")
  };
}

function getConstructionPhotoEvidence(afterSale: AfterSaleSummary): AfterSalePhotoEvidence[] {
  const photos: ConstructionPhotoEvidence = afterSale.order?.constructionRecord?.photos ?? [];
  return photos.map((photo) => ({
    id: photo.id,
    stage: "SUPPLEMENT",
    url: photo.url,
    note: getConstructionPhotoStageLabel(photo.stage),
    uploadedById: photo.uploadedById,
    createdAt: photo.createdAt,
    uploadedBy: photo.uploadedBy
  }));
}

function getConstructionPhotoStageLabel(stage: string) {
  if (stage === "BEFORE") return "施工前照片";
  if (stage === "DURING") return "施工中照片";
  if (stage === "AFTER") return "施工后照片";
  return "施工照片";
}

function isViewablePhotoUrl(url?: string | null) {
  if (!url) return false;
  return /^(https?:\/\/|\/|data:image\/)/.test(url.trim());
}

function getPhotoCountLabel(photos?: AfterSalePhotoEvidence[] | null, fallback = "待上传") {
  const count = photos?.filter((photo) => Boolean(photo.url)).length ?? 0;
  return count > 0 ? `${count} 张照片已归档` : fallback;
}

function getAfterSaleAssignmentLabels(afterSale: AfterSaleSummary) {
  return (afterSale.assignments ?? []).map((assignment) => getUserDisplayName(assignment.worker)).filter(Boolean);
}

function getUserDisplayName(user?: { nickname?: string | null; username?: string | null } | null) {
  return user?.nickname ?? user?.username ?? "";
}

function formatPenaltyAmount(amountCents?: number | null) {
  if (!amountCents) return "未录入金额";
  return `¥${(amountCents / 100).toFixed(2)}`;
}

function isNonEmptyString(value?: string | null): value is string {
  return Boolean(value);
}

function isAfterSalesManagerPosition(position?: StorePosition) {
  return position === "MANAGER" || position === "SCHEDULER" || position === "CUSTOMER_SERVICE";
}

function isAfterSalesWorkerPosition(position?: StorePosition) {
  return position === "CONSTRUCTION" || position === "APPRENTICE";
}

function normalizeUploadFileList(event: { fileList?: UploadFile[] } | UploadFile[]) {
  return Array.isArray(event) ? event.slice(-12) : event?.fileList?.slice(-12) ?? [];
}

function validateRequiredUpload(message: string) {
  return async (_: unknown, fileList?: UploadFile[]) => {
    if ((fileList ?? []).length > 0) return;
    throw new Error(message);
  };
}

function getAfterSaleDetailTimeline(afterSale?: AfterSaleSummary): AfterSaleTimelineItem[] {
  if (!afterSale) return [];

  if (afterSale.events?.length) {
    return afterSale.events.map((event) => ({
      key: event.id,
      title: getAfterSaleAuditActionLabel(event.action),
      description: getAfterSaleAuditDescription(event.action, event.metadata),
      tone: event.action === "AFTER_SALE_CREATED" ? "primary" : event.action === "AFTER_SALE_CLOSED" ? "success" : "warning"
    }));
  }

  const items: AfterSaleTimelineItem[] = [
    {
      key: "created",
      title: "发起售后申请",
      description: afterSale.description || "客户提交售后问题，等待客服或主管受理。",
      tone: "primary"
    }
  ];

  if (afterSale.status === "ASSIGNED" || afterSale.status === "RESOLVED" || afterSale.status === "CLOSED") {
    items.push({
      key: "assigned",
      title: "已派单处理",
      description: "售后任务已进入师傅处理队列，照片和处理结果需持续补充。",
      tone: "warning"
    });
  }

  if (afterSale.responsibility !== "PENDING") {
    items.push({
      key: "responsibility",
      title: "完成责任判定",
      description: `判定结果：${getAfterSaleResponsibilityLabel(afterSale.responsibility)}。`,
      tone: "success"
    });
  }

  if (afterSale.status === "RESOLVED" || afterSale.status === "CLOSED") {
    items.push({
      key: "resolved",
      title: "售后处理完成",
      description: "售后结果已归档，可进入后续复盘、质保或处罚追踪。",
      tone: "success"
    });
  }

  if (items.length === 1) {
    items.push({
      key: "pending",
      title: "等待勘察与派单",
      description: "请在售后管理中选择处理师傅，并补充责任判定和处理方案。",
      tone: "muted"
    });
  }

  return items;
}

function getAfterSaleAuditActionLabel(action: string) {
  const labels: Record<string, string> = {
    AFTER_SALE_CREATED: "发起售后申请",
    AFTER_SALE_ASSIGNED: "已派单处理",
    AFTER_SALE_EVIDENCE_SUBMITTED: "补充处理证据",
    AFTER_SALE_RESPONSIBILITY_JUDGED: "完成责任判定",
    AFTER_SALE_CLOSED: "售后已归档"
  };
  return labels[action] ?? "售后记录变更";
}

function getAfterSaleAuditDescription(action: string, metadata?: Record<string, unknown> | null) {
  if (action === "AFTER_SALE_ASSIGNED") {
    const workerCount = Array.isArray(metadata?.workerUserIds) ? metadata.workerUserIds.length : 0;
    return `已记录 ${workerCount || "相关"} 名处理人员。`;
  }
  if (action === "AFTER_SALE_EVIDENCE_SUBMITTED") {
    return "施工后照片、补充证据和说明已保存。";
  }
  if (action === "AFTER_SALE_RESPONSIBILITY_JUDGED") {
    return `责任判定已保存：${typeof metadata?.responsibility === "string" ? getAfterSaleResponsibilityLabel(metadata.responsibility as AfterSaleResponsibility) : "待确认"}。`;
  }
  if (action === "AFTER_SALE_CLOSED") {
    return "售后处理结果已归档。";
  }
  return "售后记录已保存。";
}

function getAfterSaleStatusColor(status?: AfterSaleStatus) {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "CANCELLED") return "default";
  if (status === "ASSIGNED") return "processing";
  return "warning";
}

function getOrderCustomerLabel(afterSale: AfterSaleSummary) {
  const customer = afterSale.order?.customer;
  return customer?.companyName ?? customer?.personalName ?? customer?.name ?? customer?.contactPerson ?? "客户信息待确认";
}

function getOrderVehicleLabel(afterSale: AfterSaleSummary) {
  const vehicle = afterSale.order?.vehicle;
  return [vehicle?.plateNo ?? vehicle?.carPlate, getVehicleModelLabel(afterSale)].filter(Boolean).join(" / ") || "车辆信息待确认";
}

function getVehicleModelLabel(afterSale: AfterSaleSummary) {
  const vehicle = afterSale.order?.vehicle;
  return [vehicle?.model ?? vehicle?.carModel, vehicle?.color ?? vehicle?.carColor].filter(Boolean).join(" / ") || "-";
}
