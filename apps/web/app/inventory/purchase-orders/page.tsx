import { redirect } from "next/navigation";

export default function LegacyInventoryPurchaseOrdersPage() {
  redirect("/purchases/orders");
}
