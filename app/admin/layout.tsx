import { DashboardShell } from "@/components/dashboard-shell";
import { requirePilotSession } from "@/lib/pilot/auth";

export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requirePilotSession(["admin"], "/admin/referrals");

  return <DashboardShell section="admin" session={session}>{children}</DashboardShell>;
}
