"use client";
import { Button, Result } from "antd"; import { useRouter } from "next/navigation";
export default function SettingsForbiddenPage() { const router = useRouter(); return <Result status="403" title="当前角色无权访问" subTitle="请返回系统设置首页查看你负责的配置。" extra={<Button type="primary" onClick={() => router.push("/settings")}>返回设置首页</Button>} />; }