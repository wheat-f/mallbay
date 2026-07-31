"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Card, Checkbox, Result, Space, Spin, Table, Tag, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { permissionsApi, type PermissionDefinition, type PermissionPolicy, type PermissionRole } from "../../../src/features/permissions/api";
import { SettingsCapabilityGuard } from "../../../src/features/settings/capability-guard";

type Grant = { roleCode: string; permissionCode: string; action: string; scope: string };

function grantKey(grant: Grant) {
  return [grant.roleCode, grant.permissionCode, grant.action, grant.scope].join("|");
}

export default function PermissionsPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const [roles, setRoles] = useState<PermissionRole[]>([]);
  const [catalog, setCatalog] = useState<PermissionDefinition[]>([]);
  const [policy, setPolicy] = useState<PermissionPolicy | null>(null);
  const [grants, setGrants] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([permissionsApi.roles(), permissionsApi.catalog(), permissionsApi.currentPolicy()])
      .then(([nextRoles, nextCatalog, nextPolicy]) => {
        setRoles(nextRoles);
        setCatalog(nextCatalog);
        setPolicy(nextPolicy);
        setGrants(new Set(nextPolicy?.payload.grants?.map(grantKey) ?? []));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "权限矩阵加载失败"))
      .finally(() => setLoading(false));
  }, []);

  const activeRoles = useMemo(() => roles.filter((role) => role.status === "ACTIVE"), [roles]);
  const toggle = (role: PermissionRole, definition: PermissionDefinition, action: string) => {
    const scope = role.code === "HQ_ADMIN" ? "GLOBAL" : "STORE";
    const key = grantKey({ roleCode: role.code, permissionCode: definition.code, action, scope });
    setGrants((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveDraft = async (publish = false) => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        grants: [...grants].map((value) => {
          const [roleCode, permissionCode, action, scope] = value.split("|");
          return { roleCode, permissionCode, action, scope };
        })
      };
      const draft = await permissionsApi.createDraft(payload, policy?.version);
      if (!publish) {
        setPolicy(draft);
        message.success("权限矩阵草稿已保存");
        return;
      }
      const checked = await permissionsApi.validate(draft.id);
      const published = await permissionsApi.publish(checked.id, checked.version);
      setPolicy(published);
      message.success("权限矩阵已发布，后端权限立即生效");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "权限矩阵保存或发布失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spin description="正在加载权限矩阵…" />;
  if (error) return <Alert type="error" showIcon message={error} />;
  if (!activeRoles.length || !catalog.length) return <Result status="info" title="暂无可维护的角色或权限目录" />;

  return (
    <SettingsCapabilityGuard capabilityCodes={["settings.permissions"]}>
      <div className="management-page settings-workspace">
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <Space><Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/settings")}>返回职责工作台</Button><Button onClick={() => router.push("/settings/role-bindings")}>维护人员角色绑定</Button></Space>
          <div>
            <Typography.Title level={2}>角色与权限</Typography.Title>
            <Typography.Paragraph type="secondary">
              权限目录和角色来自服务端；修改先保存草稿，校验通过后发布，发布后的结果同时控制后端接口。
            </Typography.Paragraph>
          </div>
          <Card extra={<Tag color={policy ? "green" : "gold"}>{policy ? "当前版本 v" + policy.version : "未发布"}</Tag>}>
            <Table
              pagination={{ pageSize: 20 }}
              rowKey="code"
              dataSource={catalog}
              scroll={{ x: Math.max(800, activeRoles.length * 150) }}
              columns={[
                { title: "权限目录", dataIndex: "name", fixed: "left" as const, render: (name: string, item: PermissionDefinition) => <Space direction="vertical" size={0}><strong>{name}</strong><Typography.Text type="secondary">{item.code}</Typography.Text></Space> },
                ...activeRoles.map((role) => ({
                  title: role.name,
                  key: role.code,
                  render: (_: unknown, item: PermissionDefinition) => (
                    <Space direction="vertical" size={4}>
                      {item.actions.map((action) => {
                        const scope = role.code === "HQ_ADMIN" ? "GLOBAL" : "STORE";
                        const checked = grants.has(grantKey({ roleCode: role.code, permissionCode: item.code, action, scope }));
                        return <Checkbox key={action} checked={checked} onChange={() => toggle(role, item, action)}>{action === "read" ? "查看" : action === "write" ? "编辑" : action}</Checkbox>;
                      })}
                    </Space>
                  )
                }))
              ]}
            />
            <Space style={{ marginTop: 20 }}>
              <Button loading={saving} onClick={() => void saveDraft(false)}>保存草稿</Button>
              <Button type="primary" loading={saving} onClick={() => void saveDraft(true)}>校验并发布</Button>
            </Space>
          </Card>
        </Space>
      </div>
    </SettingsCapabilityGuard>
  );
}
