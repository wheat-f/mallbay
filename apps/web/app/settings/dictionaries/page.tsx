"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Empty, Input, Modal, Pagination, Select, Space, Spin, Table, Tag, Typography, Upload } from "antd";
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, ImportOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { dictionaryApi, dictionaryTemplateApi, type DictionaryCatalogEntry, type DictionaryCatalogPage, type DictionaryImportPreview, type DictionaryItemEntry, type DictionaryItemsPage, type DictionaryStatus } from "../../../src/features/settings/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { SettingsCapabilityGuard } from "../../../src/features/settings/capability-guard";

type DirectoryEntry = DictionaryCatalogEntry & { kind: "dictionary" | "template"; readOnly: boolean; inherited?: boolean };
type ImportRow = { code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus };

const emptyPage: DictionaryItemsPage = { items: [], total: 0, page: 1, pageSize: 20, dictionaryVersion: 1, parent: null };

export default function DictionarySettingsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [directoryKeyword, setDirectoryKeyword] = useState("");
  const [itemKeyword, setItemKeyword] = useState("");
  const [itemStatus, setItemStatus] = useState<DictionaryStatus | undefined>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [parentId, setParentId] = useState<string>();
  const [itemsPage, setItemsPage] = useState<DictionaryItemsPage>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item?: DictionaryItemEntry }>();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [importPreview, setImportPreview] = useState<DictionaryImportPreview>();
  const [importRows, setImportRows] = useState<ImportRow[]>([]);

  const selected = useMemo(() => directory.find((item) => `${item.kind}:${item.id}` === selectedKey), [directory, selectedKey]);
  const canMaintain = Boolean(selected && (selected.kind === "template" ? user?.isAuditor : true));
  const canCreate = Boolean(selected && (selected.kind === "template" ? user?.isAuditor : selected.source === "STORE" && selected.allowCustomItems));
  const canToggle = Boolean(selected && (selected.kind === "template" ? user?.isAuditor : selected.allowDisableItems));

  const loadDirectory = useCallback(async (initial = false) => {
    if (!storeId && !user?.isAuditor) return;
    setLoading(true);
    try {
      const [dictionaries, templates] = await Promise.all([
        dictionaryApi.catalog({ storeId }),
        dictionaryTemplateApi.catalog()
      ]);
      const rows: DirectoryEntry[] = [
        ...dictionaries.items.map((item) => ({ ...item, kind: "dictionary" as const, readOnly: false })),
        ...templates.items.map((item) => ({ ...item, kind: "template" as const, readOnly: !user?.isAuditor, inherited: !user?.isAuditor }))
      ];
      setDirectory(rows);
      const nextKey = selectedKey && rows.some((item) => `${item.kind}:${item.id}` === selectedKey) ? selectedKey : rows[0] ? `${rows[0].kind}:${rows[0].id}` : undefined;
      setSelectedKey(nextKey);
      if (initial && !nextKey) setItemsPage(emptyPage);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "基础字典目录加载失败");
    } finally {
      setLoading(false);
    }
  }, [selectedKey, storeId, user?.isAuditor]);

  const loadItems = useCallback(async () => {
    if (!selected) return;
    setItemsLoading(true);
    try {
      const params = { keyword: itemKeyword.trim() || undefined, status: itemStatus, parentId, page, pageSize };
      const result = selected.kind === "template" ? await dictionaryTemplateApi.listItemsPage(selected.id, params) : await dictionaryApi.listItemsPage(selected.id, params);
      setItemsPage(result);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "字典项加载失败");
    } finally {
      setItemsLoading(false);
    }
  }, [itemKeyword, itemStatus, message, page, pageSize, parentId, selected]);

  useEffect(() => { void loadDirectory(true); }, [loadDirectory]);
  useEffect(() => { void loadItems(); }, [loadItems]);

  const refresh = async () => { await loadDirectory(false); await loadItems(); };
  const openCreate = () => { setEditing({}); setCode(""); setName(""); };
  const openEdit = (item: DictionaryItemEntry) => { setEditing({ item }); setCode(item.code); setName(item.name); };

  const saveItem = async () => {
    if (!selected || !editing || !name.trim() || (!editing.item && !code.trim())) { message.warning("请填写编码和名称"); return; }
    setSaving(true);
    try {
      if (editing.item) {
        if (selected.kind === "template") await dictionaryTemplateApi.updateItem(editing.item.id, { name: name.trim(), version: itemsPage.dictionaryVersion });
        else await dictionaryApi.updateItem(editing.item.id, { name: name.trim(), version: itemsPage.dictionaryVersion });
      } else if (selected.kind === "template") {
        await dictionaryTemplateApi.createItem(selected.id, { code: code.trim(), name: name.trim() });
      } else {
        await dictionaryApi.createItem(selected.id, { code: code.trim(), name: name.trim() });
      }
      message.success("字典项已保存");
      setEditing(undefined);
      await loadDirectory(false);
      await loadItems();
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const toggleItem = async (item: DictionaryItemEntry) => {
    if (!selected) return;
    const nextStatus: DictionaryStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const reason = nextStatus === "INACTIVE" ? window.prompt("请输入停用原因", "停用前确认影响范围")?.trim() : undefined;
    if (nextStatus === "INACTIVE" && !reason) return;
    try {
      if (selected.kind === "template") await dictionaryTemplateApi.setItemStatus(item.id, nextStatus, reason, itemsPage.dictionaryVersion);
      else await dictionaryApi.setItemStatus(item.id, nextStatus, reason, itemsPage.dictionaryVersion);
      message.success("字典项状态已更新");
      await loadDirectory(false);
      await loadItems();
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "状态更新失败"); }
  };

  const removeItem = (item: DictionaryItemEntry) => {
    if (!selected) return;
    const reason = window.prompt("请输入删除原因", "删除前确认未被引用")?.trim();
    if (!reason) return;
    Modal.confirm({ title: "确认删除字典项？", content: `删除 ${item.name} 后不可恢复；已被引用项只能停用。`, okText: "确认删除", cancelText: "取消", okButtonProps: { danger: true }, onOk: async () => {
      try { await dictionaryApi.removeItem(item.id, reason); message.success("字典项已删除"); await loadDirectory(false); await loadItems(); }
      catch (reason) { message.error(reason instanceof Error ? reason.message : "删除失败，被引用项只能停用"); }
    } });
  };

  const parseImportFile = async (file: File): Promise<ImportRow[]> => {
    if (file.name.toLowerCase().endsWith(".json")) return JSON.parse(await file.text()) as ImportRow[];
    if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }).map((entry, index) => ({ code: String(entry.code ?? entry.编码 ?? "").trim(), name: String(entry.name ?? entry.名称 ?? entry.label ?? "").trim(), sortOrder: Number(entry.sortOrder ?? entry.排序 ?? index) }));
    }
    return (await file.text()).split(/\r?\n/).slice(1).filter(Boolean).map((line, index) => { const [itemCode, ...label] = line.split(","); return { code: itemCode.trim(), name: label.join(",").trim(), sortOrder: index }; });
  };

  const previewFile = async (file: File) => {
    if (!selected) return;
    try {
      const rows = await parseImportFile(file);
      const preview = selected.kind === "template" ? await dictionaryTemplateApi.previewImport(selected.id, rows) : await dictionaryApi.previewImport(selected.id, rows);
      setImportRows(rows);
      setImportPreview(preview);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "导入预览失败"); }
  };

  const commitImport = async () => {
    if (!selected || !importPreview) return;
    try {
      if (selected.kind === "template") await dictionaryTemplateApi.commitImport(selected.id, importRows, importPreview.dictionaryVersion);
      else await dictionaryApi.commitImport(selected.id, importRows, importPreview.dictionaryVersion);
      message.success("导入已提交，整批字典项已生效");
      setImportPreview(undefined);
      await loadDirectory(false);
      await loadItems();
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "导入提交失败，整批未写入"); }
  };

  const exportCurrentPage = () => {
    if (!selected) return;
    const content = ["code,name,status,sortOrder", ...itemsPage.items.map((item) => `${item.code},${item.name},${item.status},${item.sortOrder}`)].join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); link.download = `${selected.code}-page-${page}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };

  const filteredDirectory = directory.filter((item) => !directoryKeyword.trim() || `${item.name} ${item.code}`.toLowerCase().includes(directoryKeyword.trim().toLowerCase()));
  const columns = [
    { title: "名称", dataIndex: "name", key: "name", render: (value: string, item: DictionaryItemEntry) => <Space><Typography.Text strong>{value}</Typography.Text>{item.parentId ? <Tag>子级</Tag> : null}</Space> },
    { title: "编码", dataIndex: "code", key: "code" },
    { title: "来源", dataIndex: "source", key: "source", render: (value: string) => value === "SYSTEM" ? "系统固定" : value === "HQ_TEMPLATE" ? "总部模板" : "门店自定义" },
    { title: "引用数", dataIndex: "usageCount", key: "usageCount", render: (value: number | undefined) => value ?? 0 },
    { title: "状态", dataIndex: "status", key: "status", render: (value: DictionaryStatus) => <Tag color={value === "ACTIVE" ? "green" : "default"}>{value === "ACTIVE" ? "启用" : "停用"}</Tag> },
    { title: "操作", key: "actions", render: (_: unknown, item: DictionaryItemEntry) => <Space>{selected?.allowHierarchy && !item.parentId ? <Button type="link" onClick={() => { setParentId(item.id); setItemKeyword(""); setPage(1); }}>查看子级</Button> : null}{canMaintain && !item.isSystem && <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(item)}>编辑</Button>}{canToggle && <Button type="link" onClick={() => void toggleItem(item)}>{item.status === "ACTIVE" ? "停用" : "启用"}</Button>}{canMaintain && selected?.kind === "dictionary" && !item.isSystem && !(item.usageCount ?? 0) ? <Button danger type="link" icon={<DeleteOutlined />} onClick={() => removeItem(item)}>删除</Button> : null}</Space> }
  ];

  if (loading) return <div className="management-page"><Spin description="正在加载字典目录…" /></div>;
  return <SettingsCapabilityGuard capabilityCodes={["settings.dictionary", "store.dictionary"]}><div className="management-page settings-workspace"><Space direction="vertical" size={20} style={{ width: "100%" }}>
    <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/settings")}>返回职责工作台</Button>
    <div><Typography.Title level={2}>基础字典模板</Typography.Title><Typography.Paragraph type="secondary">目录按需加载，字典项支持服务端分页、搜索和逐项维护；变更即时生效并自动记录版本。</Typography.Paragraph></div>
    {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => void loadDirectory(true)}>重新加载</Button>} /> : null}
    <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <Card title="字典目录" extra={<Button icon={<ReloadOutlined />} onClick={() => void loadDirectory(false)} />}>
        <Input.Search placeholder="搜索名称或编码" allowClear onChange={(event) => setDirectoryKeyword(event.target.value)} />
        <div style={{ marginTop: 12, maxHeight: 620, overflow: "auto" }}>{filteredDirectory.length ? filteredDirectory.map((item) => <Card.Grid key={`${item.kind}:${item.id}`} hoverable style={{ width: "100%", padding: 12, background: selectedKey === `${item.kind}:${item.id}` ? "#e6f4ff" : undefined }} onClick={() => { setSelectedKey(`${item.kind}:${item.id}`); setParentId(undefined); setPage(1); }}><Space direction="vertical" size={4} style={{ width: "100%" }}><Space><Typography.Text strong>{item.name}</Typography.Text><Tag>{item.kind === "template" ? "总部模板" : item.source === "SYSTEM" ? "系统固定" : "门店"}</Tag></Space><Typography.Text type="secondary">{item.code} · v{item.version}</Typography.Text><Typography.Text type="secondary">启用 {item.activeItemCount} / 停用 {item.inactiveItemCount}</Typography.Text></Space></Card.Grid>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无字典" />}</div>
      </Card>
      <Card title={selected ? <Space>{selected.name}<Tag>{selected.code}</Tag><Tag color={selected.kind === "template" ? "blue" : "green"}>{selected.kind === "template" ? "总部模板" : "门店字典"}</Tag></Space> : "字典项工作区"} extra={selected ? <Space><Button icon={<DownloadOutlined />} onClick={exportCurrentPage}>导出当前页</Button>{canCreate ? <Upload showUploadList={false} beforeUpload={(file) => { void previewFile(file); return false; }} accept=".csv,.json,.xlsx,.xls"><Button icon={<ImportOutlined />}>导入预览</Button></Upload> : null}{canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增字典项</Button> : null}</Space> : null}>
        {selected ? <Space direction="vertical" size={16} style={{ width: "100%" }}><Space wrap><Input.Search placeholder="搜索字典项名称或编码" allowClear style={{ width: 280 }} onSearch={(value) => { setItemKeyword(value); setPage(1); }} /><Select allowClear placeholder="状态" style={{ width: 120 }} value={itemStatus} onChange={(value) => { setItemStatus(value); setPage(1); }} options={[{ value: "ACTIVE", label: "启用" }, { value: "INACTIVE", label: "停用" }]} />{itemsPage.parent ? <Button onClick={() => { setParentId(itemsPage.parent?.parentId ?? undefined); setPage(1); }}>返回上级：{itemsPage.parent.name}</Button> : null}</Space><Table rowKey="id" loading={itemsLoading} dataSource={itemsPage.items} columns={columns} pagination={false} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的字典项" /> }} /><Pagination current={itemsPage.page} pageSize={itemsPage.pageSize} total={itemsPage.total} showSizeChanger pageSizeOptions={[20, 50, 100]} onChange={(nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); }} showTotal={(total) => `共 ${total} 条`} /></Space> : <Empty description="请选择左侧字典" />}
      </Card>
    </div>
    <Modal open={Boolean(editing)} title={editing?.item ? "编辑字典项" : "新增字典项"} confirmLoading={saving} onCancel={() => setEditing(undefined)} onOk={() => void saveItem()} okText="保存"><Space direction="vertical" style={{ width: "100%" }}><Input value={code} disabled={Boolean(editing?.item)} placeholder="字典编码（不可重复）" onChange={(event) => setCode(event.target.value)} /><Input value={name} placeholder="显示名称" onChange={(event) => setName(event.target.value)} /></Space></Modal>
    <Modal open={Boolean(importPreview)} title="导入预览" onCancel={() => setImportPreview(undefined)} onOk={() => void commitImport()} okButtonProps={{ disabled: !importPreview?.canCommit }} okText="确认提交"><Space direction="vertical" style={{ width: "100%" }}><Typography.Text>共 {importPreview?.summary.total} 条：新增 {importPreview?.summary.create}，更新 {importPreview?.summary.update}，错误 {importPreview?.summary.error}</Typography.Text>{importPreview?.errors.length ? <Alert type="error" message="存在错误，无法提交" description={<ul>{importPreview.errors.slice(0, 10).map((item) => <li key={`${item.code}-${item.message}`}>{item.code || "空编码"}：{item.message}</li>)}</ul>} /> : <Alert type="success" message="预览通过，确认后整批提交" />}</Space></Modal>
  </Space></div></SettingsCapabilityGuard>;
}