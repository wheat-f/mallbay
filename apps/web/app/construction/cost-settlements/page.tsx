"use client";

import { App, Button, Card, Drawer, Input, InputNumber, Select, Space, Table, Tag, Typography } from "antd";
import { CheckOutlined, DownloadOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { constructionApi } from "../../../src/lib/api";
import type { ConstructionCostSettlement, ConfirmCostSettlementPayload } from "../../../src/features/construction/api";
import { dictionaryApi, type DictionaryItem } from "../../../src/features/settings/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { exportRowsToExcel } from "../../../src/lib/export-excel";

export default function ConstructionCostSettlementsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canConfirm = Boolean(user?.isAuditor || user?.storeMember?.position === "MANAGER");
  const canSettle = Boolean(user?.isAuditor || user?.storeMember?.position === "FINANCE");
  const canViewDetailedLaborCosts = canSettle;
  const canView = canConfirm || canSettle;
  const [selected, setSelected] = useState<ConstructionCostSettlement | null>(null);
  const [confirmedMinutes, setConfirmedMinutes] = useState<Record<string, number>>({});
  const [confirmedReasons, setConfirmedReasons] = useState<Record<string, { code?: string; text?: string }>>({});
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const settlementsQuery = useQuery({
    queryKey: ["construction-cost-settlements", storeId],
    queryFn: () => constructionApi.costSettlements({ storeId: storeId! }),
    enabled: Boolean(storeId && canView)
  });
  const dictionariesQuery = useQuery({
    queryKey: ["store-dictionaries", storeId],
    queryFn: () => dictionaryApi.list(storeId!),
    enabled: Boolean(storeId && canView)
  });
  const adjustmentReasonOptions = useMemo(() => optionsFromDictionary(dictionariesQuery.data ?? [], "CONSTRUCTION_COST_ADJUSTMENT_REASON"), [dictionariesQuery.data]);
  const timeVarianceReasonOptions = useMemo(() => optionsFromDictionary(dictionariesQuery.data ?? [], "CONSTRUCTION_TIME_VARIANCE_REASON"), [dictionariesQuery.data]);
  const rows = (settlementsQuery.data ?? []) as ConstructionCostSettlement[];
  const normalPending = useMemo(() => rows.filter(isNormalPending), [rows]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["construction-cost-settlements", storeId] });
  const batchMutation = useMutation({
    mutationFn: () => constructionApi.batchConfirmCostSettlements(checkedIds),
    onSuccess: async () => { message.success("已批量确认正常施工成本"); setCheckedIds([]); await refresh(); },
    onError: (error: Error) => message.error(error.message)
  });
  const exportMutation = useMutation({
    mutationFn: () => constructionApi.exportCostSettlements(storeId!),
    onSuccess: async (rows) => {
      await exportRowsToExcel("施工成本核算明细", "施工成本明细", rows.map((row) => ({
        "订单号": row.orderNo, "车辆": row.vehicle, "结算状态": getStatusLabel(String(row.status) as ConstructionCostSettlement["status"]), "施工人员": row.workerName, "岗位": row.positionTypeCode,
        "标准工时（分钟）": row.standardMinutes, "申报工时（分钟）": row.declaredMinutes, "确认工时（分钟）": row.confirmedMinutes,
        ...(canViewDetailedLaborCosts ? { "岗位小时成本": Number(row.hourlyCostCents ?? 0) / 100, "基础人工成本": Number(row.baseCostCents ?? 0) / 100, "个人提成": Number(row.commissionCents ?? 0) / 100, "补贴": Number(row.allowanceCents ?? 0) / 100 } : {}),
        "预计材料成本": Number(row.estimatedMaterialCostCents ?? 0) / 100, "预计施工成本": Number(row.estimatedConstructionCostCents ?? 0) / 100, "实际材料成本": Number(row.actualMaterialCostCents ?? 0) / 100, "实际施工成本": Number(row.actualConstructionCostCents ?? 0) / 100, "实际总成本": Number(row.actualTotalCostCents ?? 0) / 100,
        "实际毛利率": Number(row.actualGrossMarginBps ?? 0) / 10000, "成本异常": row.exceptions
      })), { title: "施工成本核算明细", subtitle: canViewDetailedLaborCosts ? "逐施工人员明细；金额单位：元" : "施工工时与成本汇总；不含个人薪酬明细；金额单位：元" });
      message.success("施工成本明细已导出");
    },
    onError: (error: Error) => message.error(error.message)
  });
  const confirmMutation = useMutation({
    mutationFn: (payload: ConfirmCostSettlementPayload) => constructionApi.confirmCostSettlement(selected!.id, payload),
    onSuccess: async () => { message.success("施工成本已确认"); setSelected(null); await refresh(); },
    onError: (error: Error) => message.error(error.message)
  });

  const adjustmentMutation = useMutation({
    mutationFn: ({ id, amountYuan, reasonCode, reasonText, idempotencyKey }: { id: string; amountYuan: number; reasonCode: string; reasonText: string; idempotencyKey: string }) => constructionApi.createCostAdjustment(id, {
      idempotencyKey,
      adjustmentType: adjustmentTypeForReason(reasonCode),
      amountCents: Math.round(amountYuan * 100),
      reasonCode,
      ...(reasonText.trim() ? { reasonText: reasonText.trim() } : {})
    }),
    onSuccess: async () => { message.success("成本调整单已提交，等待财务审批"); await refresh(); },
    onError: (error: Error) => message.error(error.message)
  });
  const approveMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) => constructionApi.approveCostAdjustment(id, status),
    onSuccess: async () => { message.success("调整单已处理"); await refresh(); },
    onError: (error: Error) => message.error(error.message)
  });
  const settleMutation = useMutation({
    mutationFn: (id: string) => constructionApi.settleCostSettlement(id),
    onSuccess: async () => { message.success("施工成本已财务结算并冻结"); setSelected(null); await refresh(); },
    onError: (error: Error) => message.error(error.message)
  });

  if (!canView) return <div className="management-page"><Card>仅店长可确认施工成本，财务可审批调整并完成结算。</Card></div>;
  return <div className="management-page">
    <section className="page-heading"><div><h1>{canConfirm ? "施工成本确认" : "施工成本结算"}</h1><p>{canConfirm ? "标准工时为默认值；出现申报偏差、成本缺失或异常时必须逐单确认。" : "财务审批确认后的成本调整单，并对已确认成本执行结算冻结。"}</p></div><Space><Tag color="warning">待确认 {rows.filter((row) => row.status === "PENDING_CONFIRMATION").length}</Tag><Tag color="processing">待结算 {rows.filter((row) => row.status === "CONFIRMED").length}</Tag><Button icon={<DownloadOutlined />} loading={exportMutation.isPending} onClick={() => exportMutation.mutate()}>导出成本明细</Button>{canConfirm ? <Button type="primary" icon={<CheckOutlined />} disabled={!checkedIds.length} loading={batchMutation.isPending} onClick={() => batchMutation.mutate()}>批量确认正常任务（{checkedIds.length}）</Button> : null}</Space></section>
    <Card>
      <Table<ConstructionCostSettlement>
        rowKey="id" loading={settlementsQuery.isLoading} dataSource={rows} pagination={{ pageSize: 20 }}
        rowSelection={{ selectedRowKeys: checkedIds, getCheckboxProps: (row) => ({ disabled: !isNormalPending(row) }), onChange: (keys) => setCheckedIds(keys as string[]) }}
        columns={[
          { title: "订单 / 车辆", render: (_, row) => <div><strong>{row.order?.orderNo ?? "-"}</strong><br/><small>{[row.order?.vehicle?.carPlate, row.order?.vehicle?.carModel].filter(Boolean).join(" / ") || "车辆待补充"}</small></div> },
          { title: "标准 / 申报工时", render: (_, row) => `${row.standardWorkMinutes} / ${row.declaredWorkMinutes ?? row.standardWorkMinutes} 分钟` },
          { title: "预计 / 实际成本", render: (_, row) => `¥${(((row.estimatedMaterialCostCents ?? 0) + (row.estimatedConstructionCostCents ?? 0)) / 100).toFixed(2)} / ¥${(row.actualTotalCostCents / 100).toFixed(2)}` },
          { title: "状态", render: (_, row) => <Tag color={row.status === "PENDING_CONFIRMATION" ? "warning" : row.status === "CONFIRMED" ? "processing" : "success"}>{getStatusLabel(row.status)}</Tag> },
          { title: "异常", render: (_, row) => isAbnormal(row) ? <Tag color="error" icon={<ExclamationCircleOutlined />}>{row.exceptions.length ? "成本异常" : "需逐单确认"}</Tag> : <Tag color="success">正常</Tag> },
          { title: "操作", render: (_, row) => <Button size="small" type={row.status === "CONFIRMED" && canSettle ? "primary" : "default"} onClick={() => { setSelected(row); setConfirmedMinutes(Object.fromEntries(row.workerLines.map((line) => [line.workerUserId, line.declaredMinutes ?? line.standardMinutes]))); setConfirmedReasons({}); }}>{row.status === "PENDING_CONFIRMATION" && canConfirm ? "确认成本" : row.status === "CONFIRMED" && canSettle ? "审批与结算" : "查看"}</Button> }
        ]}
      />
    </Card>
    <Drawer title={selected?.status === "CONFIRMED" && canSettle ? "施工成本审批与结算" : "施工成本确认"} width={560} open={Boolean(selected)} onClose={() => setSelected(null)} footer={selected?.status === "PENDING_CONFIRMATION" && canConfirm ? <Button type="primary" block disabled={Boolean(selected && hasUnexplainedVariance(selected, confirmedMinutes, confirmedReasons))} loading={confirmMutation.isPending} onClick={() => selected && confirmMutation.mutate(toDefaultConfirmation(selected, confirmedMinutes, confirmedReasons))}>确认并生成实际成本</Button> : selected?.status === "CONFIRMED" && canSettle ? <Button type="primary" block loading={settleMutation.isPending} onClick={() => selected && settleMutation.mutate(selected.id)}>确认结算并永久冻结</Button> : null}>
      {selected ? <Space direction="vertical" size="large" style={{ width: "100%" }}><CostSettlementDetail settlement={selected} confirmedMinutes={confirmedMinutes} confirmedReasons={confirmedReasons} timeVarianceReasonOptions={timeVarianceReasonOptions} onMinutesChange={(workerUserId, minutes) => setConfirmedMinutes((current) => ({ ...current, [workerUserId]: minutes }))} onReasonChange={(workerUserId, patch) => setConfirmedReasons((current) => ({ ...current, [workerUserId]: { ...current[workerUserId], ...patch } }))} /><CostAdjustmentPanel settlement={selected} adjustmentReasonOptions={adjustmentReasonOptions} canCreate={canView} canApprove={canSettle} creating={adjustmentMutation.isPending} approving={approveMutation.isPending} onCreate={(amountYuan, reasonCode, reasonText, idempotencyKey) => adjustmentMutation.mutate({ id: selected.id, amountYuan, reasonCode, reasonText, idempotencyKey })} onApprove={(id, status) => approveMutation.mutate({ id, status })} /></Space> : null}
    </Drawer>
  </div>;
}

