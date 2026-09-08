"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Empty, Input, Modal, Pagination, Select, Space, Spin, Table, Tag, Typography, Upload } from "antd";
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, ImportOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { dictionaryGovernanceApi, type DictionaryGovernanceEntry, type DictionaryGovernanceImportPreview, type DictionaryItemEntry, type DictionaryItemsPage, type DictionaryStatus } from "../../../src/features/settings/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../../src/features/permissions/use-effective-permissions";
import { SettingsCapabilityGuard } from "../../../src/features/settings/capability-guard";

type DirectoryEntry = DictionaryGovernanceEntry;
type ImportRow = { code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus };

const emptyPage: DictionaryItemsPage = { items: [], total: 0, page: 1, pageSize: 20, dictionaryVersion: 1, parent: null };
const DIRECTORY_PAGE_SIZE_OPTIONS = [20, 50, 100];

export default function DictionarySettingsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const permissionsQuery = useEffectivePermissions(storeId);
  const permissions = permissionsQuery.data?.permissions;
  const canReadTemplates = hasEffectivePermission(permissions, "settings.dictionary", "read");
  const canWriteTemplates = hasEffectivePermission(permissions, "settings.dictionary", "write");
  const canReadStoreDictionaries = hasEffectivePermission(permissions, "store.dictionary", "read", storeId);
  const canWriteStoreDictionaries = hasEffectivePermission(permissions, "store.dictionary", "write", storeId);
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [directoryKeyword, setDirectoryKeyword] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryPageSize, setDirectoryPageSize] = useState(DIRECTORY_PAGE_SIZE_OPTIONS[0]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
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
  const [importPreview, setImportPreview] = useState<DictionaryGovernanceImportPreview>();
  const [importRows, setImportRows] = useState<ImportRow[]>([]);

  const selected = useMemo(() => directory.find((item) => `${item.kind}:${item.id}` === selectedKey), [directory, selectedKey]);
  const canMaintain = Boolean(selected && (selected.kind === "template" ? canWriteTemplates : canWriteStoreDictionaries));
  const canCreate = Boolean(selected && (selected.kind === "template" ? canWriteTemplates : canWriteStoreDictionaries && selected.source === "STORE" && selected.allowCustomItems));
  const canToggle = Boolean(selected && (selected.kind === "template" ? canWriteTemplates : canWriteStoreDictionaries && selected.allowDisableItems));

  const loadDirectory = useCallback(async (initial = false) => {
    if (!canReadTemplates && !canReadStoreDictionaries) return;
    setLoading(true);
    try {
      const keyword = directoryQuery.trim() || undefined;
      const result = await dictionaryGovernanceApi.catalog({ storeId, keyword, page: directoryPage, pageSize: directoryPageSize });
      const rows: DirectoryEntry[] = result.items;
      setDirectory(rows);
      setDirectoryTotal(result.total);
      const nextKey = selectedKey && rows.some((item) => `${item.kind}:${item.id}` === selectedKey) ? selectedKey : rows[0] ? `${rows[0].kind}:${rows[0].id}` : undefined;
      setSelectedKey(nextKey);
      if (initial && !nextKey) setItemsPage(emptyPage);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "基础字典目录加载失败");
    } finally {
      setLoading(false);
    }
  }, [canReadStoreDictionaries, canReadTemplates, directoryPage, directoryPageSize, directoryQuery, selectedKey, storeId]);

  const loadItems = useCallback(async () => {
    if (!selected) return;
    setItemsLoading(true);
    try {
      const params = { keyword: itemKeyword.trim() || undefined, status: itemStatus, parentId, page, pageSize };
      const result = await dictionaryGovernanceApi.listItems(selected.kind, selected.id, params);
      setItemsPage(result);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : "字典项加载失败");
    } finally {
      setItemsLoading(false);
    }
  }, [itemKeyword, itemStatus, message, page, pageSize, parentId, selected]);

  useEffect(() => { void loadDirectory(true); }, [loadDirectory]);
  useEffect(() => { void loadItems(); }, [loadItems]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDirectoryQuery(directoryKeyword.trim()), 260);
    return () => window.clearTimeout(timer);
  }, [directoryKeyword]);

  const refresh = async () => { await loadDirectory(false); await loadItems(); };
  const openCreate = () => { setEditing({}); setCode(""); setName(""); };
  const openEdit = (item: DictionaryItemEntry) => { setEditing({ item }); setCode(item.code); setName(item.name); };

  const saveItem = async () => {
    if (!selected || !editing || !name.trim() || (!editing.item && !code.trim())) { message.warning("请填写编码和名称"); return; }
    setSaving(true);
    try {
      if (editing.item) {
        await dictionaryGovernanceApi.updateItem(selected.kind, editing.item.id, { name: name.trim(), version: itemsPage.dictionaryVersion });
      } else {
        await dictionaryGovernanceApi.createItem(selected.kind, selected.id, { code: code.trim(), name: name.trim() });
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
      await dictionaryGovernanceApi.setItemStatus(selected.kind, item.id, nextStatus, reason, itemsPage.dictionaryVersion);
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
      try { await dictionaryGovernanceApi.removeItem(selected.kind, item.id, reason); message.success("字典项已删除"); await loadDirectory(false); await loadItems(); }
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
      const preview = await dictionaryGovernanceApi.previewImport(selected.kind, selected.id, rows);
      setImportRows(rows);
      setImportPreview(preview);
    } catch (reason) { message.error(reason instanceof Error ? reason.message : "导入预览失败"); }
  };

  const commitImport = async () => {
    if (!selected || !importPreview) return;
    try {
      await dictionaryGovernanceApi.commitImport(selected.kind, selected.id, importRows, importPreview.dictionaryVersion);
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

  const columns = [
    { title: "名称", dataIndex: "name", key: "name", render: (value: string, item: DictionaryItemEntry) => <Space><Typography.Text strong>{value}</Typography.Text>{item.parentId ? <Tag>子级</Tag> : null}</Space> },
    { title: "编码", dataIndex: "code", key: "code" },
    { title: "来源", dataIndex: "source", key: "source", render: (value: string) => value === "SYSTEM" ? "系统固定" : value === "HQ_TEMPLATE" ? "总部模板" : "门店自定义" },
    { title: "引用数", dataIndex: "usageCount", key: "usageCount", render: (value: number | undefined) => value ?? 0 },
    { title: "状态", dataIndex: "status", key: "status", render: (value: DictionaryStatus) => <Tag color={value === "ACTIVE" ? "green" : "default"}>{value === "ACTIVE" ? "启用" : "停用"}</Tag> },
    { title: "操作", key: "actions", render: (_: unknown, item: DictionaryItemEntry) => <Space>{selected?.allowHierarchy && !item.parentId ? <Button type="link" onClick={() => { setParentId(item.id); setItemKeyword(""); setPage(1); }}>查看子级</Button> : null}{canMaintain && !item.isSystem && <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(item)}>编辑</Button>}{canToggle && <Button type="link" onClick={() => void toggleItem(item)}>{item.status === "ACTIVE" ? "停用" : "启用"}</Button>}{canMaintain && selected?.kind === "dictionary" && !item.isSystem && !(item.usageCount ?? 0) ? <Button danger type="link" icon={<DeleteOutlined />} onClick={() => removeItem(item)}>删除</Button> : null}</Space> }
  ];

  if (loading) return <div className="management-page"><Spin description="正在加载字典目录…" /></div>;
  return <SettingsCapabilityGuard capabilityCodes={["settings.dictionary", "store.dictionary"]}><div className="management-page settings-workspace dictionary-settings-page"><Space direction="vertical" size={20} style={{ width: "100%" }}>
    <div className="dictionary-settings-header">
      <Button className="dictionary-back-button" icon={<ArrowLeftOutlined />} onClick={() => router.push("/settings")}>返回职责工作台</Button>
      <div className="dictionary-settings-heading">
        <div>
          <Typography.Title level={2} className="dictionary-settings-title">基础字典</Typography.Title>
          <Typography.Paragraph className="dictionary-settings-description" type="secondary">维护门店日常使用的业务选项。搜索目录后，右侧可继续维护字典项、状态和版本。</Typography.Paragraph>
        </div>
        <Tag className="dictionary-count-tag">{directoryTotal} 个字典</Tag>
      </div>
    </div>
    {error ? <Alert type="error" showIcon title={error} action={<Button onClick={() => void loadDirectory(true)}>重新加载</Button>} /> : null}
    <div className="dictionary-workspace-layout">
      <Card className="dictionary-directory-card" title={<div className="dictionary-card-heading"><span>字典目录</span><Typography.Text type="secondary">按名称或编码查找</Typography.Text></div>} extra={<Button aria-label="刷新字典目录" icon={<ReloadOutlined />} onClick={() => void loadDirectory(false)} />}>
        <div className="dictionary-directory-toolbar">
          <Input.Search value={directoryKeyword} placeholder="搜索名称或编码" allowClear enterButton onChange={(event) => { setDirectoryKeyword(event.target.value); setDirectoryPage(1); }} onSearch={(value) => { setDirectoryPage(1); setDirectoryQuery(value.trim()); }} />
          <Typography.Text type="secondary">{directoryQuery ? `正在显示“${directoryQuery}”的搜索结果` : "目录搜索由服务端处理"}</Typography.Text>
        </div>
        <div className="dictionary-directory-list" aria-label="字典目录列表">
          {directory.length ? directory.map((item) => {
            const itemKey = `${item.kind}:${item.id}`;
            return <button key={itemKey} type="button" className={`dictionary-directory-item${selectedKey === itemKey ? " is-selected" : ""}`} aria-pressed={selectedKey === itemKey} onClick={() => { setSelectedKey(itemKey); setParentId(undefined); setPage(1); }}>
              <span className="dictionary-directory-item-heading"><Typography.Text strong>{item.name}</Typography.Text><Tag>{item.kind === "template" ? "总部模板" : item.source === "SYSTEM" ? "系统固定" : "门店"}</Tag></span>
              <span className="dictionary-directory-item-meta"><span>{item.code}</span><span>v{item.version}</span></span>
              <span className="dictionary-directory-item-status">启用 {item.activeItemCount} · 停用 {item.inactiveItemCount}</span>
            </button>;
          }) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={directoryQuery ? "没有匹配的字典" : "暂无字典"} />}
        </div>
        <div className="dictionary-directory-pagination">
          <Pagination
            current={directoryPage}
            pageSize={directoryPageSize}
            total={directoryTotal}
            showSizeChanger
            pageSizeOptions={DIRECTORY_PAGE_SIZE_OPTIONS}
            onChange={(nextPage, nextPageSize) => {
              setDirectoryPage(nextPageSize === directoryPageSize ? nextPage : 1);
              setDirectoryPageSize(nextPageSize);
            }}
            showTotal={(total) => `共 ${total} 个`}
          />
        </div>
      </Card>
      <Card className="dictionary-items-card" title={selected ? <div className="dictionary-card-heading"><span>{selected.name}</span><span className="dictionary-card-heading-tags"><Tag>{selected.code}</Tag><Tag color={selected.kind === "template" ? "blue" : "green"}>{selected.kind === "template" ? "总部模板" : "门店字典"}</Tag></span></div> : "字典项工作区"} extra={selected ? <Space wrap className="dictionary-card-actions"><Button icon={<DownloadOutlined />} onClick={exportCurrentPage}>导出当前页</Button>{canCreate ? <Upload showUploadList={false} beforeUpload={(file) => { void previewFile(file); return false; }} accept=".csv,.json,.xlsx,.xls"><Button icon={<ImportOutlined />}>导入预览</Button></Upload> : null}{canCreate ? <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增字典项</Button> : null}</Space> : null}>
        {selected ? <div className="dictionary-items-content"><div className="dictionary-items-toolbar"><Input.Search className="dictionary-items-search" placeholder="搜索字典项名称或编码" allowClear enterButton onSearch={(value) => { setItemKeyword(value); setPage(1); }} /><Select allowClear className="dictionary-status-filter" placeholder="状态" value={itemStatus} onChange={(value) => { setItemStatus(value); setPage(1); }} options={[{ value: "ACTIVE", label: "启用" }, { value: "INACTIVE", label: "停用" }]} />{itemsPage.parent ? <Button onClick={() => { setParentId(itemsPage.parent?.parentId ?? undefined); setPage(1); }}>返回上级：{itemsPage.parent.name}</Button> : null}</div><Table className="dictionary-items-table" rowKey="id" loading={itemsLoading} dataSource={itemsPage.items} columns={columns} pagination={false} scroll={{ x: 760 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的字典项" /> }} /><div className="dictionary-items-pagination"><Pagination current={itemsPage.page} pageSize={itemsPage.pageSize} total={itemsPage.total} showSizeChanger pageSizeOptions={[20, 50, 100]} onChange={(nextPage, nextPageSize) => { setPage(nextPage); setPageSize(nextPageSize); }} showTotal={(total) => `共 ${total} 条`} /></div></div> : <Empty description="请选择左侧字典" />}
      </Card>
    </div>
    <Modal open={Boolean(editing)} title={editing?.item ? "编辑字典项" : "新增字典项"} confirmLoading={saving} onCancel={() => setEditing(undefined)} onOk={() => void saveItem()} okText="保存"><Space direction="vertical" style={{ width: "100%" }}><Input value={code} disabled={Boolean(editing?.item)} placeholder="字典编码（不可重复）" onChange={(event) => setCode(event.target.value)} /><Input value={name} placeholder="显示名称" onChange={(event) => setName(event.target.value)} /></Space></Modal>
    <Modal open={Boolean(importPreview)} title="导入预览" onCancel={() => setImportPreview(undefined)} onOk={() => void commitImport()} okButtonProps={{ disabled: !importPreview?.canCommit }} okText="确认提交"><Space direction="vertical" style={{ width: "100%" }}><Typography.Text>共 {importPreview?.summary.total} 条：新增 {importPreview?.summary.create}，更新 {importPreview?.summary.update}，错误 {importPreview?.summary.error}</Typography.Text>{importPreview?.errors.length ? <Alert type="error" title="存在错误，无法提交" description={<ul>{importPreview.errors.slice(0, 10).map((item) => <li key={`${item.code}-${item.message}`}>{item.code || "空编码"}：{item.message}</li>)}</ul>} /> : <Alert type="success" title="预览通过，确认后整批提交" />}</Space></Modal>
  </Space></div></SettingsCapabilityGuard>;
}
