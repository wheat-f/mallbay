"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, List, Space, Spin, Tag, Typography } from "antd";
import { useRouter } from "next/navigation";
import { dictionaryApi, settingsApi, type ConfigVersion, type DictionaryItem } from "../../../src/features/settings/api";
import type { CapabilityView } from "../../../src/features/settings/workbench-model";

export default function LegacySettingsPage() {
  const router = useRouter();
  const [capabilities, setCapabilities] = useState<CapabilityView[]>([]);
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [dictionaries, setDictionaries] = useState<DictionaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([settingsApi.capabilities(), dictionaryApi.list()]).then(async ([visible, dictionaryRows]) => { const versionPage = visible[0] ? await settingsApi.configVersions(visible[0].code) : { rows: [] as ConfigVersion[] }; setCapabilities(visible); setDictionaries(dictionaryRows); setVersions(versionPage.rows); }).catch((reason) => setError(reason instanceof Error ? reason.message : "兼容设置读取失败")).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="management-page"><Spin tip="正在加载兼容只读设置…" /></div>;
  return <div className="management-page settings-workspace"><Space direction="vertical" size={20} style={{ width: "100%" }}><Alert type="warning" showIcon message="兼容只读模式" description="当前由灰度回滚开关启用；本页不提供写入、发布或启停操作。恢复 NEXT_PUBLIC_SETTINGS_WORKBENCH_MODE=new 后返回职责工作台。" />{error ? <Alert type="error" showIcon message={error} /> : null}<Button onClick={() => router.push("/settings/legacy")}>刷新兼容视图</Button><Card title="原设置能力（只读）"><List dataSource={capabilities} locale={{ emptyText: "当前角色无可见设置能力" }} renderItem={(capability) => <List.Item><List.Item.Meta title={capability.name} description={`${capability.code} · ${capability.domain} · ${capability.actions.join("、")}`} /></List.Item>} /></Card><Card title="已保存配置版本（只读)"><List dataSource={versions} locale={{ emptyText: "暂无配置版本" }} renderItem={(row) => <List.Item><List.Item.Meta title={<Space>{row.capabilityCode}<Tag>{row.status}</Tag></Space>} description={`范围 ${row.scopeId} · v${row.version} · ${row.updatedAt ?? "未记录时间"}`} /></List.Item>} /></Card><Card title="字典（只读)">{dictionaries.length ? <List dataSource={dictionaries} renderItem={(row) => <List.Item><List.Item.Meta title={<Space>{row.name}<Tag>{row.source}</Tag></Space>} description={`${row.code} · ${row.dictionaryItems?.length ?? 0} 个字典项`} /></List.Item>} /> : <Empty description="暂无字典" />}</Card></Space></div>;
}