function CostAdjustmentPanel({ settlement, adjustmentReasonOptions, canCreate, canApprove, creating, approving, onCreate, onApprove }: { settlement: ConstructionCostSettlement; adjustmentReasonOptions: DictionaryOption[]; canCreate: boolean; canApprove: boolean; creating: boolean; approving: boolean; onCreate: (amountYuan: number, reasonCode: string, reasonText: string, idempotencyKey: string) => void; onApprove: (id: string, status: "APPROVED" | "REJECTED") => void }) {
  const [amountYuan, setAmountYuan] = useState<number>(0);
  const [reasonCode, setReasonCode] = useState<string>();
  const [reasonText, setReasonText] = useState("");
  // Keep one key for the lifetime of this submission form so a network retry cannot
  // turn the same manager action into two post-confirmation cost adjustments.
  const idempotencyKeyRef = useRef<string | undefined>(undefined);
  if (settlement.status === "PENDING_CONFIRMATION") return null;
  return <Card size="small" title="确认后成本调整">
    <Typography.Paragraph type="secondary">确认后不能直接覆盖成本。店长可发起调整单，财务审批后会在结算时计入实际施工成本；已结算记录不可再调整。</Typography.Paragraph>
    {canCreate && settlement.status === "CONFIRMED" ? <Space direction="vertical" style={{ width: "100%" }}><Select value={reasonCode} onChange={setReasonCode} options={adjustmentReasonOptions} placeholder="选择调整原因（来自系统字典）" /><InputNumber value={amountYuan} onChange={(value) => setAmountYuan(Number(value ?? 0))} prefix="¥" addonAfter="元，可负数冲减" style={{ width: "100%" }} /><Input value={reasonText} onChange={(event) => setReasonText(event.target.value)} placeholder="补充说明（可选，填写凭据或具体原因）" /><Button disabled={!reasonCode || !amountYuan} loading={creating} onClick={() => { idempotencyKeyRef.current ??= createAdjustmentIdempotencyKey(); onCreate(amountYuan, reasonCode!, reasonText, idempotencyKeyRef.current); }}>提交调整单</Button></Space> : null}
    {settlement.adjustments.length ? <Space direction="vertical" style={{ width: "100%", marginTop: 12 }}>{settlement.adjustments.map((item) => <div key={item.id}><Tag color={item.status === "APPROVED" ? "success" : item.status === "REJECTED" ? "error" : item.status === "SETTLED" ? "default" : "processing"}>{item.status === "PENDING" ? "待财务审批" : item.status === "APPROVED" ? "已批准" : item.status === "REJECTED" ? "已拒绝" : "已结算"}</Tag> {adjustmentTypeLabel(item.adjustmentType)} ¥{(item.amountCents / 100).toFixed(2)} {item.reasonText ?? item.reasonCode} {canApprove && item.status === "PENDING" ? <Space size="small"><Button size="small" type="primary" loading={approving} onClick={() => onApprove(item.id, "APPROVED")}>批准</Button><Button size="small" danger loading={approving} onClick={() => onApprove(item.id, "REJECTED")}>拒绝</Button></Space> : null}</div>)}</Space> : <Typography.Text type="secondary">暂无调整单。</Typography.Text>}
  </Card>;
}

function createAdjustmentIdempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `cost-adjustment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function adjustmentTypeLabel(type: string) {
  return type === "OUTSOURCE" ? "外包费用" : type === "REWORK" ? "返工人工成本" : type === "ALLOWANCE" ? "额外补贴" : type === "COMMISSION" ? "提成修正" : "人工成本调整";
}

type DictionaryOption = { value: string; label: string };

function optionsFromDictionary(dictionaries: DictionaryItem[], code: string): DictionaryOption[] {
  return (dictionaries.find((item) => item.code === code && item.status === "ACTIVE")?.dictionaryItems ?? [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => ({ value: item.code, label: item.name }));
}

function adjustmentTypeForReason(reasonCode: string) {
  return reasonCode === "OUTSOURCING" ? "OUTSOURCE" : reasonCode === "REWORK_LABOR" ? "REWORK" : reasonCode === "ALLOWANCE" ? "ALLOWANCE" : reasonCode === "COMMISSION" ? "COMMISSION" : "MANUAL_COST";
}

function CostSettlementDetail({ settlement, confirmedMinutes, confirmedReasons, timeVarianceReasonOptions, onMinutesChange, onReasonChange }: { settlement: ConstructionCostSettlement; confirmedMinutes: Record<string, number>; confirmedReasons: Record<string, { code?: string; text?: string }>; timeVarianceReasonOptions: DictionaryOption[]; onMinutesChange: (workerUserId: string, minutes: number) => void; onReasonChange: (workerUserId: string, patch: { code?: string; text?: string }) => void }) {
  return <Space direction="vertical" size="large" style={{ width: "100%" }}>
    <Card size="small" title="工时确认"><Typography.Paragraph>标准总工时：<strong>{settlement.standardWorkMinutes} 分钟</strong></Typography.Paragraph>{settlement.workerLines.map((line) => {
      const minutes = confirmedMinutes[line.workerUserId] ?? line.standardMinutes;
      const needsReason = minutes !== line.standardMinutes;
      const reason = confirmedReasons[line.workerUserId] ?? {};
      return <div key={line.workerUserId} style={{ marginBottom: 12 }}><strong>{line.worker?.realName ?? line.worker?.username ?? line.workerUserId}</strong><div>标准 {line.standardMinutes} 分钟；申报 {line.declaredMinutes ?? line.standardMinutes} 分钟</div><InputNumber min={0} value={minutes} onChange={(value) => onMinutesChange(line.workerUserId, Number(value ?? 0))} addonAfter="分钟" style={{ width: "100%" }} />{needsReason ? <Space direction="vertical" style={{ width: "100%", marginTop: 8 }}><Select value={reason.code} onChange={(code) => onReasonChange(line.workerUserId, { code })} options={timeVarianceReasonOptions} placeholder="确认工时偏差原因（必选，来自系统字典）" /><Input value={reason.text} onChange={(event) => onReasonChange(line.workerUserId, { text: event.target.value })} placeholder="补充说明（可选）" /></Space> : null}</div>;
    })}</Card>
    <Card size="small" title="成本与异常"><div>预计施工成本：¥{((settlement.estimatedConstructionCostCents ?? 0) / 100).toFixed(2)}</div><div>实际施工成本：¥{(settlement.actualConstructionCostCents / 100).toFixed(2)}</div><div>实际材料成本：由实际出库批次自动读取</div>{isAbnormal(settlement) ? <Typography.Text type="danger">该任务存在偏差或成本缺失，店长已在本页逐单确认。</Typography.Text> : null}</Card>
  </Space>;
}

function toDefaultConfirmation(settlement: ConstructionCostSettlement, confirmedMinutes: Record<string, number>, confirmedReasons: Record<string, { code?: string; text?: string }>): ConfirmCostSettlementPayload {
  return { workerLines: settlement.workerLines.map((line) => {
    const confirmed = confirmedMinutes[line.workerUserId] ?? line.declaredMinutes ?? line.standardMinutes;
    const reason = confirmedReasons[line.workerUserId];
    return { workerUserId: line.workerUserId, confirmedMinutes: confirmed, ...(reason?.code ? { varianceReasonCode: reason.code } : {}), ...(reason?.text?.trim() ? { varianceReasonText: reason.text.trim() } : {}) };
  }) };
}

function hasUnexplainedVariance(settlement: ConstructionCostSettlement, confirmedMinutes: Record<string, number>, confirmedReasons: Record<string, { code?: string; text?: string }>) {
  return settlement.workerLines.some((line) => (confirmedMinutes[line.workerUserId] ?? line.declaredMinutes ?? line.standardMinutes) !== line.standardMinutes && !confirmedReasons[line.workerUserId]?.code);
}

function isNormalPending(item: ConstructionCostSettlement) {
  return item.status === "PENDING_CONFIRMATION" && !isAbnormal(item);
}

function isAbnormal(item: ConstructionCostSettlement) {
  return item.estimatedMaterialCostCents == null || item.exceptions.length > 0 || item.workerLines.some((line) => line.declaredMinutes != null && line.declaredMinutes !== line.standardMinutes);
}

function getStatusLabel(status: ConstructionCostSettlement["status"]) {
  return status === "PENDING_CONFIRMATION" ? "待店长确认" : status === "CONFIRMED" ? "待财务结算" : "已结算";
}
