"use client";

import { App, Button, Card, Empty, Input, Select, Space, Tag, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { permissionsApi } from "../../../src/features/permissions/api";

export default function RoleBindingsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState<string>();
  const [storeId, setStoreId] = useState("");
  const rolesQuery = useQuery({ queryKey: ["permission-roles"], queryFn: permissionsApi.roles });
  const bindingsQuery = useQuery({ queryKey: ["permission-bindings", userId], queryFn: () => permissionsApi.listBindings(userId), enabled: userId.trim().length > 0 });
  const bindMutation = useMutation({
    mutationFn: () => {
      if (!userId || !roleId || !storeId) throw new Error("请输入用户 ID、门店 ID 并选择角色");
      return permissionsApi.bindRole({ userId, roleId, scopeType: "STORE", storeId });
    },
    onSuccess: async () => {
      message.success("角色绑定已即时生效");
      setRoleId(undefined);
      await queryClient.invalidateQueries({ queryKey: ["permission-bindings", userId] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const disableMutation = useMutation({
    mutationFn: permissionsApi.disableBinding,
    onSuccess: async () => {
      message.success("角色绑定已停用");
      await queryClient.invalidateQueries({ queryKey: ["permission-bindings", userId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page">
      <Typography.Title level={2}>人员角色绑定</Typography.Title>
      <Typography.Paragraph type="secondary">一个用户可以绑定多个角色；绑定必须带组织范围，保存成功后立即生效并记录审计。</Typography.Paragraph>
      <Card title="选择人员">
        <Space.Compact style={{ width: "100%" }}>
          <Input placeholder="输入用户 ID" value={userId} onChange={(event) => setUserId(event.target.value)} />
          <Button onClick={() => bindingsQuery.refetch()}>查询</Button>
        </Space.Compact>
      </Card>
      <Card title="新增门店角色绑定" style={{ marginTop: 16 }}>
        <Space.Compact style={{ width: "100%" }}>
          <Input style={{ width: 220 }} placeholder="门店 ID" value={storeId} onChange={(event) => setStoreId(event.target.value)} />
          <Select style={{ flex: 1 }} placeholder="选择启用中的角色" value={roleId} onChange={setRoleId} options={(rolesQuery.data ?? []).filter((role) => role.status === "ACTIVE").map((role) => ({ value: role.id, label: role.name + "（" + role.code + "）" }))} />
          <Button type="primary" loading={bindMutation.isPending} onClick={() => bindMutation.mutate()}>绑定并生效</Button>
        </Space.Compact>
      </Card>
      <Card title="当前绑定" style={{ marginTop: 16 }}>
        {!userId ? <Empty description="请输入用户 ID" /> : (bindingsQuery.data ?? []).length === 0 ? <Empty description="暂无角色绑定" /> : (
          (bindingsQuery.data ?? []).map((binding) => (
            <div key={binding.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span>{binding.role?.name ?? binding.roleId}（{binding.role?.code ?? "未知角色"}） · {binding.scopeType === "STORE" ? "门店范围" : "总部范围"}</span>
              <Space><Tag color={binding.status === "ACTIVE" ? "green" : "default"}>{binding.status === "ACTIVE" ? "生效中" : "已停用"}</Tag>{binding.status === "ACTIVE" && <Button type="link" danger onClick={() => disableMutation.mutate(binding.id)}>停用</Button>}</Space>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}