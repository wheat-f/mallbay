"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route: vehicle type is maintained in the customer vehicle archive. */
export default function LegacyVehiclePricingPage() {
  const router = useRouter();
  useEffect(() => router.replace("/customers"), [router]);
  return null;
}
