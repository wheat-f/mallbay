"use client";

import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Space, Typography } from "antd";
import { useRouter } from "next/navigation";
import { SettingsCapabilityGuard } from "../../../src/features/settings/capability-guard";
import { SettingsVersionEditor } from "../../../src/features/settings/settings-version-editor";

export default function CustomerTagSettingsPage() {
  const router = useRouter();
  return (
    <SettingsCapabilityGuard capabilityCodes={["customer.tags"]}>
      <div className="management-page settings-workspace">
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/settings")}>返回职责工作台</Button>
          <div>
            <Typography.Title level={2}>客户标签规则</Typography.Title>
            <Typography.Paragraph type="secondary">总部配置高价值和 VIP 客户的累计已完成订单实收金额阈值，变更发布后即时影响系统标签计算。</Typography.Paragraph>
          </div>
          <SettingsVersionEditor
            capabilityCode="customer.tags"
            domain="HQ"
            scopeId="global"
            title="价值等级阈值"
            description="金额以整数分保存。VIP 阈值必须严格高于高价值阈值。"
            fields={[
              { key: "highValueThresholdCents", label: "高价值阈值（分）", type: "number", min: 0 },
              { key: "vipThresholdCents", label: "VIP 阈值（分）", type: "number", min: 1 }
            ]}
            initial={{ highValueThresholdCents: 500000, vipThresholdCents: 1000000 }}
          />
        </Space>
      </div>
    </SettingsCapabilityGuard>
  );
}