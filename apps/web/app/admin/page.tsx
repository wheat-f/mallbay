"use client";

import {
  App, Avatar, Button, Dropdown, Input, Layout,
  Modal, Form, Spin, Table, Tag, Tooltip, Typography
} from "antd";
import type { ColumnType } from "antd/es/table";
import {
  ArrowLeftOutlined, PlusOutlined, SearchOutlined, UserOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { authApi, storeApi, userApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

const STATUS_CONFIG: Record<string, { text: string; color: string }> = {
  DRAFTED: { text: "筹办中", color: "default" },
  PENDING_REVIEW: { text: "待审核", color: "processing" },
  PUBLISHED: { text: "公开", color: "success" },
  FROZEN: { text: "已冻结", color: "warning" }
};

type StoreRow = {
  id: string;
  name: string;
  status: string;
  address: string | null;
  coverUrl: string | null;
  manager: { id: string; username: string; nickname: string | null } | null;
  createdAt: string;
};

// ─── 创建门店 Modal ───────────────────────────────────────────────
function CreateStoreModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void;
}) {
  const { message } = App.useApp();
  const [storeName, setStoreName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selectedUser, setSelectedUser] = useState<{
    id: string; username: string; nickname: string | null
  } | null>(null);

  const searchQuery = useQuery({
    queryKey: ["user-search", keyword],
    queryFn: () => userApi.searchUsers(keyword),
    enabled: keyword.trim().length > 0
  });

  const createMutation = useMutation({
    mutationFn: () => storeApi.create({ name: storeName, managerId: selectedUser!.id }),
    onSuccess: () => {
      message.success("门店创建成功");
      setStoreName(""); setKeyword(""); setSelectedUser(null);
      onCreated(); onClose();
    },
    onError: (e: Error) => message.error(e.message)
  });

  const handleClose = () => {
    setStoreName(""); setKeyword(""); setSelectedUser(null);
    onClose();
  };

  return (
    <Modal
      open={open} title="创建门店" onCancel={handleClose}
      onOk={() => createMutation.mutate()} okText="创建" cancelText="取消"
      okButtonProps={{ disabled: !storeName.trim() || !selectedUser, loading: createMutation.isPending }}
      destroyOnHidden
    >
      <Form layout="vertical" className="mt-4">
        <Form.Item label="门店名称" required>
          <Input value={storeName} onChange={(e) => setStoreName(e.target.value)}
            maxLength={50} showCount placeholder="请输入门店名称" />
        </Form.Item>
        <Form.Item label="指派店长" required>
          <Input
            prefix={<SearchOutlined className="text-slate-400" />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setSelectedUser(null); }}
            placeholder="搜索用户名" allowClear
          />
          {searchQuery.isFetching && <Spin size="small" className="mt-2 block" />}
          {searchQuery.isError && (
            <div className="mt-1 text-xs text-red-500">
              搜索失败：{(searchQuery.error as Error)?.message ?? "请求错误"}
            </div>
          )}
          {searchQuery.data && searchQuery.data.length === 0 && !searchQuery.isFetching && !selectedUser && (
            <div className="mt-1 text-xs text-slate-400">未找到匹配用户</div>
          )}
          {searchQuery.data && searchQuery.data.length > 0 && !selectedUser && (
            <div className="mt-1 rounded border border-slate-200 bg-white shadow-sm">
              {searchQuery.data.map((u) => (
                <div key={u.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50"
                  onClick={() => { setSelectedUser(u); setKeyword(u.username); }}
                >
                  <Avatar size={24} style={{ background: "#1677ff", fontSize: 12 }}>
                    {(u.nickname ?? u.username).charAt(0).toUpperCase()}
                  </Avatar>
                  <span className="font-mono text-sm">{u.username}</span>
                  {u.nickname && <span className="text-slate-400 text-sm">{u.nickname}</span>}
                </div>
              ))}
            </div>
          )}
          {selectedUser && (
            <div className="mt-2 flex items-center gap-2 rounded bg-blue-50 px-3 py-2 text-sm">
              <Avatar size={20} style={{ background: "#1677ff", fontSize: 10 }}>
                {(selectedUser.nickname ?? selectedUser.username).charAt(0).toUpperCase()}
              </Avatar>
              <span>已选：<span className="font-mono">{selectedUser.username}</span></span>
              <Button type="link" size="small" danger
                onClick={() => { setSelectedUser(null); setKeyword(""); }}>
                重选
              </Button>
            </div>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── 列文字搜索 hook ──────────────────────────────────────────────
function useColumnSearch(dataIndex: keyof StoreRow): ColumnType<StoreRow> {
  const [searchText, setSearchText] = useState("");
  const inputRef = useRef<Parameters<typeof Input>[0] & { focus?: () => void }>(null);

  return {
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div className="p-2" style={{ minWidth: 200 }}>
        <Input
          ref={inputRef as never}
          placeholder="输入关键词"
          value={selectedKeys[0] as string}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => { setSearchText(selectedKeys[0] as string); confirm(); }}
          className="mb-2 block"
          allowClear
        />
        <div className="flex gap-2">
          <Button type="primary" size="small" icon={<SearchOutlined />}
            onClick={() => { setSearchText(selectedKeys[0] as string); confirm(); }}>
            搜索
          </Button>
          <Button size="small" onClick={() => { clearFilters?.(); setSearchText(""); confirm(); }}>
            重置
          </Button>
        </div>
      </div>
    ),
    filterIcon: (filtered: boolean) => (
      <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />
    ),
    onFilter: (value, record) => {
      const cell = record[dataIndex];
      return String(cell ?? "").toLowerCase().includes(String(value).toLowerCase());
    },
    filterDropdownProps: {
      onOpenChange: (open) => {
        if (open) setTimeout(() => (inputRef.current as { focus?: () => void })?.focus?.(), 100);
      }
    }
  };
}

// ─── 主页面 ───────────────────────────────────────────────────────
export default function AdminPage() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => { clearSession(); router.push("/auth"); }
  });

  // 一次拉取足够多，客户端做列过滤（admin 场景门店数量可控）
  const storesQuery = useQuery({
    queryKey: ["admin-stores", page],
    queryFn: () => storeApi.adminList({ page, pageSize: 100 } as Parameters<typeof storeApi.adminList>[0]),
    staleTime: 10_000
  });

  const nameSearch = useColumnSearch("name");
  const addressSearch = useColumnSearch("address");

  const displayName = user ? (user.nickname ?? user.username ?? "") : "";

  const dropdownItems = [
    { key: "home", label: "返回首页", icon: <ArrowLeftOutlined />, onClick: () => router.push("/") },
    { type: "divider" as const },
    { key: "profile", label: "个人设置", icon: <UserOutlined />, onClick: () => router.push("/profile") },
    { type: "divider" as const },
    { key: "logout", label: "退出登录", danger: true, onClick: () => logoutMutation.mutate() }
  ];

  const columns: ColumnType<StoreRow>[] = [
    {
      title: "门店名称", dataIndex: "name", key: "name",
      ...nameSearch,
      render: (name: string, row: StoreRow) => (
        <span className="cursor-pointer font-medium text-blue-600 hover:underline"
          onClick={() => router.push(`/admin/stores/${row.id}`)}>
          {name}
        </span>
      )
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 110,
      filters: Object.entries(STATUS_CONFIG).map(([value, { text }]) => ({ text, value })),
      onFilter: (value, record) => record.status === value,
      render: (status: string) => {
        const cfg = STATUS_CONFIG[status] ?? { text: status, color: "default" };
        return <Tag color={cfg.color}>{cfg.text}</Tag>;
      }
    },
    {
      title: "地址", dataIndex: "address", key: "address",
      ...addressSearch,
      render: (v: string | null) => v ?? <span className="text-slate-400">—</span>
    },
    {
      title: "店长", dataIndex: "manager", key: "manager", width: 140,
      render: (m: StoreRow["manager"]) =>
        m
          ? <span className="font-mono text-sm">{m.nickname ?? m.username}</span>
          : <span className="text-slate-400">未指派</span>
    },
    {
      title: "操作", key: "action", width: 140,
      render: (_: unknown, row: StoreRow) => (
        <div className="flex gap-2">
          {row.status === "PENDING_REVIEW" && (
            <Button size="small" type="primary"
              onClick={() => router.push(`/admin/stores/${row.id}`)}>
              审核
            </Button>
          )}
          <Button size="small" onClick={() => router.push(`/admin/stores/${row.id}`)}>
            详情
          </Button>
        </div>
      )
    }
  ];

  return (
    <Layout className="dashboard-shell">
      {/* Header：左返回，中标题，右头像 */}
      <header className="dashboard-header" style={{ position: "relative" }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/")} />

        <Typography.Title
          level={5}
          className="!mb-0 !text-slate-950"
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}
        >
          运营管理
        </Typography.Title>

        <Dropdown menu={{ items: dropdownItems }} placement="bottomRight" trigger={["click"]}>
          <button className="dashboard-avatar-btn">
            {user?.avatarUrl ? (
              <Avatar src={user.avatarUrl} size={36} />
            ) : (
              <Avatar size={36} style={{ background: "#1677ff", cursor: "pointer" }}>
                {displayName.charAt(0).toUpperCase()}
              </Avatar>
            )}
          </button>
        </Dropdown>
      </header>

      <Layout.Content className="home-content">
        <div className="section-card" style={{ overflow: "hidden" }}>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={storesQuery.data?.items ?? []}
            loading={storesQuery.isLoading}
            pagination={{
              current: page,
              total: storesQuery.data?.total ?? 0,
              pageSize: 20,
              onChange: (p) => setPage(p),
              showTotal: (t) => `共 ${t} 家`
            }}
            style={{ borderRadius: 0 }}
          />
        </div>
      </Layout.Content>

      {/* 悬浮创建按钮 */}
      <Tooltip title="创建门店" placement="left">
        <button className="admin-fab" onClick={() => setCreateOpen(true)}>
          <PlusOutlined />
        </button>
      </Tooltip>

      <CreateStoreModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["admin-stores"] })}
      />
    </Layout>
  );
}
