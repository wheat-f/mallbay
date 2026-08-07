"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Space, Spin, Switch, Tag, Typography, App } from "antd";
import { useRouter } from "next/navigation";
import { settingsApi, type ConfigVersion } from "./api";
import { SettingsCapabilityGuard } from "./capability-guard";
type Field = { key: string; label: string; type?: "text" | "number" | "boolean" | "password"; help?: string; min?: number; sensitive?: boolean };
type Props = { capabilityCode: string; domain: "HQ" | "STORE" | "FINANCE" | "OWN"; scopeId: string; title: string; description: string; fields: Field[]; initial: Record<string, unknown> };

export function SettingsVersionEditor({ capabilityCode, domain, scopeId, title, description, fields, initial }: Props) {
  const { message } = App.useApp();
  const router = useRouter();
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [draft, setDraft] = useState<ConfigVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [effectiveAt, setEffectiveAt] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const guardActive = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const currentUrl = window.location.href;
    window.history.pushState({ settingsDirtyGuard: true }, "", currentUrl);
    guardActive.current = true;
    const leave = (target: string) => setPendingNavigation(target);
    const onPopState = () => {
      if (!guardActive.current) return;
      window.history.pushState({ settingsDirtyGuard: true }, "", currentUrl);
      leave("__back__");
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(target instanceof HTMLAnchorElement) || target.target === "_blank" || target.origin !== window.location.origin || target.href === currentUrl) return;
      event.preventDefault();
      leave(target.href);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      guardActive.current = false;
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty]);
  useEffect(() => { let cancelled = false; settingsApi.configVersions(capabilityCode, scopeId).then((result) => { const versions = result.rows; const current = versions.find((item) => item.status === "DRAFT" || item.status === "VALIDATION_FAILED") ?? versions.find((item) => item.status === "PUBLISHED"); if (!cancelled && current) { setDraft(current.status === "DRAFT" || current.status === "VALIDATION_FAILED" ? current : null); setValues({ ...initial, ...current.payload }); setEffectiveAt(current.effectiveAt ? new Date(current.effectiveAt).toISOString().slice(0, 16) : ""); setDirty(false); } }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "配置版本加载失败"); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [capabilityCode, scopeId]);
  const clearDirtyGuard = () => {
    const hadGuard = guardActive.current;
    guardActive.current = false;
    setDirty(false);
    if (hadGuard) window.history.back();
  };
  const persistDraft = async () => { const payload = Object.fromEntries(Object.entries(values).filter(([key, value]) => !(fields.find((field) => field.key === key)?.sensitive && value === "********"))); const effectiveAtIso = effectiveAt ? new Date(effectiveAt).toISOString() : undefined; const next = draft ? await settingsApi.updateConfigVersion(draft.id, { payload, expectedVersion: draft.version, effectiveAt: effectiveAtIso }) : await settingsApi.createConfigVersion({ domain, capabilityCode, scopeId, payload, effectiveAt: effectiveAtIso }); setDraft(next); return next; };
  const saveDraft = async () => { setSaving(true); setError(null); setValidationErrors({}); try { const next = await persistDraft(); clearDirtyGuard(); message.success(`草稿 v${next.version} 已保存，服务端已回读`); } catch (reason) { setError(reason instanceof Error ? reason.message : "草稿保存失败，输入已保留"); } finally { setSaving(false); } };
  const testOss = async () => { setSaving(true); setError(null); try { const endpoint = String(values.ossEndpoint ?? "").trim(); if (!endpoint) throw new Error("请先填写 OSS Endpoint"); const accessKey = String(values.ossAccessKey ?? "").trim(); const secretKey = String(values.ossSecretKey ?? "").trim(); const result = await settingsApi.testOssConnection(scopeId, { endpoint, accessKey: accessKey && !accessKey.includes("*") ? accessKey : undefined, secretKey: secretKey && !secretKey.includes("*") ? secretKey : undefined }); message.success(result.message); } catch (reason) { setError(reason instanceof Error ? reason.message : "OSS 连接测试失败"); } finally { setSaving(false); } };
  const publish = async () => { setSaving(true); setError(null); setValidationErrors({}); try { const next = await persistDraft(); const checked = await settingsApi.validateConfigVersion(next.id); setValidationErrors(checked.errors ?? {}); if (Object.keys(checked.errors ?? {}).length) throw new Error(Object.values(checked.errors).join("；")); const published = await settingsApi.publishConfigVersion(next.id); setDraft(null); clearDirtyGuard(); message.success(`已发布 v${published.version}，服务端返回已生效`); } catch (reason) { setError(reason instanceof Error ? reason.message : "校验或发布失败，输入已保留"); } finally { setSaving(false); } };
  const completeLeave = (target: string) => {
    const hadGuard = guardActive.current;
    setPendingNavigation(null);
    setDirty(false);
    if (target === "__back__") { if (hadGuard) window.history.back(); return; }
    if (hadGuard) window.history.back();
    window.setTimeout(() => router.push(target), hadGuard ? 0 : 0);
  };
  const saveAndLeave = async () => {
    if (!pendingNavigation) return;
    setSaving(true);
    setError(null);
    try { await persistDraft(); message.success("草稿已保存"); completeLeave(pendingNavigation); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "草稿保存失败，输入已保留"); }
    finally { setSaving(false); }
  };
  if (loading) return <Spin description="正在加载配置版本…" />;
  return <SettingsCapabilityGuard capabilityCodes={[capabilityCode]}><><Card title={title} extra={<Tag color={draft ? "gold" : "green"}>{draft ? `草稿 v${draft.version}` : "已发布"}</Tag>}><Typography.Paragraph type="secondary">{description}</Typography.Paragraph>{error ? <Alert type="error" showIcon title={error} description={Object.entries(validationErrors).length ? <ul>{Object.entries(validationErrors).map(([field, message]) => <li key={field}>{field}：{message}</li>)}</ul> : undefined} style={{ marginBottom: 16 }} /> : null}<Form layout="vertical"><Form.Item label="生效时间" extra="不填写时按当前门店时区立即生效；安全策略必须明确填写。"><Input type="datetime-local" value={effectiveAt} onChange={(event) => { setEffectiveAt(event.target.value); setDirty(true); }} /></Form.Item>{fields.map((field) => <Form.Item key={field.key} label={field.label} extra={field.help}>{field.type === "boolean" ? <Switch checked={Boolean(values[field.key])} onChange={(checked) => { setValues((current) => ({ ...current, [field.key]: checked })); setDirty(true); }} /> : field.type === "number" ? <InputNumber min={field.min ?? 0} value={typeof values[field.key] === "number" ? values[field.key] as number : undefined} onChange={(value) => { setValues((current) => ({ ...current, [field.key]: value ?? 0 })); setDirty(true); }} style={{ width: "100%" }} /> : field.type === "password" ? <Input.Password value={String(values[field.key] ?? "")} onChange={(event) => { setValues((current) => ({ ...current, [field.key]: event.target.value })); setDirty(true); }} /> : <Input value={String(values[field.key] ?? "")} onChange={(event) => { setValues((current) => ({ ...current, [field.key]: event.target.value })); setDirty(true); }} />}</Form.Item>)}</Form><Space><Button type="primary" loading={saving} onClick={() => void saveDraft()}>保存草稿</Button><Button loading={saving} disabled={saving} onClick={() => void publish()}>校验并发布</Button>{capabilityCode === "store.notifications" ? <Button loading={saving} disabled={saving} onClick={() => void testOss()}>测试 OSS 连接</Button> : null}<Button disabled={saving} onClick={() => { setValues(initial); setEffectiveAt(""); setDirty(true); }}>恢复当前默认</Button></Space></Card><Modal open={Boolean(pendingNavigation)} title="有未保存的变更" closable={!saving} maskClosable={!saving} onCancel={() => { if (!saving) setPendingNavigation(null); }} footer={[<Button key="cancel" disabled={saving} onClick={() => setPendingNavigation(null)}>取消</Button>, <Button key="discard" danger disabled={saving} onClick={() => pendingNavigation && completeLeave(pendingNavigation)}>放弃</Button>, <Button key="save" type="primary" loading={saving} onClick={() => void saveAndLeave()}>保存草稿</Button>]}>离开当前页面前，请选择保存草稿、放弃变更或取消离开。</Modal></></SettingsCapabilityGuard>;
}
