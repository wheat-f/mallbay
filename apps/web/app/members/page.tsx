"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Avatar, Button, Card, Drawer, Empty, Input, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import { CalendarOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, TeamOutlined, UserSwitchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { memberApi } from "../../src/features/members/api";
import { getStorePositionLabel, STORE_POSITION_LABELS } from "../../src/features/members/store-position";
import { storeApi } from "../../src/features/stores/api";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../src/stores/auth-store";

const INVITE_POSITION_OPTIONS = [
  { label: "销售", value: "SALES" },
  { label: "客服", value: "CUSTOMER_SERVICE" },
  { label: "采购", value: "PURCHASING" },
  { label: "财务", value: "FINANCE" },
  { label: "施工主管", value: "SCHEDULER" },
  { label: "施工员", value: "CONSTRUCTION" },
  { label: "学徒", value: "APPRENTICE" }
];

type MemberViewKey = "all" | "craftsman" | "salesService" | "backOffice" | "permission";

const MEMBER_VIEW_TABS: Array<{
  key: MemberViewKey;
  label: string;
  description: string;
  icon: "team" | "worker";
}> = [
  { key: "all", label: "全部成员", description: "门店团队总览", icon: "team" },
  { key: "craftsman", label: "师傅档案", description: "施工主管、师傅与学徒", icon: "worker" },
  { key: "salesService", label: "销售客服", description: "销售与客服协同", icon: "team" },
  { key: "backOffice", label: "后勤岗位", description: "采购与财务支持", icon: "team" },
  { key: "permission", label: "权限视图", description: "岗位权限范围核对", icon: "worker" }
];

const MEMBER_RELATED_WORKSPACES = [
  {
    title: "施工派单",
    description: "为待施工订单安排主贴和协作人员",
    href: "/construction/assignments",
    icon: "team"
  },
  {
    title: "施工容量",
    description: "维护到店、外出、玻璃膜和复检容量",
    href: "/construction/capacities",
    icon: "calendar"
  },
  {
    title: "请假审批",
    description: "处理施工人员请假申请和排班影响",
    href: "/construction/leave-approvals",
    icon: "calendar"
  }
] as const;

const DEFAULT_INVITE_POSITION_BY_VIEW: Record<MemberViewKey, string> = {
  all: "SALES",
  craftsman: "CONSTRUCTION",
  salesService: "SALES",
  backOffice: "PURCHASING",
  permission: "SALES"
};

type MemberRow = {
  id: string;
  position: string;
  user: {
    id: string;
    username: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
};

type InvitableUser = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
};

export default function MembersPage() {
  return (
    <Suspense fallback={<div className="management-page members-workspace" />}>
      <MembersContent />
    </Suspense>
  );
}

