"use client";

import type { LoginPayload, RegisterPayload } from "@mallbay/shared";
import { Button, Card, Form, Input, Segmented, Typography, App } from "antd";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { authApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type Mode = "login" | "register";
type AuthFormValues = RegisterPayload;

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("login");
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const router = useRouter();
  const { message } = App.useApp();
  const { control, handleSubmit, reset } = useForm<AuthFormValues>({
    defaultValues: {
      email: "",
      password: "",
      name: ""
    }
  });

  const authMutation = useMutation({
    mutationFn: (values: AuthFormValues) => {
      if (mode === "login") {
        const payload: LoginPayload = {
          email: values.email,
          password: values.password
        };
        return authApi.login(payload);
      }

      return authApi.register(values);
    },
    onSuccess: (session) => {
      setSession(session);
      message.success(mode === "login" ? "登录成功" : "注册成功");
      router.push("/dashboard");
    },
    onError: (error) => {
      message.error(error.message);
    }
  });

  const onModeChange = (value: Mode) => {
    setMode(value);
    reset();
  };

  useEffect(() => {
    if (hasHydrated && user) {
      router.push("/dashboard");
    }
  }, [hasHydrated, router, user]);

  if (!hasHydrated || user) {
    return null;
  }

  return (
    <main className="auth-shell">
      <section className="auth-grid">
        <div className="auth-intro">
          <div className="auth-intro-inner">
            <div className="auth-kicker">
              <span className="auth-kicker-dot" />
              个人账号体系
            </div>
            <Typography.Title className="auth-title">
              MallBay 门店运营台
            </Typography.Title>
            <Typography.Paragraph className="auth-subtitle">
              一个账号可以在不同门店拥有不同身份。你可以作为客户消费，也可以被店长邀请成为工作人员，后续再管理门店、员工、会员和订单。
            </Typography.Paragraph>

            <div className="auth-feature-grid">
              {[
                ["账号独立", "注册不绑定门店"],
                ["身份灵活", "客户 / 工作人员"],
                ["门店协作", "邀请与移除员工"]
              ].map(([title, text]) => (
                <div key={title} className="auth-feature-card">
                  <div className="auth-feature-title">{title}</div>
                  <div className="auth-feature-text">{text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <Card
          className="auth-card"
          styles={{ body: { padding: 0 } }}
        >
          <div className="auth-card-head">
            <div className="auth-card-head-row">
              <div>
                <Typography.Title level={3} className="!mb-1 !text-2xl">
                  {mode === "login" ? "登录" : "创建账号"}
                </Typography.Title>
                <Typography.Text type="secondary">使用个人账号继续</Typography.Text>
              </div>
            <Segmented
              value={mode}
              onChange={(value) => onModeChange(value as Mode)}
              block
              className="auth-segmented"
              options={[
                { label: "登录", value: "login" },
                { label: "注册", value: "register" }
              ]}
            />
            </div>
          </div>

          <Form
            className="auth-form"
            layout="vertical"
            onFinish={handleSubmit((values) => authMutation.mutate(values))}
          >
            {mode === "register" ? (
              <>
                <Controller
                  name="name"
                  control={control}
                  rules={{ required: "请输入姓名", minLength: { value: 2, message: "至少 2 个字符" } }}
                  render={({ field, fieldState }) => (
                    <Form.Item
                      validateStatus={fieldState.error ? "error" : undefined}
                      help={fieldState.error?.message}
                    >
                      <div className="auth-field-label">姓名</div>
                      <Input {...field} size="large" placeholder="张三" autoComplete="name" />
                    </Form.Item>
                  )}
                />
              </>
            ) : null}

            <Controller
              name="email"
              control={control}
              rules={{
                required: "请输入邮箱",
                pattern: { value: /^\S+@\S+\.\S+$/, message: "邮箱格式不正确" }
              }}
              render={({ field, fieldState }) => (
                <Form.Item
                  validateStatus={fieldState.error ? "error" : undefined}
                  help={fieldState.error?.message}
                >
                  <div className="auth-field-label">邮箱</div>
                  <Input {...field} size="large" placeholder="owner@mallbay.cn" autoComplete="email" />
                </Form.Item>
              )}
            />

            <Controller
              name="password"
              control={control}
              rules={{ required: "请输入密码", minLength: { value: 8, message: "至少 8 个字符" } }}
              render={({ field, fieldState }) => (
                <Form.Item
                  validateStatus={fieldState.error ? "error" : undefined}
                  help={fieldState.error?.message}
                >
                  <div className="auth-field-label">密码</div>
                  <Input.Password {...field} size="large" placeholder="至少 8 位" autoComplete="current-password" />
                </Form.Item>
              )}
            />

            <Button type="primary" htmlType="submit" size="large" block loading={authMutation.isPending}>
              {mode === "login" ? "登录" : "注册并登录"}
            </Button>
          </Form>
        </Card>
      </section>
    </main>
  );
}
