import Link from "next/link";
import {
  BriefcaseMedical,
  CalendarClock,
  CalendarSearch,
  ClipboardList,
  Database,
  FolderArchive,
  FilePlus2,
  HeartPulse,
  Home,
  LayoutDashboard,
  LockKeyhole,
  MessageSquareText,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { logoutAction } from "@/app/logout/actions";
import { LogoLockup } from "@/components/logo";
import { getFlowviaDataModeStatus } from "@/lib/compliance/data-mode";
import { getAdminMessagesAccessState, getPilotOperationsAccessState } from "@/lib/pilot/access";
import type { PilotRole, PilotSession } from "@/lib/pilot/session";

type DashboardSection = "admin" | "dashboard" | "workspace";

type DashboardShellProps = Readonly<{
  children: React.ReactNode;
  section: DashboardSection;
  session: PilotSession;
}>;

type NavItem = {
  gate?: "messages";
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles: readonly PilotRole[];
  section: DashboardSection;
};

const navItems: readonly NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "therapist"], section: "dashboard" },
  { href: "/admin/referrals", icon: ClipboardList, label: "Referral Operations", roles: ["admin"], section: "admin" },
  { href: "/admin/referrals/new", icon: FilePlus2, label: "New Referral", roles: ["admin"], section: "admin" },
  { href: "/admin/visits", icon: CalendarClock, label: "Visit Operations", roles: ["admin"], section: "admin" },
  { href: "/admin/scheduling", icon: CalendarSearch, label: "Scheduling", roles: ["admin"], section: "admin" },
  { href: "/admin/messages", icon: MessageSquareText, label: "Message Ledger", roles: ["admin"], section: "admin", gate: "messages" },
  { href: "/admin/health", icon: HeartPulse, label: "Health Center", roles: ["admin"], section: "admin" },
  { href: "/admin/audit", icon: ScrollText, label: "Audit Trail", roles: ["admin"], section: "admin" },
  { href: "/admin/data", icon: FolderArchive, label: "Data Stewardship", roles: ["admin"], section: "admin" },
  { href: "/my-work", icon: BriefcaseMedical, label: "My Work", roles: ["admin", "therapist"], section: "workspace" },
] as const;

function roleLabel(role: PilotRole) {
  return role === "admin" ? "Admin" : "Therapist";
}

function GateBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold ring-1 ${enabled ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-amber-500"}`} />
      {label}
    </span>
  );
}

export function DashboardShell({ children, section, session }: DashboardShellProps) {
  const pilotAccess = getPilotOperationsAccessState();
  const messagesAccess = getAdminMessagesAccessState();
  const dataMode = getFlowviaDataModeStatus();
  const isWorkspace = section === "workspace";
  const renderNavigation = () => (
    <nav aria-label="Internal workspace navigation" className="grid gap-1">
      {navItems.map((item) => {
        if (!item.roles.includes(session.role)) return null;

        const Icon = item.icon;
        const gatedOff = "gate" in item && item.gate === "messages" && !messagesAccess.enabled;
        const active = item.section === section;
        const className = `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "bg-ice text-blue" : "text-slate-600 hover:bg-mist hover:text-ink"} ${gatedOff ? "cursor-not-allowed opacity-55 hover:bg-transparent" : ""}`;

        return gatedOff ? (
          <span key={item.href} aria-disabled="true" className={className} title={`${messagesAccess.envVar}=true required in production`}>
            <Icon size={18} />
            {item.label}
          </span>
        ) : (
          <Link key={item.href} href={item.href} className={className}>
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-mist text-ink">
      <a href="#main-content" className="sr-only z-[100] rounded bg-white px-4 py-2 text-blue focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to workspace</a>

      <header className="border-b border-line bg-white">
        <div className="container-page flex min-h-[74px] flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/dashboard" aria-label="Flowvia internal dashboard" className="inline-flex w-fit">
            <LogoLockup compact />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-9 items-center rounded-lg border border-line bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
              {roleLabel(session.role)} · {session.email}
            </span>
            <span className={isWorkspace ? "hidden sm:inline-flex" : "inline-flex"}>
              <GateBadge enabled={pilotAccess.enabled} label={pilotAccess.enabled ? "Pilot gate open" : "Pilot gate closed"} />
            </span>
            <span className={isWorkspace ? "hidden sm:inline-flex" : "inline-flex"}>
              <GateBadge enabled={messagesAccess.enabled} label={messagesAccess.enabled ? "Ledger gate open" : "Ledger gate closed"} />
            </span>
            <form action={logoutAction}>
              <button className="inline-flex min-h-9 items-center rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue/40 hover:text-blue" type="submit">
                Logout
              </button>
            </form>
            <Link href="/" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue/40 hover:text-blue">
              <Home size={15} />
              Public site
            </Link>
          </div>
        </div>
        <div className={`${isWorkspace ? "hidden lg:block" : ""} border-t border-amber-200 bg-amber-50`}>
          <div className="container-page flex min-h-11 flex-wrap items-center gap-2 py-2 text-xs font-semibold text-amber-950">
            <ShieldAlert size={16} />
            <span>{dataMode.warningLabel}</span>
            <span className="rounded-md bg-white/70 px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-amber-900">{dataMode.safeLabel}</span>
          </div>
        </div>
      </header>

      <div className="container-page grid gap-5 py-4 sm:py-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-6 lg:py-8">
        <aside className={`${isWorkspace ? "order-2 border-0 bg-transparent p-0 shadow-none lg:order-1 lg:rounded-lg lg:border lg:border-line lg:bg-white lg:p-3 lg:shadow-[0_10px_30px_rgba(10,37,64,0.05)]" : "rounded-lg border border-line bg-white p-3 shadow-[0_10px_30px_rgba(10,37,64,0.05)]"} h-fit lg:sticky lg:top-6`}>
          {isWorkspace ? (
            <>
              <details className="rounded-lg border border-line bg-white lg:hidden">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  <span>Menu</span>
                  <span className="text-xs font-semibold text-blue">Field workspace</span>
                </summary>
                <div className="border-t border-line p-3">
                  {renderNavigation()}
                </div>
              </details>
              <div className="hidden lg:block">
                {renderNavigation()}
              </div>
            </>
          ) : (
            renderNavigation()
          )}

          <div className={`${isWorkspace ? "hidden lg:block" : ""} mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950`}>
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert size={17} />
              {dataMode.warningLabel}
            </div>
            <p className="mt-2 text-xs leading-5">Real patient use remains blocked until auth/RBAC, PHI policy, retention, backups, and incident response are approved.</p>
          </div>

          <div className={`${isWorkspace ? "hidden lg:block" : ""} mt-3 rounded-lg border border-line bg-slate-50 p-4 text-xs leading-5 text-slate-600`}>
            <div className="flex items-center gap-2 font-semibold text-ink">
              <LockKeyhole size={16} />
              Access boundary
            </div>
            <p className="mt-2">Signed pilot sessions enforce admin and therapist route access. This is still not final enterprise auth.</p>
          </div>

          <div className={`${isWorkspace ? "hidden lg:block" : ""} mt-3 rounded-lg border border-line bg-slate-50 p-4 text-xs leading-5 text-slate-600`}>
            <div className="flex items-center gap-2 font-semibold text-ink">
              <Database size={16} />
              Cloud data
            </div>
            <p className="mt-2">Operational cards and work queues read from Prisma/Postgres when gates are open.</p>
          </div>
        </aside>

        <main id="main-content" className={`${isWorkspace ? "order-1 lg:order-2" : ""} min-w-0 pb-10`}>
          {children}
        </main>
      </div>
    </div>
  );
}
