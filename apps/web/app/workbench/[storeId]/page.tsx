"use client";

import {
  Alert, App, Avatar, Button, Card, Image,
  Drawer, Form, Input, Popconfirm, Select, Spin, Tag, Tooltip, Typography
} from "antd";
import {
  CalendarOutlined,
  DeleteOutlined,
  DollarOutlined,
  FileProtectOutlined,
  LoadingOutlined,
  PlusOutlined,
  RiseOutlined,
  ScheduleOutlined,
  ShoppingCartOutlined,
  StarFilled,
  StarOutlined,
  TeamOutlined,
  ToolOutlined,
  UserOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DailyCapacitySummary, InventoryBatchSummary, ReportSummary, WarrantySummary } from "@mallbay/shared";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { constructionApi, inventoryApi, memberApi, orderApi, reportsApi, storeApi, warrantiesApi } from "../../../src/lib/api";
import { getWorkbenchSections, type StorePosition } from "../../../src/features/workbench/navigation";
import { useAuthStore } from "../../../src/stores/auth-store";
import { yuanCurrency } from "../../../src/features/orders/order-display";

const POSITION_OPTIONS = [
  { label: "销售", value: "SALES" },
  { label: "采购", value: "PURCHASING" },
  { label: "财务", value: "FINANCE" },
  { label: "排班员", value: "SCHEDULER" },
  { label: "施工员", value: "CONSTRUCTION" },
  { label: "学徒", value: "APPRENTICE" }
];

const POSITION_LABEL: Record<string, string> = {
  MANAGER: "店长", SALES: "销售", PURCHASING: "采购",
  FINANCE: "财务", SCHEDULER: "排班员", CONSTRUCTION: "施工员", APPRENTICE: "学徒"
};

const STATUS_CONFIG: Record<string, { text: string; color: string }> = {
  DRAFTED: { text: "筹办中", color: "default" },
  PENDING_REVIEW: { text: "审核中", color: "processing" },
  PUBLISHED: { text: "公开", color: "success" },
  FROZEN: { text: "已冻结", color: "warning" }
};

type WorkbenchTone = "primary" | "warning" | "info" | "danger" | "success";

type WorkbenchKpi = {
  label: string;
  value: string;
  trend: string;
  tone: WorkbenchTone;
  icon: ReactNode;
};

type CapacityItem = {
  label: string;
  value: string;
  percent: number;
  tone: WorkbenchTone;
  meta: string;
  remaining: number;
};

type ExceptionItem = {
  title: string;
  detail: string;
  tone: WorkbenchTone;
  icon: ReactNode;
};

type TaskRow = {
  type: string;
  ref: string;
  owner: string;
  due: string;
  status: string;
};

function getTodayDateString() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function buildWorkbenchKpis({
  summary,
  pendingDispatchTotal,
  todayCapacity,
  activeWarrantyCount,
  lowStockCount,
  teamSize,
  currentPosition
}: {
  summary?: ReportSummary;
  pendingDispatchTotal: number;
  todayCapacity?: DailyCapacitySummary;
  activeWarrantyCount: number;
  lowStockCount: number;
  teamSize: number;
  currentPosition: string;
}): WorkbenchKpi[] {
  const financeApplicationAmountCents = (summary?.expenseAmountCents ?? 0) + (summary?.reimbursementAmountCents ?? 0);
  return [
    {
      label: "订单总数",
      value: String(summary?.orders ?? 0),
      trend: `已收款 ${yuanCurrency(summary?.paidAmountCents ?? 0)}`,
      tone: "primary",
      icon: <ShoppingCartOutlined />
    },
    {
      label: "待派单",
      value: String(pendingDispatchTotal),
      trend: pendingDispatchTotal > 0 ? "待处理" : "已清空",
      tone: "warning",
      icon: <ScheduleOutlined />
    },
    {
      label: "今日施工容量",
      value: formatTotalCapacity(todayCapacity),
      trend: `剩余 ${getRemainingCapacity(todayCapacity)}`,
      tone: "info",
      icon: <CalendarOutlined />
    },
    {
      label: "生效质保",
      value: String(activeWarrantyCount),
      trend: "质保档案",
      tone: "primary",
      icon: <FileProtectOutlined />
    },
    {
      label: "库存预警",
      value: String(lowStockCount),
      trend: lowStockCount > 0 ? "低于安全线" : "库存正常",
      tone: lowStockCount > 0 ? "danger" : "success",
      icon: <WarningOutlined />
    },
    {
      label: "财务申请额",
      value: yuanCurrency(financeApplicationAmountCents),
      trend: "费用与报销",
      tone: "info",
      icon: <DollarOutlined />
    },
    {
      label: "收款率",
      value: formatPercent(summary?.paidAmountCents ?? 0, summary?.totalAmountCents ?? 0),
      trend: "按订单总额",
      tone: "success",
      icon: <RiseOutlined />
    },
    {
      label: "团队成员",
      value: String(teamSize),
      trend: `${POSITION_LABEL[currentPosition] ?? currentPosition}视图`,
      tone: "primary",
      icon: <TeamOutlined />
    }
  ];
}

