"use client";

import {
  App, Avatar, Button, Descriptions, Divider, Form, Image, Input,
  Layout, Modal, Spin, Tag, Typography
} from "antd";
import {
  ArrowLeftOutlined, CheckOutlined, CloseOutlined,
  LockOutlined, SearchOutlined, UnlockOutlined, UserSwitchOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import { storeApi, userApi } from "../../../../src/lib/api";

const STATUS_CONFIG: Record<string, { text: string; color: string }> = {
  DRAFTED: { text: "筹办中", color: "default" },
  PENDING_REVIEW: { text: "待审核", color: "processing" },
  PUBLISHED: { text: "公开", color: "success" },
  FROZEN: { text: "已冻结", color: "warning" }
};

// ─── 驳回 Modal ───────────────────────────────────────────────────
function RejectModal({ open, onClose, onConfirm, loading }: {
  open: boolean; onClose: () => void;
  onConfirm: (note: string) => void; loading: boolean;
}) {
  const [note, setNote] = useState("");
  const handleOk = () => { if (note.trim()) onConfirm(note); };
  const handleClose = () => { setNote(""); onClose(); };

  return (
    <Modal
      open={open} title="驳回原因" onCancel={handleClose}
      onOk={handleOk} okText="确认驳回" cancelText="取消"
      okButtonProps={{ danger: true, disabled: !note.trim(), loading }}
      destroyOnHidden
    >
      <Form layout="vertical" className="mt-4">
        <Form.Item label="请填写驳回原因" required>
          <Input.TextArea
            rows={4} maxLength={200} showCount
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="请填写驳回原因，店长将收到通知"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── 变更店长 Modal ───────────────────────────────────────────────
function ChangeManagerModal({ open, onClose, onConfirm, loading }: {
  open: boolean; onClose: () => void;
  onConfirm: (userId: string) => void; loading: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<{
    id: string; username: string; nickname: string | null
  } | null>(null);

  const searchQuery = useQuery({
    queryKey: ["user-search", keyword],
    queryFn: () => userApi.searchUsers(keyword),
    enabled: keyword.trim().length > 0
  });

  const handleClose = () => { setKeyword(""); setSelected(null); onClose(); };

  return (
    <Modal
      open={open} title="变更店长" onCancel={handleClose}
      onOk={() => selected && onConfirm(selected.id)}
      okText="确认变更" cancelText="取消"
      okButtonProps={{ disabled: !selected, loading }}
      destroyOnHidden
    >
      <Form layout="vertical" className="mt-4">
        <Form.Item label="搜索新店长">
          <Input
            prefix={<SearchOutlined className="text-slate-400" />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setSelected(null); }}
            placeholder="搜索用户名" allowClear
          />
          {searchQuery.isFetching && <Spin size="small" className="mt-2 block" />}
          {searchQuery.data && searchQuery.data.length > 0 && !selected && (
            <div className="mt-1 rounded border border-slate-200 bg-white shadow-sm">
              {searchQuery.data.map((u) => (
                <div key={u.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50"
                  onClick={() => { setSelected(u); setKeyword(u.username); }}
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
          {selected && (
            <div className="mt-2 flex items-center gap-2 rounded bg-blue-50 px-3 py-2 text-sm">
              <Avatar size={20} style={{ background: "#1677ff", fontSize: 10 }}>
                {(selected.nickname ?? selected.username).charAt(0).toUpperCase()}
              </Avatar>
              <span>已选：<span className="font-mono">{selected.username}</span></span>
              <Button type="link" size="small" danger
                onClick={() => { setSelected(null); setKeyword(""); }}>
                重选
              </Button>
            </div>
          )}
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────
export default function AdminStorePage() {
  const params = useParams<{ id: string }>();
  const storeId = params.id;
  const router = useRouter();
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [changeManagerOpen, setChangeManagerOpen] = useState(false);

  const storeQuery = useQuery({
    queryKey: ["admin-store", storeId],
    queryFn: () => storeApi.adminGetStore(storeId),
    staleTime: 5_000
  });

  const store = storeQuery.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-store", storeId] });
    queryClient.invalidateQueries({ queryKey: ["admin-stores"] });
  };

  const approveMutation = useMutation({
    mutationFn: () => storeApi.reviewSubmission(store!.pendingSubmission!.id, { action: "APPROVE" }),
    onSuccess: () => { message.success("审核通过"); invalidate(); },
    onError: (e: Error) => message.error(e.message)
  });

  const rejectMutation = useMutation({
    mutationFn: (note: string) =>
      storeApi.reviewSubmission(store!.pendingSubmission!.id, { action: "REJECT", reviewNote: note }),
    onSuccess: () => { message.success("已驳回"); setRejectOpen(false); invalidate(); },
    onError: (e: Error) => message.error(e.message)
  });

  const freezeMutation = useMutation({
    mutationFn: () => storeApi.freeze(storeId),
    onSuccess: () => { message.success("门店已冻结"); invalidate(); },
    onError: (e: Error) => message.error(e.message)
  });

  const unfreezeMutation = useMutation({
    mutationFn: () => storeApi.unfreeze(storeId),
    onSuccess: () => { message.success("门店已解冻"); invalidate(); },
    onError: (e: Error) => message.error(e.message)
  });

  const changeManagerMutation = useMutation({
    mutationFn: (newManagerId: string) => storeApi.changeManager(storeId, newManagerId),
    onSuccess: () => { message.success("店长已变更"); setChangeManagerOpen(false); invalidate(); },
    onError: (e: Error) => message.error(e.message)
  });

  const statusCfg = store ? (STATUS_CONFIG[store.status] ?? { text: store.status, color: "default" }) : null;

  return (
    <Layout className="dashboard-shell">
      {/* Header */}
      <header className="dashboard-header" style={{ position: "relative" }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/admin")} />
        <Typography.Title
          level={5} className="!mb-0 !text-slate-950"
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}
        >
          门店详情
        </Typography.Title>
        <div style={{ width: 32 }} />
      </header>

      <Layout.Content className="home-content" style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {storeQuery.isLoading && (
          <div className="flex justify-center pt-16"><Spin size="large" /></div>
        )}

        {store && (
          <>
            {/* ── 基本信息 ── */}
            <section className="section-card mb-5">
              <div className="section-card-header">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="section-card-title" style={{ fontSize: 16 }}>{store.name}</div>
                    <div className="section-card-subtitle">创建于 {new Date(store.createdAt).toLocaleDateString("zh-CN")}</div>
                  </div>
                  {statusCfg && <Tag color={statusCfg.color}>{statusCfg.text}</Tag>}
                </div>
                <div className="flex gap-2">
                  {store.status === "FROZEN" ? (
                    <Button
                      icon={<UnlockOutlined />}
                      loading={unfreezeMutation.isPending}
                      onClick={() => unfreezeMutation.mutate()}
                    >
                      解冻
                    </Button>
                  ) : store.status !== "DRAFTED" ? (
                    <Button
                      icon={<LockOutlined />} danger
                      loading={freezeMutation.isPending}
                      onClick={() => freezeMutation.mutate()}
                    >
                      冻结
                    </Button>
                  ) : null}
                  <Button
                    icon={<UserSwitchOutlined />}
                    onClick={() => setChangeManagerOpen(true)}
                  >
                    变更店长
                  </Button>
                </div>
              </div>

              <div className="section-card-body">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="地址">
                    {store.address ?? <span className="text-slate-400">未填写</span>}
                  </Descriptions.Item>
                  <Descriptions.Item label="简介">
                    {store.description ?? <span className="text-slate-400">未填写</span>}
                  </Descriptions.Item>
                  <Descriptions.Item label="店长">
                    {store.manager
                      ? (
                        <span className="flex items-center gap-2">
                          <Avatar
                            src={store.manager.avatarUrl ?? undefined}
                            size={20}
                            style={{ background: "#1677ff", fontSize: 10 }}
                          >
                            {!store.manager.avatarUrl && (store.manager.nickname ?? store.manager.username).charAt(0).toUpperCase()}
                          </Avatar>
                          <span className="font-mono text-sm">{store.manager.nickname ?? store.manager.username}</span>
                          <span className="text-slate-400 text-xs">@{store.manager.username}</span>
                        </span>
                      )
                      : <span className="text-slate-400">未指派</span>
                    }
                  </Descriptions.Item>
                </Descriptions>
              </div>

              {/* 当前照片 */}
              {store.photos.length > 0 && (
                <>
                  <Divider style={{ margin: 0 }} />
                  <Image.PreviewGroup>
                    <div className="photo-strip">
                      {store.photos.map((p) => (
                        <div key={p.id} className="photo-thumb">
                          <Image src={p.url} width={80} height={80}
                            style={{ objectFit: "cover" }} preview={{ mask: false }} />
                          {p.isCover && <span className="photo-thumb-badge">封面</span>}
                        </div>
                      ))}
                    </div>
                  </Image.PreviewGroup>
                </>
              )}
            </section>

            {/* ── 待审核提交 ── */}
            {store.pendingSubmission ? (
              <section className="submission-card">
                <div className="submission-card-header">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1e40af" }}>待审核提交</div>
                    <div style={{ fontSize: 12, color: "#3b82f6", marginTop: 2 }}>
                      由{" "}
                      <span style={{ fontFamily: "monospace" }}>
                        {store.pendingSubmission.submittedBy.nickname ?? store.pendingSubmission.submittedBy.username}
                      </span>{" "}
                      提交于 {new Date(store.pendingSubmission.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="primary" icon={<CheckOutlined />}
                      loading={approveMutation.isPending}
                      onClick={() => approveMutation.mutate()}
                    >
                      通过
                    </Button>
                    <Button
                      danger icon={<CloseOutlined />}
                      onClick={() => setRejectOpen(true)}
                    >
                      驳回
                    </Button>
                  </div>
                </div>

                <div className="submission-card-body">
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="门店名称">{store.pendingSubmission.name}</Descriptions.Item>
                    <Descriptions.Item label="地址">
                      {store.pendingSubmission.address ?? <span className="text-slate-400">未填写</span>}
                    </Descriptions.Item>
                    <Descriptions.Item label="简介">
                      {store.pendingSubmission.description ?? <span className="text-slate-400">未填写</span>}
                    </Descriptions.Item>
                  </Descriptions>

                  {store.pendingSubmission.photos.length > 0 && (
                    <>
                      <Divider style={{ margin: "12px 0 8px" }} />
                      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>提交的照片</div>
                      <Image.PreviewGroup>
                        <div className="flex flex-wrap gap-2">
                          {store.pendingSubmission.photos.map((p) => (
                            <div key={p.id} className="photo-thumb">
                              <Image src={p.url} width={80} height={80}
                                style={{ objectFit: "cover" }} preview={{ mask: false }} />
                              {p.isCover && <span className="photo-thumb-badge">封面</span>}
                            </div>
                          ))}
                        </div>
                      </Image.PreviewGroup>
                    </>
                  )}
                </div>
              </section>
            ) : (
              <section className="section-card" style={{ textAlign: "center", padding: "28px 20px" }}>
                <Typography.Text type="secondary">暂无待审核内容</Typography.Text>
              </section>
            )}
          </>
        )}
      </Layout.Content>

      <RejectModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={(note) => rejectMutation.mutate(note)}
        loading={rejectMutation.isPending}
      />

      <ChangeManagerModal
        open={changeManagerOpen}
        onClose={() => setChangeManagerOpen(false)}
        onConfirm={(userId) => changeManagerMutation.mutate(userId)}
        loading={changeManagerMutation.isPending}
      />
    </Layout>
  );
}
