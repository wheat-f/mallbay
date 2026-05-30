"use client";

import {
  App, Avatar, Button, Descriptions, Divider, Dropdown,
  Form, Image, Input, Layout, Modal, Select, Spin, Tag, Tooltip, Typography
} from "antd";
import {
  ArrowLeftOutlined, DeleteOutlined, LoadingOutlined,
  PlusOutlined, StarFilled, StarOutlined, UserOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { authApi, memberApi, storeApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";

const POSITION_OPTIONS = [
  { label: "销售", value: "SALES" },
  { label: "采购", value: "PURCHASING" },
  { label: "财务", value: "FINANCE" },
  { label: "排班员", value: "SCHEDULER" },
  { label: "施工员", value: "CONSTRUCTION" },
  { label: "学徒", value: "APPRENTICE" }
];

const POSITION_LABEL: Record<string, string> = {
  MANAGER: "店长", SALES: "销售", PURCHASING: "采购",
  FINANCE: "财务", SCHEDULER: "排班员", CONSTRUCTION: "施工员", APPRENTICE: "学徒"
};

const STATUS_CONFIG: Record<string, { text: string; color: string }> = {
  DRAFTED: { text: "筹办中", color: "default" },
  PENDING_REVIEW: { text: "审核中", color: "processing" },
  PUBLISHED: { text: "公开", color: "success" },
  FROZEN: { text: "已冻结", color: "warning" }
};

// ─── 邀请成员 Modal ───────────────────────────────────────────────
function InviteModal({ storeId, open, onClose, onDone }: {
  storeId: string; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<{ id: string; username: string; nickname: string | null } | null>(null);
  const [position, setPosition] = useState("SALES");

  const searchQuery = useQuery({
    queryKey: ["invitable", storeId, keyword],
    queryFn: () => memberApi.searchInvitable(storeId, keyword),
    enabled: keyword.trim().length > 0,
    staleTime: 0
  });

  const inviteMutation = useMutation({
    mutationFn: () => memberApi.invite(storeId, selected!.id, position),
    onSuccess: () => {
      message.success(`已发出邀请`);
      setKeyword(""); setSelected(null); setPosition("SALES");
      onDone(); onClose();
    },
    onError: (e: Error) => message.error(e.message)
  });

  const handleClose = () => { setKeyword(""); setSelected(null); setPosition("SALES"); onClose(); };

  return (
    <Modal open={open} title="邀请成员" onCancel={handleClose}
      onOk={() => inviteMutation.mutate()} okText="发出邀请" cancelText="取消"
      okButtonProps={{ disabled: !selected, loading: inviteMutation.isPending }}
      destroyOnHidden>
      <Form layout="vertical" className="mt-4">
        <Form.Item label="搜索用户" required>
          <Input
            prefix={<UserOutlined className="text-slate-400" />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setSelected(null); }}
            placeholder="输入用户名搜索" allowClear
          />
          {searchQuery.isFetching && <Spin size="small" className="mt-2 block" />}
          {searchQuery.isError && (
            <p className="mt-1 text-xs text-red-500">{(searchQuery.error as Error)?.message}</p>
          )}
          {searchQuery.data && searchQuery.data.length === 0 && !searchQuery.isFetching && !selected && (
            <p className="mt-1 text-xs text-slate-400">未找到匹配用户</p>
          )}
          {searchQuery.data && searchQuery.data.length > 0 && !selected && (
            <div className="mt-1 rounded border border-slate-200 bg-white shadow-sm">
              {searchQuery.data.map((u) => (
                <div key={u.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50"
                  onClick={() => { setSelected(u); setKeyword(u.username); }}>
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
              <Button type="link" size="small" danger onClick={() => { setSelected(null); setKeyword(""); }}>重选</Button>
            </div>
          )}
        </Form.Item>
        <Form.Item label="岗位" required>
          <Select value={position} onChange={setPosition} options={POSITION_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── 照片上传 Grid ────────────────────────────────────────────────
type PhotoItem = { uid: string; url: string; isCover: boolean };

function PhotoGrid({ storeId, photos, onChange }: {
  storeId: string;
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
}) {
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { message.error("图片不超过 5 MB"); return; }
    setUploading(true);
    try {
      const result = await storeApi.uploadPhoto(storeId, file);
      onChange([...photos, {
        uid: `${Date.now()}`,
        url: result.url,
        isCover: photos.length === 0
      }]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const setCover = (uid: string) =>
    onChange(photos.map((p) => ({ ...p, isCover: p.uid === uid })));

  const remove = (uid: string) => {
    const next = photos.filter((p) => p.uid !== uid);
    if (next.length > 0 && !next.some((p) => p.isCover)) next[0].isCover = true;
    onChange(next);
  };

  const BOX = { width: 96, height: 96 } as const;

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <div key={p.uid} className="group relative" style={BOX}>
          <img
            src={p.url} alt=""
            style={{ ...BOX, objectFit: "cover", borderRadius: 8,
              border: p.isCover ? "2px solid #1677ff" : "2px solid #e2e8f0" }}
          />
          {/* 封面角标 */}
          {p.isCover && (
            <span className="absolute bottom-1 left-1 rounded px-1 text-white"
              style={{ fontSize: 10, background: "#1677ff", lineHeight: "16px" }}>封面</span>
          )}
          {/* hover 操作层 */}
          <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg
            bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
            <Tooltip title={p.isCover ? "当前封面" : "设为封面"}>
              <button
                onClick={() => setCover(p.uid)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-xs"
              >
                {p.isCover
                  ? <StarFilled style={{ color: "#1677ff", fontSize: 14 }} />
                  : <StarOutlined style={{ color: "#666", fontSize: 14 }} />}
              </button>
            </Tooltip>
            <Tooltip title="删除">
              <button
                onClick={() => remove(p.uid)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90"
              >
                <DeleteOutlined style={{ color: "#ff4d4f", fontSize: 14 }} />
              </button>
            </Tooltip>
          </div>
        </div>
      ))}

      {/* 上传中占位 */}
      {uploading && (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50"
          style={BOX}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 20 }} spin />} />
        </div>
      )}

      {/* + 按钮 */}
      {photos.length + (uploading ? 1 : 0) < 5 && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-lg border border-dashed
              border-slate-300 bg-slate-50 text-slate-400 transition-colors hover:border-blue-400 hover:text-blue-500"
            style={BOX}
          >
            <PlusOutlined style={{ fontSize: 18 }} />
            <span style={{ fontSize: 11, marginTop: 4 }}>添加照片</span>
          </button>
          <input
            ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}

// ─── 提交/编辑 Modal ──────────────────────────────────────────────
function SubmitModal({ storeId, initialData, open, onClose, onDone }: {
  storeId: string;
  initialData: { name: string; address: string | null; description: string | null; photos: { url: string; isCover: boolean; order: number }[] };
  open: boolean; onClose: () => void; onDone: () => void;
}) {
  const { message } = App.useApp();
  const [name, setName] = useState(initialData.name);
  const [address, setAddress] = useState(initialData.address ?? "");
  const [description, setDescription] = useState(initialData.description ?? "");
  const [photos, setPhotos] = useState<PhotoItem[]>(
    initialData.photos.map((p, i) => ({ uid: `init-${i}`, url: p.url, isCover: p.isCover }))
  );

  const submitMutation = useMutation({
    mutationFn: () => {
      if (photos.length === 0) throw new Error("请至少上传一张照片");
      return storeApi.submitStore(storeId, {
        name: name.trim(),
        address: address.trim(),
        description: description.trim(),
        photos: photos.map((p, i) => ({ url: p.url, isCover: p.isCover, order: i }))
      });
    },
    onSuccess: () => { message.success("已提交审核"); onDone(); onClose(); },
    onError: (e: Error) => message.error(e.message)
  });

  const canSubmit = name.trim() && address.trim() && photos.length > 0;

  return (
    <Modal open={open} title="编辑并提交审核" onCancel={onClose}
      onOk={() => submitMutation.mutate()} okText="提交审核" cancelText="取消"
      okButtonProps={{ disabled: !canSubmit, loading: submitMutation.isPending }}
      width={560} destroyOnHidden>
      <Form layout="vertical" className="mt-4">
        <Form.Item label="门店名称" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} showCount />
        </Form.Item>
        <Form.Item label="地址" required>
          <Input value={address} onChange={(e) => setAddress(e.target.value)}
            maxLength={100} showCount placeholder="填写详细地址" />
        </Form.Item>
        <Form.Item label="简介">
          <Input.TextArea value={description} onChange={(e) => setDescription(e.target.value)}
            maxLength={300} showCount rows={3} placeholder="简短介绍门店" />
        </Form.Item>
        <Form.Item label="门店照片" required
          extra="最多 5 张 · 最大 5 MB · 悬停图片可设封面或删除">
          <PhotoGrid storeId={storeId} photos={photos} onChange={setPhotos} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────
export default function WorkbenchPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const router = useRouter();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const storeQuery = useQuery({
    queryKey: ["workbench-store", storeId],
    queryFn: () => storeApi.myStore(storeId),
    staleTime: 5_000
  });

  const store = storeQuery.data;
  const statusCfg = store ? (STATUS_CONFIG[store.status] ?? { text: store.status, color: "default" }) : null;
  const isManager = store?.currentMember.position === "MANAGER";
  const canManageStore = isManager && store.status !== "PENDING_REVIEW" && store.status !== "FROZEN";

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => { clearSession(); router.push("/auth"); }
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => memberApi.remove(storeId, userId),
    onSuccess: () => { message.success("已移除成员"); queryClient.invalidateQueries({ queryKey: ["workbench-store", storeId] }); },
    onError: (e: Error) => message.error(e.message)
  });

  const displayName = user ? (user.nickname ?? user.username ?? "") : "";

  const avatarItems = [
    { key: "home", label: "返回首页", icon: <ArrowLeftOutlined />, onClick: () => router.push("/") },
    { type: "divider" as const },
    { key: "profile", label: "个人设置", icon: <UserOutlined />, onClick: () => router.push("/profile") },
    { type: "divider" as const },
    { key: "logout", label: "退出登录", danger: true, onClick: () => logoutMutation.mutate() }
  ];

  const invalidateStore = () => queryClient.invalidateQueries({ queryKey: ["workbench-store", storeId] });

  return (
    <Layout className="dashboard-shell">
      {/* Header */}
      <header className="dashboard-header" style={{ position: "relative" }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => router.push("/")} />
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8 }}>
          <Typography.Title level={5} className="!mb-0 !text-slate-950">
            {store?.name ?? "门店工作台"}
          </Typography.Title>
          {statusCfg && <Tag color={statusCfg.color}>{statusCfg.text}</Tag>}
        </div>
        <Dropdown menu={{ items: avatarItems }} placement="bottomRight" trigger={["click"]}>
          <button className="dashboard-avatar-btn">
            {user?.avatarUrl
              ? <Avatar src={user.avatarUrl} size={36} />
              : <Avatar size={36} style={{ background: "#1677ff", cursor: "pointer" }}>
                  {displayName.charAt(0).toUpperCase()}
                </Avatar>}
          </button>
        </Dropdown>
      </header>

      <Layout.Content className="home-content" style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
        {storeQuery.isLoading && (
          <div className="flex justify-center pt-16"><Spin size="large" /></div>
        )}

        {store && (
          <>
            {/* ── 门店信息 ── */}
            <section className="section-card mb-5">
              <div className="section-card-header">
                <div>
                  <div className="section-card-title">门店信息</div>
                </div>
                {!isManager ? null : store.status === "PENDING_REVIEW" ? (
                  <Tag color="processing">审核中，请等待结果</Tag>
                ) : store.status === "FROZEN" ? (
                  <Tag color="warning">门店已冻结</Tag>
                ) : (
                  <Button type="primary" size="small" disabled={!canManageStore} onClick={() => setSubmitOpen(true)}>
                    编辑并提交审核
                  </Button>
                )}
              </div>

              <div className="section-card-body">
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="名称">{store.name}</Descriptions.Item>
                  <Descriptions.Item label="地址">
                    {store.address ?? <span className="text-slate-400">未填写</span>}
                  </Descriptions.Item>
                  <Descriptions.Item label="简介">
                    {store.description ?? <span className="text-slate-400">未填写</span>}
                  </Descriptions.Item>
                </Descriptions>
              </div>

              {store.photos.length > 0 && (
                <>
                  <Divider style={{ margin: "0" }} />
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

            {/* ── 成员管理 ── */}
            <section className="section-card">
              <div className="section-card-header">
                <div>
                  <div className="section-card-title">
                    团队成员
                    <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 400, color: "#94a3b8" }}>
                      {store.members.length} 人
                    </span>
                  </div>
                </div>
                {isManager && (
                  <Button size="small" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
                    邀请成员
                  </Button>
                )}
              </div>

              <div>
                {store.members.map((m) => (
                  <div key={m.id} className="member-row">
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={m.user.avatarUrl ?? undefined}
                        size={38}
                        style={{ background: "#1677ff", fontSize: 14, flexShrink: 0 }}
                      >
                        {!m.user.avatarUrl && (m.user.nickname ?? m.user.username).charAt(0).toUpperCase()}
                      </Avatar>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", lineHeight: 1.4 }}>
                          {m.user.nickname ?? m.user.username}
                        </div>
                        <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", marginTop: 1 }}>
                          @{m.user.username}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Tag color={m.position === "MANAGER" ? "blue" : "default"} style={{ margin: 0 }}>
                        {POSITION_LABEL[m.position] ?? m.position}
                      </Tag>
                      {isManager && m.position !== "MANAGER" && (
                        <Button
                          size="small" danger type="text"
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            Modal.confirm({
                              title: "确认移除",
                              content: `确定将「${m.user.nickname ?? m.user.username}」移出团队吗？`,
                              okText: "移除", okButtonProps: { danger: true },
                              cancelText: "取消",
                              onOk: () => removeMutation.mutate(m.user.id)
                            });
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </Layout.Content>

      {isManager && (
        <InviteModal
          storeId={storeId}
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          onDone={invalidateStore}
        />
      )}

      {store && isManager && submitOpen && (
        <SubmitModal
          storeId={storeId}
          initialData={store}
          open={submitOpen}
          onClose={() => setSubmitOpen(false)}
          onDone={invalidateStore}
        />
      )}
    </Layout>
  );
}