function buildCapacityItems(todayCapacity?: DailyCapacitySummary): CapacityItem[] {
  return [
    buildCapacityItem("店内施工", todayCapacity?.inStoreReserved, todayCapacity?.inStoreCapacity, "primary", "隐形车衣"),
    buildCapacityItem("外出施工", todayCapacity?.outsideReserved, todayCapacity?.outsideCapacity, "info", "上门服务"),
    buildCapacityItem("玻璃膜施工", todayCapacity?.heatFilmReserved, todayCapacity?.heatFilmCapacity, "danger", "隔热膜"),
    buildCapacityItem("复检", todayCapacity?.inspectionReserved, todayCapacity?.inspectionCapacity, "success", "售后复检")
  ];
}

function buildExceptionItems({
  lowStockCount,
  pendingDispatchTotal,
  afterSalesCount
}: {
  lowStockCount: number;
  pendingDispatchTotal: number;
  afterSalesCount: number;
}): ExceptionItem[] {
  const items: ExceptionItem[] = [];
  if (lowStockCount > 0) {
    items.push({ title: "库存不足", detail: `${lowStockCount} 个批次低于安全线，请及时补货。`, tone: "danger", icon: <WarningOutlined /> });
  }
  if (pendingDispatchTotal > 0) {
    items.push({ title: "待派单", detail: `${pendingDispatchTotal} 个订单等待施工排班。`, tone: "warning", icon: <ScheduleOutlined /> });
  }
  if (afterSalesCount > 0) {
    items.push({ title: "售后跟进", detail: `${afterSalesCount} 个售后单需要持续跟进。`, tone: "info", icon: <ToolOutlined /> });
  }
  return items;
}

function buildTaskRows({
  pendingDispatchTotal,
  financeApplicationAmountCents,
  afterSalesCount,
  currentPosition
}: {
  pendingDispatchTotal: number;
  financeApplicationAmountCents: number;
  afterSalesCount: number;
  currentPosition: string;
}): TaskRow[] {
  const rows: TaskRow[] = [];
  if (pendingDispatchTotal > 0) {
    rows.push({ type: "施工派单", ref: `${pendingDispatchTotal} 个待派单订单`, owner: POSITION_LABEL[currentPosition] ?? "主管", due: "尽快处理", status: "待处理" });
  }
  if (afterSalesCount > 0) {
    rows.push({ type: "售后跟进", ref: `${afterSalesCount} 个售后单`, owner: "客服/施工主管", due: "持续跟进", status: "处理中" });
  }
  if (financeApplicationAmountCents > 0) {
    rows.push({ type: "费用审批", ref: yuanCurrency(financeApplicationAmountCents), owner: "财务", due: "按审批流处理", status: "待处理" });
  }
  return rows;
}

function buildWorkbenchTrendBars(summary?: ReportSummary) {
  const rows = (summary?.salesTrend ?? []).slice(-7);
  const maxOrders = rows.reduce((max, row) => Math.max(max, row.orders), 0);
  if (rows.length === 0 || maxOrders <= 0) return [];
  return rows.map((row) => [row.month, Math.max(12, Math.round((row.orders / maxOrders) * 100))] as const);
}

