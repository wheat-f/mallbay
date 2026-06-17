"use client";

import {
  App, Avatar, Button, Card, Drawer, Form, Input,
  Spin, Table, Tag
} from "antd";
import type { ColumnType } from "antd/es/table";
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  ShopOutlined,
  StopOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { storeApi, userApi } from "../../src/lib/api";

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

// ─── 创建门店抽屉 ───────────────────────────────────────────────
function CreateStoreDrawer({ open, onClose, onCreated }: {
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
    mutationFn: () => {
      if (!selectedUser?.id) throw new Error("请先选择店长");
      return storeApi.create({ name: storeName, managerId: selectedUser.id });
    },
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
    <Drawer
      open={open}
      title="创建门店"
      onClose={handleClose}
      rootClassName="admin-store-create-drawer"
      footer={(
        <div className="admin-store-drawer-footer">
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            disabled={!storeName.trim() || !selectedUser}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            创建
          </Button>
        </div>
      )}
      destroyOnHidden
    >
      <Form layout="vertical" className="mt-4">
        <Form.Item label="门店名称" required>
          <Input value={storeName} onChange={(e) => setStoreName(e.target.value)}
            maxLength={50} showCount placeholder="请输入门店名称" />
        </Form.Item>
        <Form.Item label="指派店长" required>
          <Input
            prefix={<SearchOutlined className="text-[var(--mb-text-muted)]" />}
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
            <div className="mt-1 text-xs text-[var(--mb-text-muted)]">未找到匹配用户</div>
          )}
          {searchQuery.data && searchQuery.data.length > 0 && !selectedUser && (
            <div className="dashboard-user-search-results">
              {searchQuery.data.map((u) => (
                <div key={u.id}
                  className="dashboard-user-search-row"
                  onClick={() => { setSelectedUser(u); setKeyword(u.username); }}
                >
                  <Avatar size={24} style={{ background: "var(--mb-primary)", fontSize: 12 }}>
                    {(u.nickname ?? u.username).charAt(0).toUpperCase()}
                  </Avatar>
                  <span className="font-mono text-sm">{u.username}</span>
                  {u.nickname && <span className="text-[var(--mb-text-muted)] text-sm">{u.nickname}</span>}
                </div>
              ))}
            </div>
          )}
          {selectedUser && (
            <div className="mt-2 flex items-center gap-2 rounded bg-[var(--mb-primary-container)] px-3 py-2 text-sm">
              <Avatar size={20} style={{ background: "var(--mb-primary)", fontSize: 10 }}>
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
    </Drawer>
  );
}

