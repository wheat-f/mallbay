"use client";

import { useEffect, useState } from "react";
import {
  approvePurchaseReturn,
  approveSalesReturn,
  cancelPurchaseReturn,
  cancelSalesReturn,
  getPurchaseReturn,
  getSalesReturn,
  listPurchaseReturns,
  listSalesReturns,
  outboundPurchaseReturn,
  receiveSalesReturn,
  refundSalesReturn,
  settlePurchaseReturn,
  submitPurchaseReturn,
  submitSalesReturn,
  type ReturnDetailResponse,
  type ReturnListItem,
} from "@/features/returns/api";

type Kind = "sales" | "purchase";

export default function ReturnsPage() {
  const [storeId, setStoreId] = useState("");
  const [sales, setSales] = useState<ReturnListItem[]>([]);
  const [purchases, setPurchases] = useState<ReturnListItem[]>([]);
  const [selected, setSelected] = useState<{ kind: Kind; item: ReturnDetailResponse } | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [amount, setAmount] = useState("0");
  const [voucherId, setVoucherId] = useState("");
  const [reason, setReason] = useState("");
  const [targetStatus, setTargetStatus] = useState<"AVAILABLE" | "INSPECTION" | "DAMAGED">("AVAILABLE");
  const [settlementMode, setSettlementMode] = useState<"SUPPLIER_REFUND" | "PAYABLE_OFFSET" | "EXCHANGE" | "MIXED">("PAYABLE_OFFSET");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!storeId.trim()) return;
    try {
      setError("");
      const [nextSales, nextPurchases] = await Promise.all([listSalesReturns(storeId), listPurchaseReturns(storeId)]);
      setSales(nextSales);
      setPurchases(nextPurchases);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载退货单失败");
    }
  }

  useEffect(() => { void load(); }, []);

  async function refreshDetail(kind: Kind, id: string) {
    const detail = kind === "sales" ? await getSalesReturn(id) : await getPurchaseReturn(id);
    setSelected({ kind, item: detail });
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try { setError(""); await action(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "退货动作失败"); }
    finally { setBusy(false); }
  }

  function firstDetail() {
    return selected?.item.details?.[0];
  }

  function renderRows(rows: ReturnListItem[], kind: Kind) {
    if (!rows.length) return <tr><td colSpan={5}>暂无退货单</td></tr>;
    return rows.map((item) => (
      <tr key={item.id}>
        <td>{item.returnNo}</td><td>{item.status}</td><td>{item.reason}</td>
        <td>{new Date(item.createdAt).toLocaleString()}</td>
        <td className="space-x-2">
          <button className="text-slate-700 underline" onClick={() => void refreshDetail(kind, item.id)}>详情</button>
          {item.status === "DRAFT" && <button className="text-blue-700" onClick={() => void run(() => kind === "sales" ? submitSalesReturn(item.id) : submitPurchaseReturn(item.id))}>提交</button>}
          {item.status === "SUBMITTED" && <button className="text-blue-700" onClick={() => void run(() => kind === "sales" ? approveSalesReturn(item.id) : approvePurchaseReturn(item.id, "BUSINESS"))}>业务审核</button>}
          {item.status === "SUBMITTED" && kind === "purchase" && <button className="text-blue-700" onClick={() => void run(() => approvePurchaseReturn(item.id, "FINANCIAL"))}>财务审核</button>}
        </td>
      </tr>
    ));
  }

  function renderActionPanel() {
    if (!selected) return <p className="text-sm text-slate-500">选择一张退货单查看明细和可用操作。</p>;
    const { kind, item } = selected;
    const detail = firstDetail();
    const canReceive = kind === "sales" && ["WAITING_RECEIPT", "PARTIAL_RECEIVED"].includes(item.status) && detail;
    const canRefund = kind === "sales" && ["WAITING_REFUND", "PARTIAL_REFUND"].includes(item.status);
    const canOutbound = kind === "purchase" && ["WAITING_OUTBOUND", "PARTIAL_OUTBOUND"].includes(item.status) && detail;
    const canSettle = kind === "purchase" && ["WAITING_SETTLEMENT", "PARTIAL_SETTLEMENT"].includes(item.status);
    const canCancel = ["DRAFT", "SUBMITTED", "PARTIAL_RECEIVED", "PARTIAL_REFUND", "PARTIAL_OUTBOUND", "PARTIAL_SETTLEMENT"].includes(item.status);

    return <div className="space-y-4 rounded border bg-slate-50 p-4">
      <div><h2 className="font-medium">{item.returnNo} · {item.status}</h2><p className="text-sm text-slate-600">{item.reason}</p></div>
      <div className="text-sm">
        <p>明细数：{item.details.length}</p>
        {detail && <p>首条明细：{detail.id}，申请数量 {detail.quantity}，收货 {detail.receivedQuantity ?? 0}，出库 {detail.outboundQuantity ?? 0}</p>}
      </div>
      {canReceive && <div className="flex flex-wrap gap-2">
        <input className="w-24 rounded border px-2 py-1" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <select className="rounded border px-2 py-1" value={targetStatus} onChange={(e) => setTargetStatus(e.target.value as typeof targetStatus)}>
          <option value="AVAILABLE">可售</option><option value="INSPECTION">待检</option><option value="DAMAGED">报损</option>
        </select>
        <button disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white" onClick={() => void run(() => receiveSalesReturn(item.id, { detailId: detail!.id, quantity: Number(quantity), targetStatus }))}>确认收货</button>
      </div>}
      {canRefund && <div className="flex flex-wrap gap-2">
        <input className="w-28 rounded border px-2 py-1" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="退款金额(分)" />
        <input className="rounded border px-2 py-1" value={voucherId} onChange={(e) => setVoucherId(e.target.value)} placeholder="线下凭证号" />
        <button disabled={busy || !voucherId} className="rounded bg-blue-700 px-3 py-1 text-white" onClick={() => void run(() => refundSalesReturn(item.id, { actualRefundCents: Number(amount), refundMethod: "OFFLINE", voucherId }))}>确认退款</button>
      </div>}
      {canOutbound && <div className="flex gap-2">
        <input className="w-24 rounded border px-2 py-1" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <button disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white" onClick={() => void run(() => outboundPurchaseReturn(item.id, { detailId: detail!.id, quantity: Number(quantity) }))}>确认出库</button>
      </div>}
      {canSettle && <div className="flex flex-wrap gap-2">
        <select className="rounded border px-2 py-1" value={settlementMode} onChange={(e) => setSettlementMode(e.target.value as typeof settlementMode)}>
          <option value="PAYABLE_OFFSET">应付抵扣</option><option value="SUPPLIER_REFUND">供应商退款</option><option value="MIXED">混合</option><option value="EXCHANGE">换货</option>
        </select>
        <input className="w-28 rounded border px-2 py-1" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="退款金额(分)" />
        <button disabled={busy} className="rounded bg-blue-700 px-3 py-1 text-white" onClick={() => void run(() => settlePurchaseReturn(item.id, { settlementMode, refundAmountCents: Number(amount) }))}>确认结算</button>
      </div>}
      {canCancel && <div className="flex gap-2">
        <input className="rounded border px-2 py-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="取消原因" />
        <button disabled={busy || !reason.trim()} className="rounded border border-red-300 px-3 py-1 text-red-700" onClick={() => void run(() => kind === "sales" ? cancelSalesReturn(item.id, reason) : cancelPurchaseReturn(item.id, reason))}>取消剩余</button>
      </div>}
    </div>;
  }

  return <main className="mx-auto max-w-6xl space-y-6 p-8">
    <div><h1 className="text-2xl font-semibold">销售 / 采购退货</h1><p className="mt-2 text-sm text-slate-500">按状态机处理退货、接收、出库与财务结算。</p></div>
    <div className="flex gap-3"><input className="rounded border px-3 py-2" placeholder="门店 ID" value={storeId} onChange={(event) => setStoreId(event.target.value)} /><button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={() => void load()}>查询</button></div>
    {error && <p className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {renderActionPanel()}
    <section><h2 className="mb-2 text-lg font-medium">销售退货单</h2><table className="w-full border text-left text-sm"><thead><tr><th>单号</th><th>状态</th><th>原因</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{renderRows(sales, "sales")}</tbody></table></section>
    <section><h2 className="mb-2 text-lg font-medium">采购退货单</h2><table className="w-full border text-left text-sm"><thead><tr><th>单号</th><th>状态</th><th>原因</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{renderRows(purchases, "purchase")}</tbody></table></section>
  </main>;
}