function buildCapacityItem(label: string, reserved = 0, capacity = 0, tone: WorkbenchTone, meta: string): CapacityItem {
  const remaining = Math.max(capacity - reserved, 0);
  return {
    label,
    value: `${reserved}/${capacity}`,
    percent: capacity > 0 ? Math.min(100, Math.round((reserved / capacity) * 100)) : 0,
    tone,
    meta: capacity > 0 ? meta : "暂无维护",
    remaining
  };
}

function formatTotalCapacity(capacity?: DailyCapacitySummary) {
  if (!capacity) return "0/0";
  const reserved = capacity.inStoreReserved + capacity.outsideReserved + capacity.heatFilmReserved + capacity.inspectionReserved;
  const total = capacity.inStoreCapacity + capacity.outsideCapacity + capacity.heatFilmCapacity + capacity.inspectionCapacity;
  return `${reserved}/${total}`;
}

function getRemainingCapacity(capacity?: DailyCapacitySummary) {
  if (!capacity) return 0;
  const reserved = capacity.inStoreReserved + capacity.outsideReserved + capacity.heatFilmReserved + capacity.inspectionReserved;
  const total = capacity.inStoreCapacity + capacity.outsideCapacity + capacity.heatFilmCapacity + capacity.inspectionCapacity;
  return Math.max(total - reserved, 0);
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return "0.0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function countLowStockBatches(batches: InventoryBatchSummary[]) {
  return batches.filter((batch) => batch.totalQuantity <= 0 || batch.availableQuantity / batch.totalQuantity <= 0.1).length;
}

function countActiveWarranties(warranties: WarrantySummary[]) {
  return warranties.filter((warranty) => warranty.status === "ACTIVE").length;
}

function canViewWorkbenchReports(position?: string) {
  return position === "MANAGER" || position === "SALES" || position === "FINANCE";
}

function canViewWorkbenchInventory(position?: string) {
  return position === "MANAGER" || position === "PURCHASING" || position === "CUSTOMER_SERVICE";
}

function canViewWorkbenchWarranties(position?: string) {
  return Boolean(position);
}

