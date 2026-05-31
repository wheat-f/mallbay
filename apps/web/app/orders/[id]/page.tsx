"use client";

import { Button, Descriptions, Layout, List, Skeleton, Tag, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { orderApi } from "../../../src/lib/api";

type OrderDetail = {
  id: string;
  orderNo: string;
  status: string;
  constructionType: string;
  constructionLocation: string;
  appointmentDate?: string | null;
  appointmentTimeSlot?: string | null;
  customer?: { name?: string | null; companyName?: string | null; contactPerson?: string | null };
  vehicle?: { carPlate?: string | null; carModel?: string | null; carColor?: string | null };
  items?: { id: string; quantity: number; unitPriceCents: number; amountCents: number; product?: { name: string; brand: string; model: string } }[];
  amount?: { productAmountCents: number; laborCostCents: number; totalAmountCents: number; paidAmountCents: number; outstandingCents: number } | null;
  payments?: { id: string; paymentType: string; amountCents: number; paidAt: string; account?: { name: string } }[];
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const orderQuery = useQuery({
    queryKey: ["order-detail", params.id],
    queryFn: () => orderApi.detail(params.id)
  });
  const order = orderQuery.data as OrderDetail | undefined;

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4 flex items-center gap-3">
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.back()} />
          <div>
            <Typography.Title level={3} className="!mb-1">
              {order?.orderNo ?? "订单详情"}
            </Typography.Title>
            {order && <Tag>{order.status}</Tag>}
          </div>
        </div>

        {orderQuery.isLoading ? (
          <Skeleton active />
        ) : (
          <>
            <Descriptions bordered column={2} className="mb-4">
              <Descriptions.Item label="客户">
                {order?.customer?.companyName ?? order?.customer?.name ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="车辆">
                {order?.vehicle?.carPlate ?? order?.vehicle?.carModel ?? "-"}
              </Descriptions.Item>
              <Descriptions.Item label="施工类型">{order?.constructionType}</Descriptions.Item>
              <Descriptions.Item label="施工地点">{order?.constructionLocation}</Descriptions.Item>
              <Descriptions.Item label="预约日期">{order?.appointmentDate ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="预约时段">{order?.appointmentTimeSlot ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="订单总额">
                {order?.amount ? `￥${(order.amount.totalAmountCents / 100).toFixed(2)}` : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="未收金额">
                {order?.amount ? `￥${(order.amount.outstandingCents / 100).toFixed(2)}` : "-"}
              </Descriptions.Item>
            </Descriptions>

            <Typography.Title level={4}>产品明细</Typography.Title>
            <List
              bordered
              dataSource={order?.items ?? []}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={`${item.product?.brand ?? ""} ${item.product?.name ?? ""}`}
                    description={`${item.product?.model ?? ""} x ${item.quantity}`}
                  />
                  <div>￥{(item.amountCents / 100).toFixed(2)}</div>
                </List.Item>
              )}
            />

            <Typography.Title level={4} className="!mt-6">收款记录</Typography.Title>
            <List
              bordered
              dataSource={order?.payments ?? []}
              locale={{ emptyText: "暂无收款" }}
              renderItem={(payment) => (
                <List.Item>
                  <List.Item.Meta
                    title={`${payment.paymentType} / ${payment.account?.name ?? "-"}`}
                    description={payment.paidAt}
                  />
                  <div>￥{(payment.amountCents / 100).toFixed(2)}</div>
                </List.Item>
              )}
            />
          </>
        )}
      </Layout.Content>
    </Layout>
  );
}
