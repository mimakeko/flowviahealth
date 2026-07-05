import { DashboardShell } from "@/components/dashboard-shell";
import { requirePilotSession } from "@/lib/pilot/auth";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requirePilotSession(["admin", "therapist"], "/dashboard");

  return <DashboardShell section="dashboard" session={session}>{children}</DashboardShell>;
}
