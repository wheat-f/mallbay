import { redirect } from "next/navigation";

export default function PurchasesInboundRedirectPage() {
  redirect("/purchases/orders");
}
