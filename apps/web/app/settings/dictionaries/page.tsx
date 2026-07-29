"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Empty, Input, List, Modal, Space, Spin, Switch, Tag, Typography, App } from "antd";
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { dictionaryApi, dictionaryTemplateApi, type DictionaryItem, type DictionaryItemEntry } from "../../../src/features/settings/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { SettingsCapabilityGuard } from "../../../src/features/settings/capability-guard";

export default function DictionarySettingsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [rows, setRows] = useState<DictionaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ dictionary: DictionaryItem; item?: DictionaryItemEntry }>();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    if (!storeId && !user?.isAuditor) return;
    setLoading(true);
    try { setRows(await dictionaryApi.list(storeId)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "基础字典加载失败"); }
    finally { setLoading(false); }
  }, [storeId, user?.isAuditor]);
  useEffect(() => { void load(); }, [load]);
  const openCreate = (dictionary: DictionaryItem) => { setEditing({ dictionary }); setCode(""); setName(""); };
  const openEdit = (dictionary: DictionaryItem, item: DictionaryItemEntry) => { setEditing({ dictionary, item }); setCode(item.code); setName(item.name); };
  const saveItem = async () => {
    if (!editing || !name.trim() || (!editing.item && !code.trim())) { message.warning("请填写编码和名称"); return; }
    setSaving(true);
    try {
      if (editing.item) {
        if (editing.dictionary.inherited) await dictionaryTemplateApi.updateItem(editing.item.id, { name: name.trim(), version: editing.dictionary.version });
        else await dictionaryApi.updateItem(editing.item.id, { name: name.trim(), version: editing.dictionary.version });
      } else if (editing.dictionary.inherited) await dictionaryTemplateApi.createItem(editing.dictionary.id, { code: code.trim(), name: name.trim() });
      else await dictionaryApi.createItem(editing.dictionary.id, { code: code.trim(), name: name.trim() });
      message.success("字典项已保存并重新读取"); setEditing(undefined); await load();
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "保存失败，请检查编码是否重复"); }
    finally { setSaving(false); }
  };
  const remove = (item: DictionaryItemEntry) => { const reason = window.prompt("请输入删除原因", "删除前确认未被引用"); if (!reason?.trim()) return; Modal.confirm({ title: "确认删除字典项？", content: `删除 ${item.name} 后不可恢复；已被引用项只能停用。`, okText: "确认删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: async () => { try { await dictionaryApi.removeItem(item.id, reason.trim()); message.success("字典项已删除"); await load(); } catch (reason) { message.error(reason instanceof Error ? reason.message : "删除失败，被引用项只能停用"); } } }); };
  const exportDictionary = (row: DictionaryItem) => { const content = ["code,name", ...(row.dictionaryItems ?? []).map((item) => `${item.code},${item.name}`)].join("\\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); link.download = `${row.code}.csv`; link.click(); URL.revokeObjectURL(link.href); };
  const importDictionary = async (row: DictionaryItem, file: File) => { try {
    let items: Array<{ code: string; name: string; sortOrder?: number }>;
    if (file.name.toLowerCase().endsWith(".json")) {
      items = JSON.parse(await file.text());
    } else if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      items = rows.map((entry, index) => ({ code: String(entry.code ?? entry.编码 ?? entry.itemCode ?? "").trim(), name: String(entry.name ?? entry.名称 ?? entry.label ?? "").trim(), sortOrder: Number(entry.sortOrder ?? entry.排序 ?? index) }));
    } else {
      items = (await file.text()).split(/\r?\n/).slice(1).filter(Boolean).map((line, index) => { const [itemCode, ...label] = line.split(","); return { code: itemCode.trim(), name: label.join(",").trim(), sortOrder: index }; });
    }
    if (!Array.isArray(items) || items.length === 0) throw new Error("导入文件没有可用数据");
    await dictionaryApi.importItems(row.id, items); message.success("导入成功，已重新读取服务端版本"); await load();
  } catch (reason) { message.error(reason instanceof Error ? reason.message : "导入失败，整批未写入"); } };
  const toggle = (dictionary: DictionaryItem, item: DictionaryItemEntry) => { const nextStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"; const reason = nextStatus === "INACTIVE" ? window.prompt("请输入停用原因", "停用前确认影响范围")?.trim() : undefined; if (nextStatus === "INACTIVE" && !reason) return; Modal.confirm({ title: nextStatus === "INACTIVE" ? "确认停用字典项？" : "确认启用字典项？", content: nextStatus === "INACTIVE" ? `停用 ${item.name} 会影响使用该编码的新业务。` : `确认重新启用 ${item.name}？`, okText: "确认", cancelText: "取消", onOk: async () => { try { dictionary.inherited ? await dictionaryTemplateApi.setItemStatus(item.id, nextStatus, reason, dictionary.version) : await dictionaryApi.setItemStatus(item.id, nextStatus, reason, dictionary.version); message.success("字典项状态已保存并重新读取"); await load(); } catch (reason) { message.error(reason instanceof Error ? reason.message : "保存失败，未改变当前显示"); } } }); };
  if (loading) return <div className="management-page"><Spin tip="正在加载基础字典…" /></div>;
  return <SettingsCapabilityGuard capabilityCodes={["settings.dictionary"]}><div className="management-page settings-workspace"><Space direction="vertical" size={20} style={{ width: "100%" }}>
    <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/settings")}>返回职责工作台</Button>
    <div><Typography.Title level={2}>基础字典模板</Typography.Title><Typography.Paragraph type="secondary">大类 → 小类逐项维护；系统固定编码不可改，被引用项只能停用，总部禁用项门店不可重新启用。</Typography.Paragraph></div>
    {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void load()}>重新加载</Button>} /> : rows.length === 0 ? <Empty description="暂无基础字典" /> : rows.map((row) => <Card key={row.id} title={<Space>{row.name}<Tag>{row.source === "HQ_TEMPLATE" ? "总部模板" : row.source === "SYSTEM" ? "系统固定" : "门店自定义"}</Tag><Tag color={row.status === "ACTIVE" ? "green" : "default"}>版本 v{row.version ?? 1}</Tag></Space>} extra={<Space><Typography.Text type="secondary">{row.code}</Typography.Text><Button icon={<DownloadOutlined />} onClick={() => exportDictionary(row)}>导出</Button>{!row.readOnly && (row.allowCustomItems || (row.inherited && user?.isAuditor)) ? <><Button icon={<PlusOutlined />} onClick={() => openCreate(row)}>新增小类</Button>{row.source === "STORE" ? <label><Button icon={<UploadOutlined />}>导入新增</Button><input type="file" accept=".csv,.json,.xlsx,.xls" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importDictionary(row, file); event.target.value = ""; }} /></label> : null}</> : null}</Space>}>
      <List dataSource={row.dictionaryItems ?? []} renderItem={(item) => <List.Item actions={[
        <Switch key="switch" checked={item.status === "ACTIVE"} disabled={row.readOnly || !row.allowDisableItems || (item.source === "HQ_TEMPLATE" && item.status === "INACTIVE")} onChange={() => void toggle(row, item)} />,
        !row.readOnly && (row.source === "STORE" || row.inherited) && !item.isSystem ? <Button key="edit" type="link" icon={<EditOutlined />} onClick={() => openEdit(row, item)}>编辑</Button> : null,
        !row.readOnly && row.source === "STORE" && !item.isSystem && !(item.usageCount ?? 0) ? <Button key="delete" type="link" danger icon={<DeleteOutlined />} onClick={() => void remove(item)}>删除</Button> : null
      ]}><List.Item.Meta title={<Space>{item.name}<Tag>{item.code}</Tag></Space>} description={item.usageCount ? `已被引用 ${item.usageCount} 次，只允许停用` : item.status === "INACTIVE" ? (item.disabledReason || "已停用") : "未被引用"} /></List.Item>} />
    </Card>)}
    <Modal open={Boolean(editing)} title={editing?.item ? "编辑字典项" : "新增字典项"} confirmLoading={saving} onCancel={() => setEditing(undefined)} onOk={() => void saveItem()} okText="保存"><Space direction="vertical" style={{ width: "100%" }}><Input value={code} disabled={Boolean(editing?.item)} placeholder="字典编码（不可重复）" onChange={(event) => setCode(event.target.value)} /><Input value={name} placeholder="显示名称" onChange={(event) => setName(event.target.value)} /></Space></Modal>
  </Space></div></SettingsCapabilityGuard>;
}