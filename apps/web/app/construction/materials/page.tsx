"use client";

import { Button, Tag } from "antd";
import {
  BarcodeOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  ToolOutlined
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { ConstructionMobileShell } from "../../../src/features/construction/mobile-shell";

const materialSummary = [
  { label: "待领物料", value: "3", tone: "primary" },
  { label: "待核验批次", value: "2", tone: "warning" },
  { label: "已存证照片", value: "5", tone: "success" }
];

const materialBatches = [
  {
    batchNo: "B-XU-230915-008",
    product: "XPEL Ultimate Plus",
    spec: "1.52m x 15m / 透明膜",
    quantity: "1 卷",
    status: "待扫码",
    location: "A库-PPF-02"
  },
  {
    batchNo: "B-LM-240118-021",
    product: "龙膜 G2 前挡玻璃膜",
    spec: "1.52m x 30m / 隔热膜",
    quantity: "8 米",
    status: "已核验",
    location: "车间临时架"
  }
];

const consumables = ["裁膜刀片", "刮板毛毡", "安装液", "无尘布"];

export default function ConstructionMaterialsPage() {
  const router = useRouter();

  return (
    <ConstructionMobileShell
      title="物料管理"
      subtitle="领料、批次追溯与施工耗材核验"
      active="materials"
      variant="calendar"
      badgeCount={2}
      desktopHref="/inventory"
    >
      <div className="construction-materials-workspace">
        <section className="construction-materials-summary" aria-label="物料状态概览">
          {materialSummary.map((item) => (
            <article key={item.label} className={`construction-materials-stat is-${item.tone}`}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </section>

        <section className="construction-materials-card construction-materials-hero-card">
          <div>
            <Tag color="processing">今日订单</Tag>
            <h2>MB20260614008</h2>
            <p>宝马 5 系漆面保护膜施工，开工前请完成膜箱照片、膜桶照片和批次扫码核验。</p>
          </div>
          <Button type="primary" icon={<QrcodeOutlined />}>
            扫码核验
          </Button>
        </section>

        <section className="construction-materials-card">
          <div className="construction-mobile-section-head">
            <div>
              <h2>批次追溯</h2>
              <p>核对订单物料、批次号和现场位置，施工后可追溯到质保与售后。</p>
            </div>
            <SafetyCertificateOutlined />
          </div>

          <div className="construction-materials-batch-list">
            {materialBatches.map((item) => (
              <article key={item.batchNo} className="construction-materials-batch">
                <div className="construction-materials-batch-main">
                  <BarcodeOutlined />
                  <div>
                    <strong>{item.batchNo}</strong>
                    <span>{item.product}</span>
                    <em>{item.spec}</em>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>数量</dt>
                    <dd>{item.quantity}</dd>
                  </div>
                  <div>
                    <dt>位置</dt>
                    <dd>{item.location}</dd>
                  </div>
                </dl>
                <Tag color={item.status === "已核验" ? "success" : "warning"}>{item.status}</Tag>
              </article>
            ))}
          </div>
        </section>

        <section className="construction-materials-card">
          <div className="construction-mobile-section-head">
            <div>
              <h2>施工耗材</h2>
              <p>开工前确认耗材齐备，异常损耗记录后同步库存流水。</p>
            </div>
            <ToolOutlined />
          </div>
          <div className="construction-materials-consumables">
            {consumables.map((item) => (
              <span key={item}>
                <CheckCircleOutlined />
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="construction-materials-actions">
          <Button type="primary" icon={<CameraOutlined />} onClick={() => router.push("/construction/camera")}>
            施工照片上传
          </Button>
          <Button icon={<InboxOutlined />}>领取物料</Button>
          <Button icon={<ClockCircleOutlined />}>记录损耗</Button>
        </section>
      </div>
    </ConstructionMobileShell>
  );
}