// ─── 邀请成员抽屉 ───────────────────────────────────────────────
function InviteDrawer({ storeId, open, onClose, onDone }: {
  storeId: string; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<{ id: string; username: string; nickname: string | null } | null>(null);
  const [position, setPosition] = useState("SALES");

  const searchQuery = useQuery({
    queryKey: ["invitable", storeId, keyword],
    queryFn: () => memberApi.searchInvitable(storeId, keyword),
    enabled: keyword.trim().length > 0,
    staleTime: 0
  });

  const inviteMutation = useMutation({
    mutationFn: () => {
      if (!selected?.id) throw new Error("请先选择邀请成员");
      return memberApi.invite(storeId, selected.id, position);
    },
    onSuccess: () => {
      message.success(`已发出邀请`);
      setKeyword(""); setSelected(null); setPosition("SALES");
      onDone(); onClose();
    },
    onError: (e: Error) => message.error(e.message)
  });

  const handleClose = () => { setKeyword(""); setSelected(null); setPosition("SALES"); onClose(); };

  return (
    <Drawer
      open={open}
      title="邀请成员"
      onClose={handleClose}
      rootClassName="workbench-invite-drawer"
      className="workbench-invite-panel"
      footer={(
        <div className="workbench-drawer-footer">
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            disabled={!selected}
            loading={inviteMutation.isPending}
            onClick={() => inviteMutation.mutate()}
          >
            发出邀请
          </Button>
        </div>
      )}
      destroyOnHidden>
      <Form layout="vertical" className="mt-4">
        <Form.Item label="搜索用户" required>
          <Input
            prefix={<UserOutlined className="text-[var(--mb-text-muted)]" />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setSelected(null); }}
            placeholder="输入用户名搜索" allowClear
          />
          {searchQuery.isFetching && <Spin size="small" className="mt-2 block" />}
          {searchQuery.isError && (
            <p className="mt-1 text-xs text-red-500">{(searchQuery.error as Error)?.message}</p>
          )}
          {searchQuery.data && searchQuery.data.length === 0 && !searchQuery.isFetching && !selected && (
            <p className="mt-1 text-xs text-[var(--mb-text-muted)]">未找到匹配用户</p>
          )}
          {searchQuery.data && searchQuery.data.length > 0 && !selected && (
            <div className="dashboard-user-search-results">
              {searchQuery.data.map((u) => (
                <div key={u.id}
                  className="dashboard-user-search-row"
                  onClick={() => { setSelected(u); setKeyword(u.username); }}>
                  <Avatar size={24} style={{ background: "var(--mb-primary)", fontSize: 12 }}>
                    {(u.nickname ?? u.username).charAt(0).toUpperCase()}
                  </Avatar>
                  <span className="font-mono text-sm">{u.username}</span>
                  {u.nickname && <span className="text-[var(--mb-text-muted)] text-sm">{u.nickname}</span>}
                </div>
              ))}
            </div>
          )}
          {selected && (
            <div className="mt-2 flex items-center gap-2 rounded bg-[var(--mb-primary-container)] px-3 py-2 text-sm">
              <Avatar size={20} style={{ background: "var(--mb-primary)", fontSize: 10 }}>
                {(selected.nickname ?? selected.username).charAt(0).toUpperCase()}
              </Avatar>
              <span>已选：<span className="font-mono">{selected.username}</span></span>
              <Button type="link" size="small" danger onClick={() => { setSelected(null); setKeyword(""); }}>重选</Button>
            </div>
          )}
        </Form.Item>
        <Form.Item label="岗位" required>
          <Select value={position} onChange={setPosition} options={POSITION_OPTIONS} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

// ─── 照片上传 Grid ────────────────────────────────────────────────
type PhotoItem = { uid: string; url: string; isCover: boolean };

function PhotoGrid({ storeId, photos, onChange }: {
  storeId: string;
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
}) {
  const { message } = App.useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) { message.error("图片不超过 5 MB"); return; }
    setUploading(true);
    try {
      const result = await storeApi.uploadPhoto(storeId, file);
      onChange([...photos, {
        uid: `${Date.now()}`,
        url: result.url,
        isCover: photos.length === 0
      }]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const setCover = (uid: string) =>
    onChange(photos.map((p) => ({ ...p, isCover: p.uid === uid })));

  const remove = (uid: string) => {
    const next = photos.filter((p) => p.uid !== uid);
    if (next.length > 0 && !next.some((p) => p.isCover)) next[0].isCover = true;
    onChange(next);
  };

  const BOX = { width: 96, height: 96 } as const;

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <div key={p.uid} className="group relative" style={BOX}>
          <Image
            src={p.url}
            alt=""
            preview={false}
            width={BOX.width}
            height={BOX.height}
            style={{
              objectFit: "cover",
              borderRadius: 8,
              border: p.isCover ? "2px solid var(--mb-primary)" : "2px solid #e2e8f0"
            }}
          />
          {/* 封面角标 */}
          {p.isCover && (
            <span className="absolute bottom-1 left-1 rounded px-1 text-white"
              style={{ fontSize: 10, background: "var(--mb-primary)", lineHeight: "16px" }}>封面</span>
          )}
          {/* hover 操作层 */}
          <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg
            bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
            <Tooltip title={p.isCover ? "当前封面" : "设为封面"}>
              <button
                type="button"
                onClick={() => setCover(p.uid)}
                className="workbench-photo-action-button"
              >
                {p.isCover
                  ? <StarFilled style={{ color: "var(--mb-primary)", fontSize: 14 }} />
                  : <StarOutlined style={{ color: "var(--mb-text-secondary)", fontSize: 14 }} />}
              </button>
            </Tooltip>
            <Tooltip title="删除">
              <button
                type="button"
                onClick={() => remove(p.uid)}
                className="workbench-photo-action-button workbench-photo-action-danger"
              >
                <DeleteOutlined style={{ color: "var(--mb-danger)", fontSize: 14 }} />
              </button>
            </Tooltip>
          </div>
        </div>
      ))}

      {/* 上传中占位 */}
      {uploading && (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-[var(--mb-border)] bg-[var(--mb-surface-container-low)]"
          style={BOX}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 20 }} spin />} />
        </div>
      )}

      {/* + 按钮 */}
      {photos.length + (uploading ? 1 : 0) < 5 && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-lg border border-dashed
              border-[var(--mb-border)] bg-[var(--mb-surface-container-low)] text-[var(--mb-text-muted)] transition-colors hover:border-[var(--mb-primary-fixed-dim)] hover:text-[var(--mb-primary)]"
            style={BOX}
          >
            <PlusOutlined style={{ fontSize: 18 }} />
            <span style={{ fontSize: 11, marginTop: 4 }}>添加照片</span>
          </button>
          <input
            ref={inputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}

// ─── 提交/编辑抽屉 ──────────────────────────────────────────────
function SubmitDrawer({ storeId, initialData, open, onClose, onDone }: {
  storeId: string;
  initialData: { name: string; address: string | null; description: string | null; photos: { url: string; isCover: boolean; order: number }[] };
  open: boolean; onClose: () => void; onDone: () => void;
}) {
  const { message } = App.useApp();
  const [name, setName] = useState(initialData.name);
  const [address, setAddress] = useState(initialData.address ?? "");
  const [description, setDescription] = useState(initialData.description ?? "");
  const [photos, setPhotos] = useState<PhotoItem[]>(
    initialData.photos.map((p, i) => ({ uid: `init-${i}`, url: p.url, isCover: p.isCover }))
  );

  const submitMutation = useMutation({
    mutationFn: () => {
      if (photos.length === 0) throw new Error("请至少上传一张照片");
      return storeApi.submitStore(storeId, {
        name: name.trim(),
        address: address.trim(),
        description: description.trim(),
        photos: photos.map((p, i) => ({ url: p.url, isCover: p.isCover, order: i }))
      });
    },
    onSuccess: () => { message.success("已提交审核"); onDone(); onClose(); },
    onError: (e: Error) => message.error(e.message)
  });

  const canSubmit = name.trim() && address.trim() && photos.length > 0;

  return (
    <Drawer
      open={open}
      title="编辑并提交审核"
      onClose={onClose}
      rootClassName="workbench-submit-drawer"
      className="workbench-submit-panel"
      footer={(
        <div className="workbench-drawer-footer">
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            disabled={!canSubmit}
            loading={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            提交审核
          </Button>
        </div>
      )}
      destroyOnHidden>
      <Form layout="vertical" className="mt-4">
        <Form.Item label="门店名称" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} showCount />
        </Form.Item>
        <Form.Item label="地址" required>
          <Input value={address} onChange={(e) => setAddress(e.target.value)}
            maxLength={100} showCount placeholder="填写详细地址" />
        </Form.Item>
        <Form.Item label="简介">
          <Input.TextArea value={description} onChange={(e) => setDescription(e.target.value)}
            maxLength={300} showCount rows={3} placeholder="简短介绍门店" />
        </Form.Item>
        <Form.Item label="门店照片" required
          extra="最多 5 张 · 最大 5 MB · 悬停图片可设封面或删除">
          <PhotoGrid storeId={storeId} photos={photos} onChange={setPhotos} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────
export default function WorkbenchPage() {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const router = useRouter();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const storeQuery = useQuery({
    queryKey: ["workbench-store", storeId],
    queryFn: () => storeApi.myStore(storeId),
    staleTime: 5_000
  });

  const fallbackStore = !storeQuery.data && user?.storeMember?.store.id === storeId
    ? {
        id: user.storeMember.store.id,
        name: user.storeMember.store.name,
        status: user.storeMember.store.status,
        address: null,
        description: null,
        photos: [],
        currentMember: { id: user.id, position: user.storeMember.position },
        members: [
          {
            id: user.id,
            position: user.storeMember.position,
            user: {
              id: user.id,
              username: user.username,
              nickname: user.nickname,
              avatarUrl: user.avatarUrl
            }
          }
        ]
      }
    : null;
  const store = storeQuery.data ?? fallbackStore;
  const statusCfg = store ? (STATUS_CONFIG[store.status] ?? { text: store.status, color: "default" }) : null;
  const isManager = store?.currentMember.position === "MANAGER";
  const canManageStore = isManager && store.status !== "PENDING_REVIEW" && store.status !== "FROZEN";
  const workbenchSections = store
    ? getWorkbenchSections(store.currentMember.position as StorePosition, store.id)
    : [];
  const todayDate = getTodayDateString();
  const currentPosition = store?.currentMember.position;
  const canLoadReportSummary = canViewWorkbenchReports(currentPosition);
  const canLoadInventoryBatches = canViewWorkbenchInventory(currentPosition);
  const canLoadWarranties = canViewWorkbenchWarranties(currentPosition);
  const summaryQuery = useQuery({
    queryKey: ["workbench-summary", storeId, currentPosition],
    queryFn: () => reportsApi.summary(storeId),
    enabled: Boolean(store) && canLoadReportSummary
  });
  const pendingDispatchQuery = useQuery({
    queryKey: ["workbench-pending-dispatch", storeId],
    queryFn: () => orderApi.list({ storeId, status: "PENDING_DISPATCH", page: 1, pageSize: 1 }),
    enabled: Boolean(store)
  });
  const capacityQuery = useQuery({
    queryKey: ["workbench-capacity", storeId, todayDate],
    queryFn: () => constructionApi.capacities({ storeId, from: todayDate, to: todayDate }),
    enabled: Boolean(store)
  });
  const inventoryBatchesQuery = useQuery({
    queryKey: ["workbench-inventory-batches", storeId, currentPosition],
    queryFn: () => inventoryApi.batches({ storeId }),
    enabled: Boolean(store) && canLoadInventoryBatches
  });
  const warrantiesQuery = useQuery({
    queryKey: ["workbench-warranties", storeId, currentPosition],
    queryFn: () => warrantiesApi.list(storeId),
    enabled: Boolean(store) && canLoadWarranties
  });
  const summary = summaryQuery.data;
  const pendingDispatchTotal = pendingDispatchQuery.data?.total ?? 0;
  const todayCapacity = capacityQuery.data?.[0];
  const lowStockCount = countLowStockBatches((inventoryBatchesQuery.data ?? []) as InventoryBatchSummary[]);
  const activeWarrantyCount = countActiveWarranties((warrantiesQuery.data ?? []) as WarrantySummary[]);
  const financeApplicationAmountCents = (summary?.expenseAmountCents ?? 0) + (summary?.reimbursementAmountCents ?? 0);
  const workbenchKpis = store
    ? buildWorkbenchKpis({
        summary,
        pendingDispatchTotal,
        todayCapacity,
        activeWarrantyCount,
        lowStockCount,
        teamSize: store.members.length,
        currentPosition: store.currentMember.position
      })
    : [];
  const capacityItems = buildCapacityItems(todayCapacity);
  const exceptionItems = buildExceptionItems({
    lowStockCount,
    pendingDispatchTotal,
    afterSalesCount: summary?.afterSales ?? 0
  });
  const taskRows = buildTaskRows({
    pendingDispatchTotal,
    financeApplicationAmountCents,
    afterSalesCount: summary?.afterSales ?? 0,
    currentPosition: store?.currentMember.position ?? ""
  });
  const trendBars = buildWorkbenchTrendBars(summary);

  const removeMutation = useMutation({
    mutationFn: (userId: string) => memberApi.remove(storeId, userId),
    onSuccess: () => { message.success("已移除成员"); queryClient.invalidateQueries({ queryKey: ["workbench-store", storeId] }); },
    onError: (e: Error) => message.error(e.message)
  });

  const invalidateStore = () => queryClient.invalidateQueries({ queryKey: ["workbench-store", storeId] });

  return (
    <>
      <div className="management-page">
        {storeQuery.isLoading && (
          <div className="flex justify-center pt-16"><Spin size="large" /></div>
        )}

        {storeQuery.isError && fallbackStore && (
          <Alert
            className="workbench-data-alert"
            type="warning"
            showIcon
            message="门店详情暂时未完整加载"
            description="已使用当前登录身份展示可用业务入口。请稍后刷新以同步门店资料、照片和完整成员列表。"
          />
        )}

        {storeQuery.isError && !fallbackStore && (
          <section className="workbench-empty-panel workbench-empty-state">
            <Typography.Title level={4}>无法加载门店工作台</Typography.Title>
            <Typography.Text type="secondary">
              当前账号可能不属于该门店，或门店资料暂时无法读取。
            </Typography.Text>
            <Button type="primary" onClick={() => router.push("/")}>
              返回门店大厅
            </Button>
          </section>
        )}

        {store && (
          <>
            <section className="workbench-hero workbench-operations-dashboard">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {statusCfg && <Tag color={statusCfg.color}>{statusCfg.text}</Tag>}
                  <Tag>{POSITION_LABEL[store.currentMember.position] ?? store.currentMember.position}</Tag>
                </div>
                <h1>运营工作台</h1>
                <p>
                  {store.name} · {store.address ?? "未填写门店地址"}。统一查看订单、施工容量、异常提醒和团队任务。
                </p>
              </div>
              <div className="workbench-hero-actions">
                {isManager && store.status !== "PENDING_REVIEW" && store.status !== "FROZEN" ? (
                  <Button type="primary" disabled={!canManageStore} onClick={() => setSubmitOpen(true)}>
                    编辑并提交审核
                  </Button>
                ) : null}
                {isManager ? (
                  <Button icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
                    邀请成员
                  </Button>
                ) : null}
              </div>
            </section>

            <section className="workbench-kpi-grid">
              {workbenchKpis.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className={`workbench-kpi-card workbench-kpi-${item.tone}`}
                  onClick={() => {
                    if (item.label === "待派单") router.push("/construction/assignments");
                    if (item.label === "库存预警") router.push("/inventory");
                    if (item.label === "生效质保") router.push("/warranties");
                    if (item.label === "财务申请额") router.push("/finance");
                    if (item.label === "团队成员") setInviteOpen(true);
                  }}
                >
                  <span className="workbench-kpi-card-icon">{item.icon}</span>
                  <span className="workbench-kpi-card-label">{item.label}</span>
                  <strong>{item.value}</strong>
                  <span className="workbench-kpi-card-trend">{item.trend}</span>
                </button>
              ))}
            </section>

            <section className="workbench-main-grid">
              <Card className="workbench-schedule-card" title="今日施工容量">
                <div className="workbench-capacity-list">
                  {capacityItems.map((item) => (
                    <div key={item.label} className="workbench-capacity-item">
                      <div className="workbench-capacity-meta">
                        <span>{item.label}</span>
                        <strong className={`workbench-tone-${item.tone}`}>{item.value}</strong>
                      </div>
                      <div className="workbench-capacity-track">
                        <i className={`workbench-capacity-bar workbench-bg-${item.tone}`} style={{ width: `${item.percent}%` }} />
                      </div>
                      <div className="workbench-capacity-foot">
                        <span>{item.meta}</span>
                        <span>剩余 {item.remaining}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="workbench-exception-panel" title="异常提醒">
                <div className="workbench-exception-list">
                  {exceptionItems.length > 0 ? (
                    exceptionItems.map((item) => (
                      <button
                        key={item.title}
                        type="button"
                        className={`workbench-exception-item workbench-exception-${item.tone}`}
                        onClick={() => {
                          if (item.title === "库存不足") router.push("/inventory");
                          if (item.title === "待派单") router.push("/construction/assignments");
                          if (item.title === "售后跟进") router.push("/after-sales");
                        }}
                      >
                        <span>{item.icon}</span>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="workbench-panel-empty">暂无异常提醒</div>
                  )}
                </div>
              </Card>
            </section>

            <section className="workbench-bottom-grid">
              <Card className="workbench-task-board" title="待处理任务">
                <div className="workbench-task-table">
                  <div className="workbench-task-row workbench-task-head">
                    <span>任务类型</span>
                    <span>关联事项</span>
                    <span>负责人</span>
                    <span>截止时间</span>
                    <span>状态</span>
                  </div>
                  {taskRows.length > 0 ? (
                    taskRows.map((task) => (
                      <button
                        key={`${task.type}-${task.ref}`}
                        type="button"
                        className="workbench-task-row"
                        onClick={() => {
                          if (task.type === "施工派单") router.push("/construction/assignments");
                          if (task.type === "售后跟进") router.push("/after-sales");
                          if (task.type === "费用审批") router.push("/finance");
                        }}
                      >
                        <span>{task.type}</span>
                        <span>{task.ref}</span>
                        <span>{task.owner}</span>
                        <span>{task.due}</span>
                        <Tag color={task.status === "待处理" ? "warning" : "processing"}>{task.status}</Tag>
                      </button>
                    ))
                  ) : (
                    <div className="workbench-task-empty">暂无待处理任务</div>
                  )}
                </div>

                <div className="workbench-quick-section">
                  <div className="workbench-panel-heading">
                    <strong>业务快捷入口</strong>
                    <span>{POSITION_LABEL[store.currentMember.position] ?? store.currentMember.position}可用功能</span>
                  </div>
                  <div className="workbench-entry-grid">
                    {workbenchSections.flatMap((section) =>
                      section.items.map((item) => (
                        <button
                          key={`${section.title}-${item.href}-${item.label}`}
                          type="button"
                          onClick={() => router.push(item.href)}
                          className={`workbench-entry-button${item.primary ? " workbench-entry-button-primary" : ""}`}
                        >
                          <span className="workbench-entry-label">{item.label}</span>
                          <span className="workbench-entry-text">{item.description}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </Card>

              <div className="workbench-side-stack">
                <Card className="workbench-trend-card" title="销售与施工趋势">
                  {trendBars.length > 0 ? (
                    <div className="workbench-trend-bars">
                      {trendBars.map(([label, height]) => (
                        <div key={label} className="workbench-trend-bar-item">
                          <span style={{ height: `${height}%` }} />
                          <small>{label}</small>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="workbench-panel-empty">暂无趋势数据</div>
                  )}
                  <div className="workbench-trend-legend">
                    <span><i />订单量</span>
                    <span><i />施工量</span>
                  </div>
                </Card>

                <Card
                  className="workbench-team-card"
                  title={(
                    <span>
                      团队成员
                      <small>{store.members.length} 人</small>
                    </span>
                  )}
                  extra={isManager ? (
                    <Button size="small" icon={<PlusOutlined />} onClick={() => setInviteOpen(true)}>
                      邀请成员
                    </Button>
                  ) : null}
                >
                  <div className="workbench-member-list">
                    {store.members.map((m) => (
                      <div key={m.id} className="member-row">
                        <div className="flex items-center gap-3">
                          <Avatar
                            src={m.user.avatarUrl ?? undefined}
                            size={38}
                            style={{ background: "var(--mb-primary)", fontSize: 14, flexShrink: 0 }}
                          >
                            {!m.user.avatarUrl && (m.user.nickname ?? m.user.username).charAt(0).toUpperCase()}
                          </Avatar>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--mb-text-primary)", lineHeight: 1.4 }}>
                              {m.user.nickname ?? m.user.username}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--mb-text-muted)", fontFamily: "monospace", marginTop: 1 }}>
                              @{m.user.username}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Tag color={m.position === "MANAGER" ? "blue" : "default"} style={{ margin: 0 }}>
                            {POSITION_LABEL[m.position] ?? m.position}
                          </Tag>
                          {isManager && m.position !== "MANAGER" && (
                            <Popconfirm
                              title="确认移除"
                              description={`确定将「${m.user.nickname ?? m.user.username}」移出团队吗？`}
                              okText="移除"
                              cancelText="取消"
                              okButtonProps={{ danger: true, loading: removeMutation.isPending }}
                              onConfirm={() => removeMutation.mutate(m.user.id)}
                            >
                              <Button
                                size="small" danger type="text"
                                icon={<DeleteOutlined />}
                                loading={removeMutation.isPending}
                              />
                            </Popconfirm>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </section>
          </>
        )}
        </div>

      {isManager && (
        <InviteDrawer
          storeId={storeId}
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          onDone={invalidateStore}
        />
      )}

      {store && isManager && submitOpen && (
        <SubmitDrawer
          storeId={storeId}
          initialData={store}
          open={submitOpen}
          onClose={() => setSubmitOpen(false)}
          onDone={invalidateStore}
        />
      )}
    </>
  );
}