function MembersContent() {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [keyword, setKeyword] = useState("");
  const [positionFilter, setPositionFilter] = useState<string>("ALL");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteKeyword, setInviteKeyword] = useState("");
  const [inviteUser, setInviteUser] = useState<InvitableUser | null>(null);
  const [invitePosition, setInvitePosition] = useState<string>("SALES");

  const activeMemberView = useMemo<MemberViewKey>(() => {
    const viewParam = searchParams.get("view");
    const positionParam = searchParams.get("position");
    if (positionParam === "CONSTRUCTION") return "craftsman";
    if (isMemberViewKey(viewParam)) return viewParam;
    return "all";
  }, [searchParams]);

  const storeQuery = useQuery({
    queryKey: ["members-store", storeId],
    queryFn: () => storeApi.myStore(storeId!),
    enabled: Boolean(storeId)
  });

  const inviteSearchQuery = useQuery({
    queryKey: ["members-invite-search", storeId, inviteKeyword],
    queryFn: () => memberApi.searchInvitable(storeId!, inviteKeyword),
    enabled: Boolean(storeId && inviteOpen && inviteKeyword.trim().length > 0)
  });

  const inviteMutation = useMutation({
    mutationFn: () => {
      if (!storeId) throw new Error("当前账号未加入门店");
      if (!inviteUser?.id) throw new Error("请先选择邀请成员");
      return memberApi.invite(storeId, inviteUser.id, invitePosition);
    },
    onSuccess: async () => {
      message.success("已发出邀请");
      setInviteOpen(false);
      setInviteKeyword("");
      setInviteUser(null);
      setInvitePosition("SALES");
      await queryClient.invalidateQueries({ queryKey: ["members-store", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => {
      if (!storeId) throw new Error("当前账号未加入门店");
      return memberApi.remove(storeId, userId);
    },
    onSuccess: async () => {
      message.success("已移除成员");
      await queryClient.invalidateQueries({ queryKey: ["members-store", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const members = useMemo(() => storeQuery.data?.members ?? [], [storeQuery.data?.members]);
  const filteredMembers = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return members.filter((member) => {
      const matchesView = memberBelongsToView(member.position, activeMemberView);
      const matchesKeyword = !normalized || [
        member.user.username,
        member.user.nickname ?? "",
        getStorePositionLabel(member.position)
      ].some((value) => value.toLowerCase().includes(normalized));
      const matchesPosition = positionFilter === "ALL" || member.position === positionFilter;
      return matchesView && matchesKeyword && matchesPosition;
    });
  }, [activeMemberView, keyword, members, positionFilter]);

  const constructionCount = members.filter((member) => member.position === "CONSTRUCTION" || member.position === "APPRENTICE").length;
  const operationCount = members.filter((member) => member.position === "SALES" || member.position === "CUSTOMER_SERVICE").length;
  const backOfficeCount = members.filter((member) => member.position === "PURCHASING" || member.position === "FINANCE").length;
  const managerCount = members.filter((member) => member.position === "MANAGER").length;
  const closeInviteDrawer = () => {
    setInviteOpen(false);
    setInviteUser(null);
    setInviteKeyword("");
  };
  const openInviteDrawer = () => {
    setInvitePosition(DEFAULT_INVITE_POSITION_BY_VIEW[activeMemberView]);
    setInviteOpen(true);
  };
  const switchMemberView = (view: MemberViewKey) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("position");
    if (view === "all") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", view);
    }
    setPositionFilter("ALL");
    const queryString = nextParams.toString();
    router.replace(queryString ? `/members?${queryString}` : "/members");
  };

  return (
    <>
      <div className="management-page members-workspace">
        <StorePageHeader title="人员管理" description="管理门店团队成员、岗位权限、邀请和移除流程">
          <Button type="primary" icon={<PlusOutlined />} disabled={!storeId} onClick={openInviteDrawer}>
            邀请成员
          </Button>
        </StorePageHeader>

        <nav className="members-module-tabs" aria-label="人员视图切换">
          {MEMBER_VIEW_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`members-module-tab${activeMemberView === item.key ? " is-active" : ""}`}
              onClick={() => switchMemberView(item.key)}
            >
              {item.icon === "worker" ? <UserSwitchOutlined /> : <TeamOutlined />}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <section className="management-kpi-grid management-kpi-grid-five">
          {[
            ["团队人数", members.length, "当前门店成员"],
            ["店长", managerCount, "门店负责人"],
            ["销售客服", operationCount, "客户与订单协同"],
            ["施工人员", constructionCount, "师傅与学徒"],
            ["后勤岗位", backOfficeCount, "采购与财务"]
          ].map(([label, value, description]) => (
            <Card key={label} className="management-kpi-card">
              <div className="management-kpi-label">{label}</div>
              <div className="management-kpi-value">{value}</div>
              <div className="management-kpi-desc">{description}</div>
            </Card>
          ))}
        </section>

        <section className="members-related-workspaces" aria-label="相关工作区">
          <div className="members-related-heading">
            <CalendarOutlined />
            <span>相关工作区</span>
          </div>
          <div className="members-related-grid">
            {MEMBER_RELATED_WORKSPACES.map((item) => (
              <Link key={item.href} href={item.href} className="members-related-workspace">
                <span className="members-related-icon">
                  {item.icon === "calendar" ? <CalendarOutlined /> : <TeamOutlined />}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="members-layout">
          <Card className="management-filter-card members-filter-panel">
            <div className="members-filter-heading">
              <TeamOutlined />
              <span>人员筛选</span>
            </div>
            <div className="management-filter-grid members-filter-grid">
              <div className="orders-filter-item">
                <span className="orders-filter-label">快速搜索</span>
                <Input
                  allowClear
                  prefix={<SearchOutlined />}
                  placeholder="搜索姓名、账号或岗位"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </div>
              <div className="orders-filter-item">
                <span className="orders-filter-label">岗位</span>
                <Select
                  value={positionFilter}
                  onChange={setPositionFilter}
                  options={[{ label: "全部岗位", value: "ALL" }, ...Object.entries(STORE_POSITION_LABELS).map(([value, label]) => ({ value, label }))]}
                />
              </div>
              <div className="orders-filter-item">
                <span className="orders-filter-label">筛选结果</span>
                <div className="members-filter-result">{filteredMembers.length} / {members.length} 人</div>
              </div>
            </div>
          </Card>

          <Card className="members-table-card" title="人员列表">
            <div className="members-mobile-cards">
              {filteredMembers.length > 0 ? (
                filteredMembers.map((member) => {
                  const isManager = member.position === "MANAGER";
                  const displayName = member.user.nickname ?? member.user.username;
                  return (
                    <article className="members-mobile-card" key={member.id}>
                      <div className="members-mobile-card-head">
                        <Avatar src={member.user.avatarUrl ?? undefined} className="members-avatar">
                          {displayName.charAt(0).toUpperCase()}
                        </Avatar>
                        <div>
                          <strong>{displayName}</strong>
                          <span>@{member.user.username}</span>
                        </div>
                        <Tag color={isManager ? "blue" : "default"}>
                          {getStorePositionLabel(member.position)}
                        </Tag>
                      </div>
                      <dl className="members-mobile-card-fields">
                        <div>
                          <dt>权限范围</dt>
                          <dd>{getPositionScope(member.position)}</dd>
                        </div>
                      </dl>
                      <Popconfirm
                        title="确认移除成员"
                        description={`确定将「${displayName}」移出团队吗？`}
                        okText="移除"
                        cancelText="取消"
                        okButtonProps={{ danger: true, loading: removeMutation.isPending }}
                        disabled={isManager}
                        onConfirm={() => removeMutation.mutate(member.user.id)}
                      >
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          disabled={isManager || removeMutation.isPending}
                        >
                          移除
                        </Button>
                      </Popconfirm>
                    </article>
                  );
                })
              ) : (
                <div className="members-mobile-empty">{storeId ? "暂无团队成员" : "当前账号未加入门店"}</div>
              )}
            </div>
            <Table<MemberRow>
              className="members-desktop-table"
              rowKey={(record) => record.id}
              loading={storeQuery.isLoading}
              dataSource={filteredMembers}
              pagination={false}
              locale={{ emptyText: <Empty description={storeId ? "暂无团队成员" : "当前账号未加入门店"} /> }}
              columns={[
                {
                  title: "姓名/账号",
                  dataIndex: "user",
                  render: (_, record) => (
                    <Space>
                      <Avatar src={record.user.avatarUrl ?? undefined} className="members-avatar">
                        {(record.user.nickname ?? record.user.username).charAt(0).toUpperCase()}
                      </Avatar>
                      <div>
                        <div className="members-name">{record.user.nickname ?? record.user.username}</div>
                        <Typography.Text className="members-username">@{record.user.username}</Typography.Text>
                      </div>
                    </Space>
                  )
                },
                {
                  title: "岗位",
                  dataIndex: "position",
                  render: (position: string) => (
                    <Tag color={position === "MANAGER" ? "blue" : "default"}>
                      {getStorePositionLabel(position)}
                    </Tag>
                  )
                },
                {
                  title: "权限范围",
                  dataIndex: "position",
                  render: (position: string) => getPositionScope(position)
                },
                {
                  title: "操作",
                  key: "actions",
                  render: (_, record) => {
                    const isManager = record.position === "MANAGER";
                    return (
                      <Popconfirm
                        title="确认移除成员"
                        description={`确定将「${record.user.nickname ?? record.user.username}」移出团队吗？`}
                        okText="移除"
                        cancelText="取消"
                        okButtonProps={{ danger: true, loading: removeMutation.isPending }}
                        disabled={isManager}
                        onConfirm={() => removeMutation.mutate(record.user.id)}
                      >
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          disabled={isManager || removeMutation.isPending}
                        >
                          移除
                        </Button>
                      </Popconfirm>
                    );
                  }
                }
              ]}
            />
          </Card>
        </section>
      </div>

      <Drawer
        open={inviteOpen}
        title="邀请成员"
        onClose={closeInviteDrawer}
        destroyOnHidden
        rootClassName="members-invite-drawer"
        className="members-invite-panel"
        footer={
          <div className="members-invite-footer">
            <Button onClick={closeInviteDrawer}>取消</Button>
            <Button
              type="primary"
              disabled={!inviteUser}
              loading={inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              发出邀请
            </Button>
          </div>
        }
      >
        <div className="members-invite-form">
          <label>
            <span>搜索账号</span>
            <Select
              showSearch
              allowClear
              filterOption={false}
              placeholder="输入用户名或昵称搜索"
              value={inviteUser?.id}
              onSearch={setInviteKeyword}
              onChange={(value) => {
                const selected = (inviteSearchQuery.data ?? []).find((item) => item.id === value) ?? null;
                setInviteUser(selected);
              }}
              options={(inviteSearchQuery.data ?? []).map((item) => ({
                value: item.id,
                label: `${item.nickname ?? item.username} @${item.username}`
              }))}
              notFoundContent={inviteKeyword ? "暂无可邀请用户" : "输入关键词搜索用户"}
            />
          </label>
          <label>
            <span>岗位</span>
            <Select value={invitePosition} onChange={setInvitePosition} options={INVITE_POSITION_OPTIONS} />
          </label>
          <div className="members-invite-note">
            <UserSwitchOutlined />
            店长角色不通过邀请指派；被邀请人接受后才会加入当前门店。
          </div>
        </div>
      </Drawer>
    </>
  );
}

function isMemberViewKey(value: string | null): value is MemberViewKey {
  return MEMBER_VIEW_TABS.some((item) => item.key === value);
}

function memberBelongsToView(position: string, view: MemberViewKey) {
  if (view === "craftsman") return position === "SCHEDULER" || position === "CONSTRUCTION" || position === "APPRENTICE";
  if (view === "salesService") return position === "SALES" || position === "CUSTOMER_SERVICE";
  if (view === "backOffice") return position === "PURCHASING" || position === "FINANCE";
  return true;
}

function getPositionScope(position: string) {
  if (position === "MANAGER") return "全门店经营与成员管理";
  if (position === "SALES") return "客户、订单、个人业绩";
  if (position === "CUSTOMER_SERVICE") return "客户协同、订单、售后";
  if (position === "SCHEDULER") return "施工容量、派单、质检";
  if (position === "CONSTRUCTION" || position === "APPRENTICE") return "本人施工任务";
  if (position === "PURCHASING") return "库存采购、产品资料";
  if (position === "FINANCE") return "财务、发票、返利、报表";
  return "按岗位授权";
}
