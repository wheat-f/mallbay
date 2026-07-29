"use client";
import { Alert, Button, Result, Spin } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { settingsApi } from "./api";

type Props = { capabilityCodes: string[]; children: ReactNode };

export function SettingsCapabilityGuard({ capabilityCodes, children }: Props) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "allowed" | "forbidden" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    settingsApi.capabilities().then((capabilities) => {
      if (!cancelled) setState(capabilities.some((capability) => capabilityCodes.includes(capability.code)) ? "allowed" : "forbidden");
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [capabilityCodes.join("|")]);
  if (state === "loading") return <div className="management-page"><Spin tip="正在校验设置权限…" /></div>;
  if (state === "error") return <div className="management-page"><Alert type="error" showIcon message="设置权限校验失败" /><Button onClick={() => router.push("/settings")}>返回设置首页</Button></div>;
  if (state === "forbidden") return <Result status="403" title="当前角色无权访问" subTitle="请返回系统设置首页查看你负责的配置。" extra={<Button type="primary" onClick={() => router.push("/settings")}>返回设置首页</Button>} />;
  return <>{children}</>;
}