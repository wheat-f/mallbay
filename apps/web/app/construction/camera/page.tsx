"use client";

import { Button, Tag, Typography } from "antd";
import {
  CameraOutlined,
  CheckCircleOutlined,
  CloudSyncOutlined,
  FileImageOutlined,
  RightOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { ConstructionMobileShell } from "../../../src/features/construction/mobile-shell";

const photoStages = [
  {
    title: "验车照片",
    tag: "施工前",
    description: "车身外观、漆面瑕疵、里程表和交车确认。",
    icon: <SafetyCertificateOutlined />
  },
  {
    title: "膜箱照片",
    tag: "批次",
    description: "膜卷外箱、批次号、产品型号和质保标识。",
    icon: <FileImageOutlined />
  },
  {
    title: "施工过程照片",
    tag: "施工中",
    description: "裁膜、定位、包边和关键工序留痕。",
    icon: <CameraOutlined />
  },
  {
    title: "施工后照片",
    tag: "完工",
    description: "整车效果、细节边角、交付验收和质检依据。",
    icon: <CheckCircleOutlined />
  }
];

export default function ConstructionCameraPage() {
  const router = useRouter();

  return (
    <ConstructionMobileShell title="拍照入口" subtitle="按施工 SOP 快速进入任务拍照" active="camera">
      <div className="construction-camera-workspace">
        <section className="construction-camera-hero">
          <Tag>今日拍照</Tag>
          <Typography.Title level={2}>先选任务，再按阶段上传照片</Typography.Title>
          <p>照片会绑定施工记录、订单和上传人；网络不稳定时可先进入离线队列处理。</p>
          <Button type="primary" icon={<CameraOutlined />} onClick={() => router.push("/construction/tasks")}>
            打开我的任务
          </Button>
        </section>

        <section className="construction-camera-stage-grid" aria-label="拍照阶段">
          {photoStages.map((stage) => (
            <button key={stage.title} type="button" onClick={() => router.push("/construction/tasks")}>
              <span className="construction-camera-stage-icon">{stage.icon}</span>
              <span>
                <Tag>{stage.tag}</Tag>
                <strong>{stage.title}</strong>
                <em>{stage.description}</em>
              </span>
              <RightOutlined />
            </button>
          ))}
        </section>

        <section className="construction-camera-queue-card">
          <div>
            <CloudSyncOutlined />
            <span>
              <strong>离线队列</strong>
              <em>查看待同步、失败和已完成的照片上传任务。</em>
            </span>
          </div>
          <Button icon={<CloudSyncOutlined />} onClick={() => router.push("/construction/offline")}>
            查看队列
          </Button>
        </section>
      </div>
    </ConstructionMobileShell>
  );
}
