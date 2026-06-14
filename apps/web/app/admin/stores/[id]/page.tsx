"use client";

import {
  Alert, App, Avatar, Button, Card, Drawer, Form, Image, Input,
  Spin, Tag, Typography
} from "antd";
import {
  ArrowLeftOutlined,
  AuditOutlined,
  CheckOutlined,
  CloseOutlined,
  FileSearchOutlined,
  LockOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  UnlockOutlined,
  UserSwitchOutlined
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

type StorePhoto = { id: string; url: string; isCover: boolean; order: number };

// ─── 驳回抽屉 ───────────────────────────────────────────────────
function RejectDrawer({ open, onClose, onConfirm, loading }: {
  open: boolean; onClose: () => void;
  onConfirm: (note: string) => void; loading: boolean;
}) {
  const [note, setNote] = useState("");
  const handleOk = () => { if (note.trim()) onConfirm(note); };
  const handleClose = () => { setNote(""); onClose(); };

  return (
    <Drawer
      open={open}
      title="驳回原因"
      onClose={handleClose}
      rootClassName="admin-store-reject-drawer"
      footer={(
        <div className="admin-store-drawer-footer">
          <Button onClick={handleClose}>取消</Button>
          <Button danger type="primary" disabled={!note.trim()} loading={loading} onClick={handleOk}>
            确认驳回
          </Button>
        </div>
      )}
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
    </Drawer>
  );
}

// ─── 变更店长抽屉 ───────────────────────────────────────────────
function ChangeManagerDrawer({ open, onClose, onConfirm, loading }: {
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
    <Drawer
      open={open}
      title="变更店长"
      onClose={handleClose}
      rootClassName="admin-store-manager-drawer"
      footer={(
        <div className="admin-store-drawer-footer">
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            disabled={!selected}
            loading={loading}
            onClick={() => selected && onConfirm(selected.id)}
          >
            确认变更
          </Button>
        </div>
      )}
      destroyOnHidden
    >
      <Form layout="vertical" className="mt-4">
        <Form.Item label="搜索新店长">
          <Input
            prefix={<SearchOutlined className="text-[var(--mb-text-muted)]" />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setSelected(null); }}
            placeholder="搜索用户名" allowClear
          />
          {searchQuery.isFetching && <Spin size="small" className="mt-2 block" />}
          {searchQuery.data && searchQuery.data.length > 0 && !selected && (
            <div className="dashboard-user-search-results">
              {searchQuery.data.map((u) => (
                <div key={u.id}
                  className="dashboard-user-search-row"
                  onClick={() => { setSelected(u); setKeyword(u.username); }}
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
          {selected && (
            <div className="mt-2 flex items-center gap-2 rounded bg-[var(--mb-primary-container)] px-3 py-2 text-sm">
              <Avatar size={20} style={{ background: "var(--mb-primary)", fontSize: 10 }}>
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
    </Drawer>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-store-info-block">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DiffBlock({ label, before, after, wide }: { label: string; before: string; after: string; wide?: boolean }) {
  const changed = before !== after;

  return (
    <div className={`admin-store-diff-block${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      <div>
        <p className={changed ? "is-before" : ""}>{before}</p>
        <p className={changed ? "is-after" : "is-same"}>{changed ? after : "无变更"}</p>
      </div>
    </div>
  );
}

function PhotoStrip({ photos, emptyText }: { photos: StorePhoto[]; emptyText: string }) {
  if (photos.length === 0) {
    return <div className="admin-store-photo-empty">{emptyText}</div>;
  }

  return (
    <div className="admin-store-photo-strip">
      {photos.map((photo) => (
        <div key={photo.id} className="admin-store-photo-thumb">
          <Image alt="门店照片" src={photo.url} width={88} height={88} style={{ objectFit: "cover" }} preview={{ mask: false }} />
          {photo.isCover && <span>封面</span>}
        </div>
      ))}
    </div>
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
    <>
      <div className="management-page admin-store-detail-page">
        <div className="management-page-header admin-store-detail-hero">
          <div>
            <Typography.Title level={2} className="management-page-title">
              门店审核详情
            </Typography.Title>
            <Typography.Text className="management-page-description">
              审核门店提交、冻结异常门店并维护店长
            </Typography.Text>
          </div>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/admin")}>
            返回运营管理
          </Button>
        </div>

        {storeQuery.isLoading && (
          <div className="flex justify-center pt-16"><Spin size="large" /></div>
        )}

        {storeQuery.isError && (
          <Alert
            className="workbench-data-alert"
            type="error"
            showIcon
            message="无法加载门店详情"
            description="请确认当前账号具有运营管理权限，或稍后刷新重试。"
            action={
              <Button size="small" onClick={() => router.push("/admin")}>
                返回运营管理
              </Button>
            }
          />
        )}

        {store && (
          <section className="admin-store-review-grid">
            <div className="admin-store-detail-main">
              <Card className="admin-store-profile-card">
                <div className="admin-store-card-head">
                  <div>
                    <span>当前门店资料</span>
                    <h2>{store.name}</h2>
                    <p>创建于 {new Date(store.createdAt).toLocaleDateString("zh-CN")}</p>
                  </div>
                  {statusCfg && <Tag color={statusCfg.color}>{statusCfg.text}</Tag>}
                </div>

                <div className="admin-store-info-grid">
                  <InfoBlock label="门店地址" value={store.address ?? "未填写"} />
                  <InfoBlock label="门店简介" value={store.description ?? "未填写"} />
                  <div className="admin-store-info-block">
                    <span>店长</span>
                    {store.manager ? (
                      <div className="admin-store-manager-line">
                        <Avatar src={store.manager.avatarUrl ?? undefined} size={28}>
                          {!store.manager.avatarUrl && (store.manager.nickname ?? store.manager.username).charAt(0).toUpperCase()}
                        </Avatar>
                        <strong>{store.manager.nickname ?? store.manager.username}</strong>
                        <em>@{store.manager.username}</em>
                      </div>
                    ) : (
                      <strong>未指派</strong>
                    )}
                  </div>
                </div>

                <Image.PreviewGroup>
                  <div className="admin-store-photo-review">
                    <div className="admin-store-section-title">
                      <PictureOutlined />
                      <span>当前照片</span>
                    </div>
                    <PhotoStrip photos={store.photos} emptyText="当前门店暂无照片" />
                  </div>
                </Image.PreviewGroup>
              </Card>

              <Card className="admin-store-review-diff">
                <div className="admin-store-card-head">
                  <div>
                    <span>待审核提交</span>
                    <h2>{store.pendingSubmission ? store.pendingSubmission.name : "暂无待审核内容"}</h2>
                    <p>
                      {store.pendingSubmission
                        ? `由 ${store.pendingSubmission.submittedBy.nickname ?? store.pendingSubmission.submittedBy.username} 提交于 ${new Date(store.pendingSubmission.createdAt).toLocaleString("zh-CN")}`
                        : "门店没有正在等待审核的信息变更"}
                    </p>
                  </div>
                </div>

                {store.pendingSubmission ? (
                  <>
                    <div className="admin-store-section-title">
                      <FileSearchOutlined />
                      <span>字段对比</span>
                    </div>
                    <div className="admin-store-diff-grid">
                      <DiffBlock label="门店名称" before={store.name} after={store.pendingSubmission.name} />
                      <DiffBlock label="门店地址" before={store.address ?? "未填写"} after={store.pendingSubmission.address ?? "未填写"} />
                      <DiffBlock label="经营简介" before={store.description ?? "未填写"} after={store.pendingSubmission.description ?? "未填写"} wide />
                    </div>

                    <div className="admin-store-section-title">
                      <PictureOutlined />
                      <span>照片变更</span>
                    </div>
                    <Image.PreviewGroup>
                      <div className="admin-store-photo-compare">
                        <div>
                          <b>当前照片</b>
                          <PhotoStrip photos={store.photos} emptyText="当前无照片" />
                        </div>
                        <div>
                          <b>提交照片</b>
                          <PhotoStrip photos={store.pendingSubmission.photos} emptyText="本次未提交照片" />
                        </div>
                      </div>
                    </Image.PreviewGroup>
                  </>
                ) : (
                  <div className="admin-store-empty-review">
                    <SafetyCertificateOutlined />
                    <strong>无需审核</strong>
                    <span>新的门店资料提交后，字段对比和照片变更会在这里展示。</span>
                  </div>
                )}
              </Card>
            </div>

            <aside className="admin-store-actions-rail">
              <Card className="admin-store-action-card">
                <div className="admin-store-section-title">
                  <AuditOutlined />
                  <span>审核操作</span>
                </div>
                <div className="admin-store-action-stack">
                  {store.pendingSubmission ? (
                    <>
                      <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        loading={approveMutation.isPending}
                        onClick={() => approveMutation.mutate()}
                      >
                        通过本次提交
                      </Button>
                      <Button danger icon={<CloseOutlined />} onClick={() => setRejectOpen(true)}>
                        驳回并填写原因
                      </Button>
                    </>
                  ) : (
                    <Button disabled>暂无待审核提交</Button>
                  )}
                  {store.status === "FROZEN" ? (
                    <Button icon={<UnlockOutlined />} loading={unfreezeMutation.isPending} onClick={() => unfreezeMutation.mutate()}>
                      解冻门店
                    </Button>
                  ) : store.status !== "DRAFTED" ? (
                    <Button danger icon={<LockOutlined />} loading={freezeMutation.isPending} onClick={() => freezeMutation.mutate()}>
                      冻结门店
                    </Button>
                  ) : null}
                  <Button icon={<UserSwitchOutlined />} onClick={() => setChangeManagerOpen(true)}>
                    变更店长
                  </Button>
                </div>
              </Card>

              <Card className="admin-store-risk-card">
                <div className="admin-store-section-title">
                  <SafetyCertificateOutlined />
                  <span>操作风险提示</span>
                </div>
                <ul>
                  <li>通过审核后，新资料会影响客户侧公开门店展示。</li>
                  <li>冻结门店会停止该门店公开访问和运营入口。</li>
                  <li>变更店长前请确认新店长账号已完成实名和权限配置。</li>
                </ul>
              </Card>
            </aside>
          </section>
        )}
      </div>

      <RejectDrawer
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={(note) => rejectMutation.mutate(note)}
        loading={rejectMutation.isPending}
      />

      <ChangeManagerDrawer
        open={changeManagerOpen}
        onClose={() => setChangeManagerOpen(false)}
        onConfirm={(userId) => changeManagerMutation.mutate(userId)}
        loading={changeManagerMutation.isPending}
      />
    </>
  );
}
