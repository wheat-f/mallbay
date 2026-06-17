"use client";

import type { AuthUser } from "@mallbay/shared";
import {
  App,
  Avatar,
  Button,
  Card,
  Drawer,
  Form,
  Input,
  Spin,
  Tag,
  Typography
} from "antd";
import { LoadingOutlined, PlusOutlined, SafetyCertificateOutlined, UserOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { userApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type ProfileDrawerState =
  | { kind: "nickname"; current: string }
  | { kind: "password" }
  | { kind: "email"; current: string }
  | { kind: "phone"; current: string };

type TextEditFormProps = {
  actionText: string;
  current: string;
  inputType?: string;
  label: string;
  maxLength?: number;
  onClose: () => void;
  onSave: (value: string) => void;
  placeholder: string;
};

function TextEditForm({
  actionText,
  current,
  inputType,
  label,
  maxLength,
  onClose,
  onSave,
  placeholder
}: TextEditFormProps) {
  const { control, handleSubmit } = useForm({
    defaultValues: { value: current }
  });

  return (
    <Form
      layout="vertical"
      className="profile-edit-form"
      onFinish={handleSubmit(({ value }) => onSave(value.trim()))}
    >
      <Controller
        name="value"
        control={control}
        rules={{ required: `请输入${label}` }}
        render={({ field, fieldState }) => (
          <Form.Item
            label={label}
            validateStatus={fieldState.error ? "error" : undefined}
            help={fieldState.error?.message}
          >
            <Input
              {...field}
              type={inputType}
              maxLength={maxLength}
              showCount={Boolean(maxLength)}
              placeholder={placeholder}
            />
          </Form.Item>
        )}
      />
      <div className="profile-edit-footer">
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" htmlType="submit">{actionText}</Button>
      </div>
    </Form>
  );
}

function PasswordEditForm({
  onClose,
  onSave
}: {
  onClose: () => void;
  onSave: (oldPwd: string, newPwd: string) => void;
}) {
  const { control, handleSubmit } = useForm({
    defaultValues: { oldPassword: "", newPassword: "", confirmPassword: "" }
  });

  return (
    <Form
      layout="vertical"
      className="profile-edit-form"
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
      <div className="profile-edit-footer">
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" htmlType="submit">保存</Button>
      </div>
    </Form>
  );
}

function ProfileEditDrawer({
  state,
  onClose,
  onSaveNickname,
  onSavePassword,
  onSaveEmail,
  onSavePhone
}: {
  state: ProfileDrawerState | null;
  onClose: () => void;
  onSaveNickname: (v: string) => void;
  onSavePassword: (oldPwd: string, newPwd: string) => void;
  onSaveEmail: (v: string) => void;
  onSavePhone: (v: string) => void;
}) {
  const titleMap = {
    nickname: "修改昵称",
    password: "修改密码",
    email: state?.kind === "email" && state.current ? "修改邮箱" : "绑定邮箱",
    phone: state?.kind === "phone" && state.current ? "修改手机号" : "绑定手机号"
  };
  const title = state ? titleMap[state.kind] : "";

  return (
    <Drawer
      open={Boolean(state)}
      title={title}
      onClose={onClose}
      destroyOnHidden
      rootClassName="profile-edit-drawer"
      className="profile-edit-panel"
    >
      {state?.kind === "nickname" ? (
        <TextEditForm
          key={`nickname-${state.current}`}
          actionText="保存"
          current={state.current}
          label="昵称"
          maxLength={30}
          onClose={onClose}
          onSave={onSaveNickname}
          placeholder="最多 30 个字符"
        />
      ) : null}
      {state?.kind === "password" ? (
        <PasswordEditForm
          key="password"
          onClose={onClose}
          onSave={onSavePassword}
        />
      ) : null}
      {state?.kind === "email" ? (
        <TextEditForm
          key={`email-${state.current}`}
          actionText={state.current ? "保存" : "绑定"}
          current={state.current}
          inputType="email"
          label="邮箱"
          onClose={onClose}
          onSave={onSaveEmail}
          placeholder="请输入邮箱地址"
        />
      ) : null}
      {state?.kind === "phone" ? (
        <TextEditForm
          key={`phone-${state.current}`}
          actionText={state.current ? "保存" : "绑定"}
          current={state.current}
          label="手机号"
          onClose={onClose}
          onSave={onSavePhone}
          placeholder="请输入手机号"
        />
      ) : null}
    </Drawer>
  );
}

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

  const [drawerState, setDrawerState] = useState<ProfileDrawerState | null>(null);

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
    onSuccess: (updated) => { updateUser(updated); setDrawerState(null); message.success("昵称已更新"); },
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
    onSuccess: () => { setDrawerState(null); message.success("密码已修改"); },
    onError: (e) => message.error(e.message)
  });

  // 绑定邮箱
  const emailMutation = useMutation({
    mutationFn: (email: string) => userApi.bindEmail({ email }),
    onSuccess: (updated) => { updateUser(updated); setDrawerState(null); message.success("邮箱绑定成功"); },
    onError: (e) => message.error(e.message)
  });

  // 绑定手机
  const phoneMutation = useMutation({
    mutationFn: (phone: string) => userApi.bindPhone({ phone }),
    onSuccess: (updated) => { updateUser(updated); setDrawerState(null); message.success("手机号绑定成功"); },
    onError: (e) => message.error(e.message)
  });

  if (!hasHydrated || !user || !user.username) return null;

  const displayName = user.nickname ?? user.username;
  const avatarLabel = displayName.charAt(0).toUpperCase();

  const boundAccountCount = [user.email, user.phone, user.wechatOpenId, user.alipayUserId].filter(Boolean).length;

  return (
    <div className="management-page profile-security-workspace">
      <section className="profile-security-hero">
        <div>
          <div className="profile-security-kicker">个人中心</div>
          <Typography.Title level={2} className="management-page-title">
            账号安全
          </Typography.Title>
          <Typography.Text className="management-page-description">
            统一维护后台展示资料、登录密码、头像和第三方账号绑定。
          </Typography.Text>
        </div>
        <div className="profile-security-status">
          <Tag color="success">登录凭据已保护</Tag>
          <span>{boundAccountCount} 项账号绑定</span>
        </div>
      </section>

      <section className="profile-security-summary">
        <div className="profile-security-summary-user">
          <Avatar size={58} src={user.avatarUrl}>
            {avatarLabel}
          </Avatar>
          <div>
            <Typography.Title level={3}>{displayName}</Typography.Title>
            <Typography.Text>{user.username}</Typography.Text>
          </div>
        </div>
        <div className="profile-security-summary-metrics">
          {[
            ["绑定账号", `${boundAccountCount}/4`, "邮箱、手机号、微信、支付宝"],
            ["登录保护", "已启用", "凭据加密传输"],
            ["资料完整度", boundAccountCount >= 2 ? "较完整" : "待补充", "建议补齐邮箱和手机号"]
          ].map(([label, value, description]) => (
            <div key={label} className="profile-security-metric">
              <span>{label}</span>
              <strong>{value}</strong>
              <em>{description}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="profile-security-grid">
        <div className="profile-security-main">
          <Card className="profile-security-status-card profile-identity-card" title="基本信息" extra={<UserOutlined />}>
            <InfoRow label="账号" value={<span className="font-mono">{user.username}</span>} />

            <InfoRow
              label="昵称"
              value={displayName}
              action="修改"
              onAction={() => setDrawerState({ kind: "nickname", current: displayName })}
            />

            <InfoRow
              label="密码"
              value="••••••••"
              action="修改"
              onAction={() => setDrawerState({ kind: "password" })}
            />
          </Card>

          <Card className="profile-security-status-card profile-binding-panel" title="绑定账号" extra={<SafetyCertificateOutlined />}>
            <Typography.Paragraph type="secondary">
              绑定后可使用对应方式登录，并用于重要账号操作通知。
            </Typography.Paragraph>

            <InfoRow
              label="邮箱"
              value={user.email ?? <Tag>未绑定</Tag>}
              action={user.email ? "修改" : "绑定"}
              onAction={() => setDrawerState({ kind: "email", current: user.email ?? "" })}
            />

            <InfoRow
              label="手机号"
              value={user.phone ?? <Tag>未绑定</Tag>}
              action={user.phone ? "修改" : "绑定"}
              onAction={() => setDrawerState({ kind: "phone", current: user.phone ?? "" })}
            />

            <InfoRow
              label="微信"
              value={user.wechatOpenId ? <Tag color="success">已绑定</Tag> : <Tag>未绑定</Tag>}
              action="绑定"
              onAction={() => message.info("微信绑定请联系门店管理员处理")}
            />

            <InfoRow
              label="支付宝"
              value={user.alipayUserId ? <Tag color="processing">已绑定</Tag> : <Tag>未绑定</Tag>}
              action="绑定"
              onAction={() => message.info("支付宝绑定请联系门店管理员处理")}
            />
          </Card>
        </div>

        <aside className="profile-security-side">
          <Card className="profile-security-status-card profile-avatar-panel" title="头像">
            <div className="profile-avatar-section">
              <div className="profile-avatar-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
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
                <button
                  className="profile-avatar-upload"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarMutation.isPending}
                >
                  {avatarMutation.isPending ? (
                    <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                  ) : user.avatarUrl ? (
                    <>
                      <Avatar size={96} src={user.avatarUrl} alt="avatar" className="profile-avatar-image" />
                      <div className="avatar-hover-mask">
                        <PlusOutlined style={{ color: "#fff", fontSize: 16 }} />
                        <span style={{ color: "#fff", fontSize: 11, marginTop: 2 }}>更换</span>
                      </div>
                    </>
                  ) : (
                    <div className="profile-avatar-placeholder">
                      <Avatar size={72}>{avatarLabel}</Avatar>
                      <span>上传头像</span>
                    </div>
                  )}
                </button>
              </div>
              <div className="profile-avatar-tip">点击上传 · 最大 2 MB · JPG / PNG / WebP</div>
            </div>
          </Card>

          <Card className="profile-security-status-card profile-action-list" title="快捷操作">
            <Button block onClick={() => setDrawerState({ kind: "nickname", current: displayName })}>
              修改展示昵称
            </Button>
            <Button block onClick={() => setDrawerState({ kind: "password" })}>
              修改登录密码
            </Button>
            <Button block onClick={() => setDrawerState({ kind: "email", current: user.email ?? "" })}>
              {user.email ? "更新邮箱" : "绑定邮箱"}
            </Button>
          </Card>

          <Card className="profile-security-status-card profile-account-timeline" title="账户动态">
            <div className="profile-timeline-item">
              <span />
              <div>
                <strong>登录凭据保护</strong>
                <em>密码全程加密保护</em>
              </div>
            </div>
            <div className="profile-timeline-item">
              <span />
              <div>
                <strong>绑定账号维护</strong>
                <em>邮箱和手机号可用于重要通知</em>
              </div>
            </div>
            <div className="profile-timeline-item">
              <span />
              <div>
                <strong>头像资料</strong>
                <em>用于门店后台身份识别</em>
              </div>
            </div>
          </Card>
        </aside>
      </section>

      <ProfileEditDrawer
        state={drawerState}
        onClose={() => setDrawerState(null)}
        onSaveNickname={(v) => nicknameMutation.mutate(v)}
        onSavePassword={(oldPwd, newPwd) => passwordMutation.mutate({ oldPassword: oldPwd, newPassword: newPwd })}
        onSaveEmail={(v) => emailMutation.mutate(v)}
        onSavePhone={(v) => phoneMutation.mutate(v)}
      />
    </div>
  );
}
