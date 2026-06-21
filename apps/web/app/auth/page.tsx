"use client";

import type { LoginPayload, RegisterPayload } from "@mallbay/shared";
import { Button, Checkbox, Form, Input, Segmented, Typography, App } from "antd";
import {
  InfoCircleOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  UserOutlined
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isCredentialEncryptionEnabled } from "../../src/features/auth/credential-encryption-config";
import { authApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type Mode = "login" | "register";

type LoginFormValues = LoginPayload;
type RegisterFormValues = RegisterPayload;
type AuthFormValues = LoginFormValues & RegisterFormValues;

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const router = useRouter();
  const { message } = App.useApp();
  const [form] = Form.useForm<AuthFormValues>();
  const credentialEncryptionEnabled = isCredentialEncryptionEnabled();

  const authMutation = useMutation({
    mutationFn: (values: AuthFormValues) => {
      if (mode === "login") {
        return credentialEncryptionEnabled
          ? authApi.loginEncrypted({ identifier: values.identifier, password: values.password })
          : authApi.login({ identifier: values.identifier, password: values.password });
      }
      return credentialEncryptionEnabled
        ? authApi.registerEncrypted({ username: values.username, password: values.password })
        : authApi.register({ username: values.username, password: values.password });
    },
    onSuccess: (session) => {
      setSession(session);
      message.success(mode === "login" ? "登录成功" : "注册成功");
      router.push("/");
    },
    onError: (error) => {
      message.error(error.message);
    }
  });

  const onModeChange = (value: Mode) => {
    setMode(value);
    form.resetFields();
  };

  useEffect(() => {
    if (hasHydrated && user) {
      router.push("/");
    }
  }, [hasHydrated, router, user]);

  if (!hasHydrated || user) {
    return null;
  }

  return (
    <main className="auth-shell auth-prototype-shell">
      <section className="auth-hero-panel" aria-label="mallbay 平台介绍">
        <div className="auth-hero-media" aria-hidden="true" />
        <div className="auth-hero-overlay" aria-hidden="true" />
        <div className="auth-hero-content">
          <div className="auth-brand-mark">
            <span className="auth-brand-icon"><ToolOutlined /></span>
            <span>mallbay</span>
          </div>
          <Typography.Title className="auth-hero-title">
            隐形车衣施工与门店数字化管理平台
          </Typography.Title>
          <Typography.Paragraph className="auth-hero-subtitle">
            统一客户、订单、施工、库存、质保和财务数据，让门店运营从预约到交付都可追踪。
          </Typography.Paragraph>
          <div className="auth-hero-stats">
            <div>
              <strong>1,200+</strong>
              <span>合规门店</span>
            </div>
            <div className="auth-hero-divider" />
            <div>
              <strong>500k+</strong>
              <span>交付车辆</span>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-form-panel" aria-label="账号登录与注册">
        <div className="auth-form-card">
          <div className="auth-mobile-brand">
            <span className="auth-brand-icon"><ToolOutlined /></span>
            <span>mallbay</span>
          </div>

          <Segmented
            value={mode}
            onChange={(value) => onModeChange(value as Mode)}
            block
            className="auth-mode-switch"
            options={[
              { label: "登录", value: "login" },
              { label: "注册", value: "register" }
            ]}
          />

          <div className="auth-form-heading">
            <Typography.Title level={2} className="auth-form-title">
              {mode === "login" ? "欢迎回来" : "即刻加入"}
            </Typography.Title>
            <Typography.Paragraph className="auth-form-subtitle">
              {mode === "login" ? "请输入您的凭据以访问管理后台。" : "创建个人账号，登录后可被邀请加入门店。"}
            </Typography.Paragraph>
          </div>

          <Form
            form={form}
            className="auth-form"
            layout="vertical"
            initialValues={{
              identifier: "",
              username: "",
              password: ""
            }}
            onFinish={(values) => authMutation.mutate(values)}
          >
            {mode === "register" ? (
              <Form.Item<AuthFormValues>
                label="账号"
                name="username"
                rules={[
                  { required: true, message: "请输入账号" },
                  { min: 2, message: "至少 2 个字符" },
                  { max: 30, message: "最多 30 个字符" },
                  {
                    pattern: /^[a-zA-Z0-9_一-龥]+$/,
                    message: "只允许字母、数字、下划线或中文"
                  }
                ]}
              >
                <Input
                  size="large"
                  placeholder="2-30 位，支持字母 / 数字 / 中文"
                  prefix={<UserOutlined />}
                  autoComplete="username"
                />
              </Form.Item>
            ) : (
              <Form.Item<AuthFormValues>
                label="账号"
                name="identifier"
                rules={[{ required: true, message: "请输入账号" }]}
              >
                <Input
                  size="large"
                  placeholder="请输入账号"
                  prefix={<UserOutlined />}
                  autoComplete="username"
                />
              </Form.Item>
            )}

            <Form.Item<AuthFormValues>
              label="密码"
              name="password"
              rules={[
                { required: true, message: "请输入密码" },
                { min: 8, message: "至少 8 个字符" }
              ]}
            >
              <Input.Password
                size="large"
                placeholder="至少 8 位"
                prefix={<LockOutlined />}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </Form.Item>

            {mode === "login" ? (
              <div className="auth-login-options">
                <Checkbox>记住登录状态</Checkbox>
                <a href="mailto:support@mallbay.com?subject=Password%20Reset%20Request">忘记密码？</a>
              </div>
            ) : (
              <div className="auth-register-hint">
                <SafetyCertificateOutlined />
                新账号默认是客户身份，加入门店后由店长分配角色。
              </div>
            )}

            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={authMutation.isPending}
            >
              {mode === "login" ? "进入系统" : "注册并开始使用"}
            </Button>
          </Form>

          <div className="auth-disclaimer">
            <InfoCircleOutlined />
            <p>
              <strong>重要提示：</strong>
              每位新注册的用户最初都将获得“Customer (客户)”权限。如需开启高级施工管理或门店财务功能，请在登录后联系系统管理员。
            </p>
          </div>

          <div className="auth-footer-links">
            <a href="#">隐私政策</a>
            <a href="#">服务条款</a>
            <a href="mailto:support@mallbay.com">联系支持</a>
          </div>
        </div>
      </section>
    </main>
  );
}
