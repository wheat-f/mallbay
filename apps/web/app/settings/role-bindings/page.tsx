"use client";

import { Button, Card, Empty, Input, Space, Tag, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { permissionsApi } from "../../../src/features/permissions/api";
import { SettingsCapabilityGuard } from "../../../src/features/settings/capability-guard";

export default function RoleBindingsPage() {
  return <SettingsCapabilityGuard capabilityCodes={["settings.permissions"]}><RoleBindingsReadOnly /></SettingsCapabilityGuard>;
}

function RoleBindingsReadOnly() {
  const [inputUserId, setInputUserId] = useState("");
  const [searchedUserId, setSearchedUserId] = useState("");
  const bindingsQuery = useQuery({
    queryKey: ["permission-bindings", searchedUserId],
    queryFn: () => permissionsApi.listBindings(searchedUserId),
    enabled: searchedUserId.length > 0
  });

  return (
    <div className="management-page">
      <Typography.Title level={2}>人员角色绑定</Typography.Title>
      <Typography.Paragraph type="secondary">此页仅用于查询角色绑定。新增或更换店长请使用门店治理流程；其他成员由店长邀请或移除。</Typography.Paragraph>
      <Card title="选择人员">
        <Space.Compact style={{ width: "100%" }}>
          <Input placeholder="输入用户 ID" value={inputUserId} onChange={(event) => setInputUserId(event.target.value)} />
          <Button disabled={!inputUserId.trim()} onClick={() => { const id = inputUserId.trim(); if (id === searchedUserId) void bindingsQuery.refetch(); else setSearchedUserId(id); }}>查询</Button>
        </Space.Compact>
      </Card>
      <Card title="当前绑定" style={{ marginTop: 16 }}>
        {!searchedUserId ? <Empty description="请输入用户 ID 并查询" /> : bindingsQuery.isPending ? <Empty description="正在查询…" /> : bindingsQuery.isError ? <Empty description="查询失败，请重试" /> : (bindingsQuery.data ?? []).length === 0 ? <Empty description="暂无角色绑定" /> : (
          (bindingsQuery.data ?? []).map((binding) => (
            <div key={binding.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
              <span>{binding.role?.name ?? binding.roleId}（{binding.role?.code ?? "未知角色"}） · {binding.scopeType === "STORE" ? "门店范围" : "总部范围"}</span>
              <Tag color={binding.status === "ACTIVE" ? "green" : "default"}>{binding.status === "ACTIVE" ? "生效中" : "已停用"}</Tag>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
