"use client";

import { Alert, App, Button, Card, Form, Input, Space, Table, Tag, Typography } from "antd";
import { ReloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { orderApi, type HistoricalVerificationOrder } from "../../../src/features/orders/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { clearLifecycleCommandId, getLifecycleCommandId } from "../../../src/features/construction/api";

type VerificationForm = { summary: string; factRefs: string };

export default function HistoricalVerificationPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [keyword, setKeyword] = useState("");
  const [active, setActive] = useState<HistoricalVerificationOrder>();
  const [form] = Form.useForm<VerificationForm>();
  const query = useQuery({
    queryKey: ["historical-verification", storeId, keyword],
    queryFn: () => orderApi.historicalVerification(storeId!, keyword || undefined),
    enabled: Boolean(storeId)
  });
  const resolveMutation = useMutation({
    mutationFn: (values: VerificationForm) => {
      if (!active || !user || !storeId) throw new Error("核验对象尚未加载");
      return orderApi.resolveHistoricalVerification(active.id, {
        summary: values.summary.trim(),
        factRefs: values.factRefs.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
      }, {
        commandId: getLifecycleCommandId(user.id, storeId, active.id, "RESOLVE_HISTORICAL_VERIFICATION"),
        expectedVersion: active.lifecycleVersion
      });
    },
    onSuccess: async () => {
      if (active && user && storeId) clearLifecycleCommandId(user.id, storeId, active.id, "RESOLVE_HISTORICAL_VERIFICATION");
      message.success("历史核验已关闭，订单权威履约结果已刷新");
      setActive(undefined);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["historical-verification", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const rows = query.data ?? [];
  return <div className="management-page">
    <div className="page-header">
      <div><Typography.Title level={2}>履约历史核验</Typography.Title><Typography.Paragraph type="secondary">处理历史已完成但缺少质检事实的订单。核验只记录结论和事实引用，不直接补造施工或质检事实。</Typography.Paragraph></div>
      <Space><Input.Search placeholder="订单号、客户或车牌" allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={setKeyword} style={{ width: 260 }} /><Button icon={<ReloadOutlined />} onClick={() => query.refetch()}>刷新</Button></Space>
    </div>
    <Alert type="warning" showIcon title="普通履约操作已被核验门禁保护" description="请先查看责任模块的纠正事实，再填写结论与事实引用关闭核验单。" />
    <Card style={{ marginTop: 16 }}>
      <Table rowKey="id" loading={query.isLoading} dataSource={rows} locale={{ emptyText: "暂无待处理历史核验" }} columns={[
        { title: "订单", render: (_: unknown, row: HistoricalVerificationOrder) => <Space direction="vertical" size={0}><strong>{row.orderNo}</strong><Typography.Text type="secondary">{row.customer?.companyName ?? row.customer?.name ?? "客户信息待确认"}</Typography.Text></Space> },
        { title: "车辆", render: (_: unknown, row: HistoricalVerificationOrder) => row.vehicle?.carPlate ?? "车牌待确认" },
        { title: "问题码", render: (_: unknown, row: HistoricalVerificationOrder) => <Space wrap>{(row.verification?.issueCodes ?? ["QUALITY_RESULT_MISSING"]).map((code) => <Tag key={code} color="orange">{code}</Tag>)}</Space> },
        { title: "状态", render: (_: unknown, row: HistoricalVerificationOrder) => <Tag color={row.verified ? "green" : "red"}>{row.verified ? "已核验" : "待核验"}</Tag> },
        { title: "操作", render: (_: unknown, row: HistoricalVerificationOrder) => <Button icon={<SafetyCertificateOutlined />} disabled={row.verified} onClick={() => { setActive(row); form.resetFields(); }}>进入核验</Button> }
      ]} />
    </Card>
    {active ? <Card title={`关闭核验：${active.orderNo}`} style={{ marginTop: 16 }}>
      <Form form={form} layout="vertical" onFinish={(values) => resolveMutation.mutate(values)}>
        <Form.Item name="summary" label="核验结论" rules={[{ required: true, message: "请填写核验结论" }]}><Input.TextArea rows={3} placeholder="说明责任模块已纠正的事实和核验结论" /></Form.Item>
        <Form.Item name="factRefs" label="事实引用" rules={[{ required: true, message: "请填写至少一条事实引用" }]}><Input.TextArea rows={3} placeholder="每行或逗号分隔，例如：施工记录、审计事件、质保记录 ID" /></Form.Item>
        <Space><Button onClick={() => setActive(undefined)}>取消</Button><Button type="primary" htmlType="submit" loading={resolveMutation.isPending}>重新校验并关闭</Button></Space>
      </Form>
    </Card> : null}
  </div>;
}
