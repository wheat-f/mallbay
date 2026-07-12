import { redirect } from "next/navigation";

export default function LegacyInventoryPurchaseOrderDetailPage({ params }: { params: { id: string } }) {
  redirect(`/purchases/orders/${params.id}`);
}
