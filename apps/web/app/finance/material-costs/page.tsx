"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Kept only for bookmarked legacy links. Material cost is maintained in the
 * product archive now, where its unit and product scope are visible together.
 */
export default function LegacyMaterialCostsPage() {
  const router = useRouter();
  useEffect(() => router.replace("/products"), [router]);
  return null;
}
