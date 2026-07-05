import { DashboardShell } from "@/components/dashboard-shell";
import { requirePilotSession } from "@/lib/pilot/auth";

export default async function MyWorkLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requirePilotSession(["admin", "therapist"], "/my-work");

  return <DashboardShell section="workspace" session={session}>{children}</DashboardShell>;
}
