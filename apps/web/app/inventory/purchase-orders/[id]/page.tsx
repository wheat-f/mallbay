import { redirect } from "next/navigation";

export default async function LegacyInventoryPurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/purchases/orders/${id}`);
}
