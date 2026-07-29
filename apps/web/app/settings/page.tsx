import { redirect } from "next/navigation";
import WorkbenchClient from "./workbench-client";

export default function SettingsPage() {
  if (process.env.NEXT_PUBLIC_SETTINGS_WORKBENCH_MODE === "legacy") redirect("/settings/legacy");
  return <WorkbenchClient />;
}