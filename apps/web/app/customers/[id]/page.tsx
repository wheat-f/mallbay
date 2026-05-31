"use client";

import { Button, Descriptions, Layout, List, Skeleton, Tag, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { customerApi } from "../../../src/lib/api";

type CustomerDetail = {
  id: string;
  customerType: string;
  name?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  gender?: string | null;
  wechat?: string | null;
  sourceType?: string | null;
  sourceDetail?: string | null;
  vehicles?: { id: string; carPlate?: string | null; carModel: string; carColor?: string | null }[];
  notes?: { id: string; content: string; createdAt: string }[];
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerQuery = useQuery({
    queryKey: ["customer-detail", params.id],
    queryFn: () => customerApi.detail(params.id)
  });
  const customer = customerQuery.data as CustomerDetail | undefined;

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4 flex items-center gap-3">
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} />
          <div>
            <Typography.Title level={3} className="!mb-1">
              {customer?.companyName ?? customer?.name ?? "客户详情"}
            </Typography.Title>
            <Typography.Text type="secondary">客户档案、车辆与跟进记录</Typography.Text>
          </div>
        </div>

        {customerQuery.isLoading ? (
          <Skeleton active />
        ) : (
          <>
            <Descriptions bordered column={2} className="mb-4">
              <Descriptions.Item label="类型">
                <Tag>{customer?.customerType === "COMPANY" ? "企业" : "个人"}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="微信">{customer?.wechat ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="联系人">
                {customer?.contactPerson ?? customer?.name ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="性别">{customer?.gender ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="来源">{customer?.sourceType ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="来源说明">{customer?.sourceDetail ?? "-"}</Descriptions.Item>
            </Descriptions>

            <Typography.Title level={4}>车辆</Typography.Title>
            <List
              bordered
              dataSource={customer?.vehicles ?? []}
              locale={{ emptyText: "暂无车辆" }}
              renderItem={(vehicle) => (
                <List.Item>
                  <List.Item.Meta
                    title={vehicle.carPlate ?? vehicle.carModel}
                    description={`${vehicle.carModel}${vehicle.carColor ? ` / ${vehicle.carColor}` : ""}`}
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </Layout.Content>
    </Layout>
  );
}