// ─── 列文字搜索 hook ──────────────────────────────────────────────
function useColumnSearch(dataIndex: keyof StoreRow): ColumnType<StoreRow> {
  const [, setSearchText] = useState("");
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
      <SearchOutlined style={{ color: filtered ? "var(--mb-primary)" : undefined }} />
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);

  // 一次拉取足够多，客户端做列过滤（admin 场景门店数量可控）
  const storesQuery = useQuery({
    queryKey: ["admin-stores", page],
    queryFn: () => storeApi.adminList({ page, pageSize: 100 } as Parameters<typeof storeApi.adminList>[0]),
    staleTime: 10_000
  });

  const nameSearch = useColumnSearch("name");
  const addressSearch = useColumnSearch("address");
  const stores = storesQuery.data?.items ?? [];
  const pendingCount = stores.filter((row) => row.status === "PENDING_REVIEW").length;
  const publishedCount = stores.filter((row) => row.status === "PUBLISHED").length;
  const frozenCount = stores.filter((row) => row.status === "FROZEN").length;
  const draftedCount = stores.filter((row) => row.status === "DRAFTED").length;
  const pendingStores = stores.filter((row) => row.status === "PENDING_REVIEW").slice(0, 3);

  const columns: ColumnType<StoreRow>[] = [
    {
      title: "门店名称", dataIndex: "name", key: "name",
      ...nameSearch,
      render: (name: string, row: StoreRow) => (
        <span className="cursor-pointer font-medium text-[var(--mb-primary)] hover:underline"
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
      render: (v: string | null) => v ?? <span className="text-[var(--mb-text-muted)]">—</span>
    },
    {
      title: "店长", dataIndex: "manager", key: "manager", width: 140,
      render: (m: StoreRow["manager"]) =>
        m
          ? <span className="font-mono text-sm">{m.nickname ?? m.username}</span>
          : <span className="text-[var(--mb-text-muted)]">未指派</span>
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
    <>
      <div className="management-page admin-review-command-page">
        <div className="management-page-header admin-review-hero">
          <div>
            <h1 className="management-page-title">
              mallbay 门店审核与管理
            </h1>
            <p className="management-page-description">
              管理平台所有加盟店的生命周期与信息变更审核
            </p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建门店并分配经理
          </Button>
        </div>

        <section className="admin-review-dashboard-grid">
          <Card className="admin-review-queue">
            <div className="admin-review-card-head">
              <div>
                <span className="admin-review-eyebrow">审核队列</span>
                <h2>待处理信息变更 ({pendingCount})</h2>
              </div>
              <Button type="link" onClick={() => setPage(1)}>
                查看全部队列
              </Button>
            </div>

            <div className="admin-review-queue-list">
              {pendingStores.length > 0 ? (
                pendingStores.map((store) => (
                  <article key={store.id} className="admin-review-queue-item">
                    <div className="admin-review-queue-item-head">
                      <div>
                        <span>申请时间：{new Date(store.createdAt).toLocaleString("zh-CN")}</span>
                        <h3>{store.name}</h3>
                      </div>
                      <div className="admin-review-queue-actions">
                        <Button size="small" type="primary" icon={<CheckCircleOutlined />} onClick={() => router.push(`/admin/stores/${store.id}`)}>
                          批准
                        </Button>
                        <Button size="small" danger icon={<StopOutlined />} onClick={() => router.push(`/admin/stores/${store.id}`)}>
                          驳回
                        </Button>
                      </div>
                    </div>
                    <div className="admin-review-diff-grid">
                      <div>
                        <b>字段核对</b>
                        <p>
                          <span>门店名称：</span>
                          {store.name}
                        </p>
                        <p>
                          <span>门店地址：</span>
                          {store.address ?? "待补充"}
                        </p>
                      </div>
                      <div>
                        <b>资料状态</b>
                        <p>
                          <span>店长：</span>
                          {store.manager?.nickname ?? store.manager?.username ?? "未指派"}
                        </p>
                        <p>
                          <span>封面：</span>
                          {store.coverUrl ? "已上传" : "待上传"}
                        </p>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="admin-review-empty">
                  <FileSearchOutlined />
                  <strong>暂无待处理门店</strong>
                  <span>新的门店提交后会出现在这里，管理员可进入详情完成审核。</span>
                </div>
              )}
            </div>
          </Card>

          <aside className="admin-review-side">
            <Card className="admin-status-distribution">
              <div className="admin-review-eyebrow">门店状态</div>
              <h2>门店状态分布</h2>
              {[
                ["公开经营", publishedCount, "is-success"],
                ["筹办中", draftedCount, "is-info"],
                ["待审核", pendingCount, "is-warning"],
                ["已冻结", frozenCount, "is-danger"]
              ].map(([label, value, tone]) => (
                <div key={label} className="admin-status-row">
                  <span className={String(tone)} />
                  <p>{label}</p>
                  <strong>{value}</strong>
                </div>
              ))}
              <div className="admin-weekly-review">
                <span>本周处理审核量</span>
                <strong>{pendingCount + publishedCount}</strong>
              </div>
            </Card>

            <Card className="admin-operation-guide">
              <h2>操作指引</h2>
              <div className="admin-guide-item">
                <InfoCircleOutlined />
                <span>创建门店后，店长需要完成资料和照片提交。</span>
              </div>
              <div className="admin-guide-item">
                <ExclamationCircleOutlined />
                <span>冻结门店会停止该门店公开访问和运营入口。</span>
              </div>
            </Card>
          </aside>
        </section>

        <Card
          className="admin-store-table-card management-table-card"
          title={
            <div className="admin-store-table-title">
              <ShopOutlined />
              <span>所有门店列表</span>
            </div>
          }
          extra={<Tag color="processing">共 {storesQuery.data?.total ?? stores.length} 家</Tag>}
        >
          <div className="admin-store-mobile-cards">
            {stores.length > 0 ? (
              stores.map((store) => {
                const statusConfig = STATUS_CONFIG[store.status] ?? { text: store.status, color: "default" };
                const managerName = store.manager?.nickname ?? store.manager?.username ?? "未指派";

                return (
                  <article className="admin-store-mobile-card" key={store.id}>
                    <div className="admin-store-mobile-card-head">
                      <div>
                        <strong>{store.name}</strong>
                        <span>{store.address ?? "地址待补充"}</span>
                      </div>
                      <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
                    </div>
                    <dl className="admin-store-mobile-fields">
                      <div>
                        <dt>店长</dt>
                        <dd>{managerName}</dd>
                      </div>
                      <div>
                        <dt>创建时间</dt>
                        <dd>{new Date(store.createdAt).toLocaleDateString("zh-CN")}</dd>
                      </div>
                      <div>
                        <dt>封面</dt>
                        <dd>{store.coverUrl ? "已上传" : "待上传"}</dd>
                      </div>
                    </dl>
                    <div className="admin-store-mobile-actions">
                      {store.status === "PENDING_REVIEW" && (
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => router.push(`/admin/stores/${store.id}`)}
                        >
                          审核
                        </Button>
                      )}
                      <Button size="small" onClick={() => router.push(`/admin/stores/${store.id}`)}>
                        详情
                      </Button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="admin-store-mobile-empty">
                {storesQuery.isLoading ? "门店加载中" : "暂无门店"}
              </div>
            )}
          </div>
          <Table
            className="admin-store-desktop-table"
            rowKey="id"
            columns={columns}
            dataSource={stores}
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
        </Card>
      </div>

      <CreateStoreDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ["admin-stores"] })}
      />
    </>
  );
}
