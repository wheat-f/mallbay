"use client";

import type { AuthUser } from "@mallbay/shared";
import {
  App,
  Avatar,
  Button,
  Form,
  Input,
  Layout,
  Modal,
  Segmented,
  Tooltip,
  Typography,
  Upload
} from "antd";
import type { UploadFile } from "antd";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { userApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type IdentityMode = "STAFF" | "CUSTOMER";

const IDENTITY_KEY = "mallbay-identity";

// ─── 昵称编辑 Modal ───────────────────────────────────────────────
function NicknameModal({
  open,
  current,
  onClose,
  onSave
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const [val, setVal] = useState(current);
  useEffect(() => setVal(current), [current]);

  return (
    <Modal
      open={open}
      title="修改昵称"
      onCancel={onClose}
      onOk={() => onSave(val)}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        maxLength={30}
        showCount
        placeholder="最多 30 个字符"
        className="mt-4"
      />
    </Modal>
  );
}

// ─── 密码修改 Modal ───────────────────────────────────────────────
function PasswordModal({
  open,
  onClose,
  onSave
}: {
  open: boolean;
  onClose: () => void;
  onSave: (oldPwd: string, newPwd: string) => void;
}) {
  const { control, handleSubmit, reset } = useForm({
    defaultValues: { oldPassword: "", newPassword: "", confirmPassword: "" }
  });

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <Modal
      open={open}
      title="修改密码"
      onCancel={onClose}
      footer={null}
      destroyOnClose
    >
      <Form
        layout="vertical"
        className="mt-4"
        onFinish={handleSubmit((v) => {
          if (v.newPassword !== v.confirmPassword) return;
          onSave(v.oldPassword, v.newPassword);
        })}
      >
        <Controller
          name="oldPassword"
          control={control}
          rules={{ required: "请输入旧密码" }}
          render={({ field, fieldState }) => (
            <Form.Item
              label="旧密码"
              validateStatus={fieldState.error ? "error" : undefined}
              help={fieldState.error?.message}
            >
              <Input.Password {...field} placeholder="请输入当前密码" />
            </Form.Item>
          )}
        />
        <Controller
          name="newPassword"
          control={control}
          rules={{ required: "请输入新密码", minLength: { value: 8, message: "至少 8 位" } }}
          render={({ field, fieldState }) => (
            <Form.Item
              label="新密码"
              validateStatus={fieldState.error ? "error" : undefined}
              help={fieldState.error?.message}
            >
              <Input.Password {...field} placeholder="至少 8 位" />
            </Form.Item>
          )}
        />
        <Controller
          name="confirmPassword"
          control={control}
          rules={{
            required: "请再次输入新密码",
            validate: (v, all) => v === all.newPassword || "两次密码不一致"
          }}
          render={({ field, fieldState }) => (
            <Form.Item
              label="确认新密码"
              validateStatus={fieldState.error ? "error" : undefined}
              help={fieldState.error?.message}
            >
              <Input.Password {...field} placeholder="再次输入新密码" />
            </Form.Item>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" htmlType="submit">保存</Button>
        </div>
      </Form>
    </Modal>
  );
}

// ─── 绑定 Modal（邮箱 / 手机）────────────────────────────────────
function BindModal({
  open,
  title,
  placeholder,
  onClose,
  onSave
}: {
  open: boolean;
  title: string;
  placeholder: string;
  onClose: () => void;
  onSave: (v: string) => void;
}) {
  const [val, setVal] = useState("");
  useEffect(() => { if (!open) setVal(""); }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      onOk={() => onSave(val)}
      okText="绑定"
      cancelText="取消"
      destroyOnClose
    >
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={placeholder}
        className="mt-4"
      />
    </Modal>
  );
}

// ─── 信息行 ──────────────────────────────────────────────────────
function InfoRow({
  label,
  value,
  action,
  onAction
}: {
  label: string;
  value: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="profile-info-row">
      <div className="profile-info-label">{label}</div>
      <div className="profile-info-value">{value}</div>
      {action && (
        <Button type="link" size="small" onClick={onAction} className="profile-info-action">
          {action}
        </Button>
      )}
    </div>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────────
export default function ProfilePage() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const router = useRouter();
  const { message } = App.useApp();

  // 身份模式：从 localStorage 读取，默认 STAFF
  const [identity, setIdentity] = useState<IdentityMode>("STAFF");
  useEffect(() => {
    const saved = localStorage.getItem(IDENTITY_KEY) as IdentityMode | null;
    if (saved === "CUSTOMER" || saved === "STAFF") setIdentity(saved);
  }, []);
  const handleIdentityChange = (v: IdentityMode) => {
    setIdentity(v);
    localStorage.setItem(IDENTITY_KEY, v);
  };

  // Modal 状态
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 路由保护（也处理旧格式 session）
  useEffect(() => {
    if (hasHydrated && (!user || !user.username)) router.push("/auth");
  }, [hasHydrated, router, user]);

  const updateUser = useCallback(
    (updated: AuthUser) => {
      const store = useAuthStore.getState();
      setSession({
        user: updated,
        accessToken: store.accessToken!,
        refreshToken: store.refreshToken!
      });
    },
    [setSession]
  );

  // 更新昵称
  const nicknameMutation = useMutation({
    mutationFn: (nickname: string) => userApi.updateProfile({ nickname }),
    onSuccess: (updated) => { updateUser(updated); setNicknameOpen(false); message.success("昵称已更新"); },
    onError: (e) => message.error(e.message)
  });

  // 上传头像
  const avatarMutation = useMutation({
    mutationFn: (file: File) => userApi.uploadAvatar(file),
    onSuccess: (updated) => { updateUser(updated); message.success("头像已更新"); },
    onError: (e) => message.error(e.message)
  });

  // 修改密码
  const passwordMutation = useMutation({
    mutationFn: ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) =>
      userApi.changePassword({ oldPassword, newPassword }),
    onSuccess: () => { setPasswordOpen(false); message.success("密码已修改"); },
    onError: (e) => message.error(e.message)
  });

  // 绑定邮箱
  const emailMutation = useMutation({
    mutationFn: (email: string) => userApi.bindEmail({ email }),
    onSuccess: (updated) => { updateUser(updated); setEmailOpen(false); message.success("邮箱绑定成功"); },
    onError: (e) => message.error(e.message)
  });

  // 绑定手机
  const phoneMutation = useMutation({
    mutationFn: (phone: string) => userApi.bindPhone({ phone }),
    onSuccess: (updated) => { updateUser(updated); setPhoneOpen(false); message.success("手机号绑定成功"); },
    onError: (e) => message.error(e.message)
  });

  if (!hasHydrated || !user || !user.username) return null;

  const displayName = user.nickname ?? user.username;
  const avatarLabel = displayName.charAt(0).toUpperCase();

  return (
    <Layout className="profile-shell">
      {/* Header */}
      <header className="dashboard-header">
        <button className="profile-back-btn" onClick={() => router.back()}>
          ← 返回
        </button>
        <Typography.Title level={5} className="!mb-0 !text-slate-800">
          个人设置
        </Typography.Title>
        <div style={{ width: 56 }} />
      </header>

      <Layout.Content className="profile-content">
        {/* 身份切换 */}
        <div className="profile-identity-bar">
          <span className="profile-identity-label">当前身份</span>
          <Segmented<IdentityMode>
            value={identity}
            onChange={handleIdentityChange}
            options={[
              { label: "员工", value: "STAFF" },
              { label: "客户", value: "CUSTOMER" }
            ]}
          />
          <span className="profile-identity-hint">
            {identity === "STAFF"
              ? "员工视角：进入对应岗位工作台"
              : "客户视角：查看门店、下单、追踪消费"}
          </span>
        </div>

        {/* 头像区域 */}
        <div className="profile-avatar-section">
          <div className="profile-avatar-wrap">
            {user.avatarUrl ? (
              <Avatar src={user.avatarUrl} size={80} />
            ) : (
              <Avatar size={80} style={{ background: "#1677ff", fontSize: 32 }}>
                {avatarLabel}
              </Avatar>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (file.size > 2 * 1024 * 1024) {
                    message.error("图片不能超过 2 MB");
                    return;
                  }
                  avatarMutation.mutate(file);
                }
                e.target.value = "";
              }}
            />
            <Button
              size="small"
              loading={avatarMutation.isPending}
              className="profile-avatar-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              更换头像
            </Button>
          </div>
          <div className="profile-avatar-tip">图片最大 2 MB，支持 JPG / PNG / WebP</div>
        </div>

        {/* 个人信息卡片 */}
        <div className="profile-card">
          <div className="profile-card-title">基本信息</div>

          <InfoRow label="账号" value={<span className="font-mono">{user.username}</span>} />

          <InfoRow
            label="昵称"
            value={displayName}
            action="修改"
            onAction={() => setNicknameOpen(true)}
          />

          <InfoRow
            label="密码"
            value="••••••••"
            action="修改"
            onAction={() => setPasswordOpen(true)}
          />
        </div>

        {/* 绑定账号卡片 */}
        <div className="profile-card">
          <div className="profile-card-title">绑定账号</div>
          <div className="profile-card-subtitle">绑定后可直接使用对应方式登录</div>

          <InfoRow
            label="邮箱"
            value={user.email ?? <span className="text-slate-400">未绑定</span>}
            action={user.email ? "修改" : "绑定"}
            onAction={() => setEmailOpen(true)}
          />

          <InfoRow
            label="手机号"
            value={user.phone ?? <span className="text-slate-400">未绑定</span>}
            action={user.phone ? "修改" : "绑定"}
            onAction={() => setPhoneOpen(true)}
          />

          <InfoRow
            label="微信"
            value={user.wechatOpenId ? <span className="text-green-600">已绑定</span> : <span className="text-slate-400">未绑定</span>}
            action="绑定"
            onAction={() => message.info("微信绑定功能即将开放")}
          />

          <InfoRow
            label="支付宝"
            value={user.alipayUserId ? <span className="text-blue-600">已绑定</span> : <span className="text-slate-400">未绑定</span>}
            action="绑定"
            onAction={() => message.info("支付宝绑定功能即将开放")}
          />
        </div>
      </Layout.Content>

      {/* Modals */}
      <NicknameModal
        open={nicknameOpen}
        current={displayName}
        onClose={() => setNicknameOpen(false)}
        onSave={(v) => nicknameMutation.mutate(v)}
      />
      <PasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onSave={(oldPwd, newPwd) => passwordMutation.mutate({ oldPassword: oldPwd, newPassword: newPwd })}
      />
      <BindModal
        open={emailOpen}
        title={user.email ? "修改邮箱" : "绑定邮箱"}
        placeholder="请输入邮箱地址"
        onClose={() => setEmailOpen(false)}
        onSave={(v) => emailMutation.mutate(v)}
      />
      <BindModal
        open={phoneOpen}
        title={user.phone ? "修改手机号" : "绑定手机号"}
        placeholder="请输入手机号"
        onClose={() => setPhoneOpen(false)}
        onSave={(v) => phoneMutation.mutate(v)}
      />
    </Layout>
  );
}
