"use client";

import type { DailyCapacitySummary } from "@mallbay/shared";
import { App, Button, Card, DatePicker, Form, InputNumber, Space, Typography } from "antd";
import { ArrowLeftOutlined, DownloadOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import {
  buildCapacityPayload,
  toCapacityDatePickerValue,
  type CapacityFormValues
} from "../../../src/features/construction/capacity-form";
import { exportRowsToExcel } from "../../../src/lib/export-excel";

export default function ConstructionCapacitiesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [form] = Form.useForm<CapacityFormValues>();
  const [returnTo, setReturnTo] = useState<string>();
  const [visibleMonth, setVisibleMonth] = useState(() => dayjs().startOf("month"));

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const dateFromQuery = searchParams.get("date");
    const safeReturnTo = getSafeReturnTo(searchParams.get("returnTo"));
    queueMicrotask(() => {
      setReturnTo(safeReturnTo);
      if (!dateFromQuery) return;
      const date = toCapacityDatePickerValue(dateFromQuery);
      form.setFieldValue("date", date);
      setVisibleMonth(dayjs(dateFromQuery).startOf("month"));
    });
  }, [form]);

  const capacitiesQuery = useQuery({
    queryKey: ["construction-capacities", storeId],
    queryFn: () => constructionApi.capacities({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const capacityRows = useMemo(() => capacitiesQuery.data ?? [], [capacitiesQuery.data]);
  const hasTodayCapacity = capacityRows.some((row) => formatDate(row.date) === dayjs().format("YYYY-MM-DD"));
  const calendarCells = useMemo(() => buildCapacityCalendar(visibleMonth, capacityRows), [capacityRows, visibleMonth]);

  const saveMutation = useMutation({
    mutationFn: (values: CapacityFormValues) => {
      if (!storeId) throw new Error("当前账号未加入门店");
      return constructionApi.upsertCapacity(buildCapacityPayload(storeId, values));
    },
    onSuccess: async () => {
      message.success("施工容量已保存");
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["construction-capacities", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const exportCapacityReport = async () => {
    const visibleRows = capacityRows.filter((row) => dayjs(row.date).isSame(visibleMonth, "month"));
    if (visibleRows.length === 0) {
      message.warning(`${visibleMonth.format("YYYY年MM月")}暂无可导出的产能设置`);
      return;
    }
    try {
      await exportRowsToExcel(
        `construction-capacity-${visibleMonth.format("YYYY-MM")}.xlsx`,
        "施工产能",
        visibleRows.map((row) => ({
          "日期": formatDate(row.date),
          "店内容量": row.inStoreCapacity,
          "店内已预约": row.inStoreReserved,
          "店内剩余": row.inStoreCapacity - row.inStoreReserved,
          "店内使用率": safeCapacityRate(row.inStoreReserved, row.inStoreCapacity),
          "外出容量": row.outsideCapacity,
          "外出已预约": row.outsideReserved,
          "外出剩余": row.outsideCapacity - row.outsideReserved,
          "外出使用率": safeCapacityRate(row.outsideReserved, row.outsideCapacity),
          "玻璃膜容量": row.heatFilmCapacity,
          "玻璃膜已预约": row.heatFilmReserved,
          "玻璃膜剩余": row.heatFilmCapacity - row.heatFilmReserved,
          "玻璃膜使用率": safeCapacityRate(row.heatFilmReserved, row.heatFilmCapacity),
          "复检容量": row.inspectionCapacity,
          "复检已预约": row.inspectionReserved,
          "复检剩余": row.inspectionCapacity - row.inspectionReserved,
          "复检使用率": safeCapacityRate(row.inspectionReserved, row.inspectionCapacity)
        })),
        { title: `${visibleMonth.format("YYYY年MM月")}施工产能报表`, subtitle: "容量、预约、剩余和使用率" }
      );
      message.success("施工产能报表已导出");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "施工产能报表导出失败");
    }
  };

  return (
    <div className="management-page">
      <div className="capacity-shell">
        <Card className="capacity-calendar-card">
          <div className="capacity-calendar-head">
            <div className="capacity-board-title">
              <Typography.Title level={3}>施工产能设置</Typography.Title>
              <p>点击日历日期进行单日微调，右侧面板维护店内、店外、玻璃膜和复检容量。</p>
            </div>
            <div className="capacity-calendar-actions">
              {returnTo ? (
                <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(returnTo)}>
                  返回订单
                </Button>
              ) : null}
              <Button icon={<DownloadOutlined />} onClick={() => void exportCapacityReport()}>导出报表</Button>
              <Button onClick={() => setVisibleMonth((current) => current.subtract(1, "month"))}>上月</Button>
              <Typography.Title level={4} className="!mb-0">
                {visibleMonth.format("YYYY年 MM月")}
              </Typography.Title>
              <Button onClick={() => setVisibleMonth((current) => current.add(1, "month"))}>下月</Button>
              <Button onClick={() => setVisibleMonth(dayjs().startOf("month"))}>今天</Button>
            </div>
            <div className="capacity-legend">
              <span><i className="capacity-dot-success" />充足</span>
              <span><i className="capacity-dot-warning" />紧张</span>
              <span><i className="capacity-dot-danger" />约满/超量</span>
              <span><i className="capacity-dot-empty" />未设置</span>
            </div>
          </div>
          <div className="capacity-calendar-grid">
            {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((weekday) => (
              <div key={weekday} className="capacity-weekday">{weekday}</div>
            ))}
            {calendarCells.map((cell) => (
              <button
                key={cell.date}
                type="button"
                className={`capacity-day capacity-day-${cell.tone} ${cell.inMonth ? "" : "capacity-day-muted"}`}
                onClick={() => {
                  form.setFieldsValue({
                    date: toCapacityDatePickerValue(cell.date),
                    inStoreCapacity: cell.row?.inStoreCapacity ?? 0,
                    outsideCapacity: cell.row?.outsideCapacity ?? 0,
                    heatFilmCapacity: cell.row?.heatFilmCapacity ?? 0,
                    inspectionCapacity: cell.row?.inspectionCapacity ?? 0
                  });
                }}
              >
                <div className="capacity-day-number">
                  <span>{dayjs(cell.date).date()}</span>
                  <i className="capacity-day-dot" />
                </div>
                <div className="capacity-day-body">
                  {cell.row ? (
                    <>
                      <span>店内施工 <strong>{cell.row.inStoreReserved}/{cell.row.inStoreCapacity}</strong></span>
                      <span>外出施工 <strong>{cell.row.outsideReserved}/{cell.row.outsideCapacity}</strong></span>
                      <span>玻璃膜施工 <strong>{cell.row.heatFilmReserved}/{cell.row.heatFilmCapacity}</strong></span>
                      <span>复检 <strong>{cell.row.inspectionReserved}/{cell.row.inspectionCapacity}</strong></span>
                    </>
                  ) : (
                    <span>未设置容量</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <aside className="capacity-side-panel">
          <Card className="capacity-editor-card" title="批量产能设置">
            <Form
              form={form}
              layout="vertical"
              className="capacity-form-grid"
              onFinish={(values) => saveMutation.mutate(values)}
            >
              <Form.Item label="选择日期" name="date" rules={[{ required: true, message: "请选择日期" }]}>
                <DatePicker
                  allowClear
                  className="w-full"
                  format="YYYY-MM-DD"
                  getPopupContainer={() => document.body}
                  onChange={(date) => {
                    if (date) setVisibleMonth(dayjs(date.format("YYYY-MM-DD")).startOf("month"));
                  }}
                  placeholder="请选择日期"
                  presets={[{ label: "今天", value: dayjs() }]}
                />
              </Form.Item>
              <div className="capacity-number-grid">
                <Form.Item label="店内施工" name="inStoreCapacity" rules={[{ required: true, message: "店内容量" }]}>
                  <CapacityNumberInput placeholder="8" />
                </Form.Item>
                <Form.Item label="外出施工" name="outsideCapacity" rules={[{ required: true, message: "店外容量" }]}>
                  <CapacityNumberInput placeholder="4" />
                </Form.Item>
                <Form.Item label="玻璃膜施工" name="heatFilmCapacity" rules={[{ required: true, message: "玻璃膜容量" }]}>
                  <CapacityNumberInput placeholder="6" />
                </Form.Item>
                <Form.Item label="复检产能" name="inspectionCapacity" rules={[{ required: true, message: "复检容量" }]}>
                  <CapacityNumberInput placeholder="10" />
                </Form.Item>
              </div>
              <div className="capacity-form-actions">
                <Button onClick={() => form.resetFields()}>重置</Button>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveMutation.isPending}>
                  应用设置
                </Button>
              </div>
            </Form>
          </Card>

          <Card className="capacity-tips-card" title="设置技巧">
            <Typography.Paragraph>
              您可以点击左侧日历中的单个日期进行精准微调，也可以在右侧面板维护通用产能。系统会根据剩余容量显示状态颜色。
            </Typography.Paragraph>
            <div className="capacity-tip-status">
              <span className={hasTodayCapacity ? "capacity-tip-ok" : "capacity-tip-warn"}>
                {hasTodayCapacity ? "今日容量已设置" : "今日尚未设置容量"}
              </span>
              <span>已维护 {capacityRows.length} 天</span>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function CapacityNumberInput({ placeholder, value, onChange }: {
  placeholder: string;
  value?: number | null;
  onChange?: (value: number | null) => void;
}) {
  return (
    <Space.Compact className="capacity-number-input">
      <InputNumber className="capacity-number-control" min={0} value={value} onChange={onChange} placeholder={placeholder} />
      <span className="capacity-number-unit">个/天</span>
    </Space.Compact>
  );
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function safeCapacityRate(reserved: number, capacity: number) {
  return capacity > 0 ? reserved / capacity : 0;
}

function getSafeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  return value;
}

function buildCapacityCalendar(month: Dayjs, rows: DailyCapacitySummary[]) {
  const rowMap = new Map(rows.map((row) => [formatDate(row.date), row]));
  const firstDay = month.startOf("month");
  const lastDay = month.endOf("month");
  const startOffset = (firstDay.day() + 6) % 7;
  const start = firstDay.subtract(startOffset, "day");
  const totalCells = Math.ceil((startOffset + lastDay.date()) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const date = start.add(index, "day");
    const dateKey = date.format("YYYY-MM-DD");
    const row = rowMap.get(dateKey);
    const total = row
      ? row.inStoreCapacity + row.outsideCapacity + row.heatFilmCapacity + row.inspectionCapacity
      : 0;
    const reserved = row
      ? row.inStoreReserved + row.outsideReserved + row.heatFilmReserved + row.inspectionReserved
      : 0;
    const remaining = total - reserved;
    let tone: "success" | "warning" | "danger" | "empty" = "empty";
    if (row && remaining <= 0) tone = "danger";
    if (row && remaining > 0 && remaining <= 2) tone = "warning";
    if (row && remaining > 2) tone = "success";

    return {
      date: dateKey,
      inMonth: date.month() === month.month(),
      remaining: Math.max(remaining, 0),
      row,
      tone,
      total
    };
  });
}
