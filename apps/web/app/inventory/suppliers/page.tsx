import { redirect } from "next/navigation";

export default function LegacyInventorySuppliersPage() {
  redirect("/purchases/suppliers");
}
