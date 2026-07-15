"use client";

import { App, Button, List, Select, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";
import { useState } from "react";
import { financeApi, type FinanceApplicationType, type FinanceAttachment, type FinanceAttachmentCategory } from "../api";

export function FinanceAttachmentUpload({ applicationType, applicationId, initialAttachments = [], readOnly = false }: { applicationType: FinanceApplicationType; applicationId: string; initialAttachments?: FinanceAttachment[]; readOnly?: boolean }) {
  const { message } = App.useApp();
  const [category, setCategory] = useState<FinanceAttachmentCategory>("INVOICE");
  const [attachments, setAttachments] = useState(initialAttachments);
  const [uploading, setUploading] = useState(false);
  async function upload(file: UploadFile) {
    if (!file.originFileObj) return;
    setUploading(true);
    try {
      const result = await financeApi.uploadAttachment(applicationType, applicationId, category, file.originFileObj);
      setAttachments((current) => [...current, result]);
      message.success("附件已上传");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "附件上传失败");
    } finally { setUploading(false); }
  }
  return <div className="finance-attachments"><div className="finance-attachment-toolbar"><Select value={category} onChange={setCategory} options={[{ value: "INVOICE", label: "发票" }, { value: "CONTRACT", label: "合同" }, { value: "PAYMENT_PROOF", label: "付款凭证" }, { value: "OTHER", label: "其他" }]} disabled={readOnly} /><Upload beforeUpload={() => false} showUploadList={false} maxCount={1} onChange={({ file }) => void upload(file)} disabled={readOnly || uploading}><Button icon={<UploadOutlined />} loading={uploading}>上传附件</Button></Upload></div><List size="small" dataSource={attachments} locale={{ emptyText: "暂无附件" }} renderItem={(item) => <List.Item><a href={item.fileUrl ?? item.url} target="_blank" rel="noreferrer">{item.fileName}</a><span>{item.category}</span></List.Item>} /></div>;
}
