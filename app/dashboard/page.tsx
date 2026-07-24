import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, CircleAlert, ClipboardList, FilePlus2, UsersRound } from "lucide-react";
import { getCurrentPilotSession } from "@/lib/pilot/auth";
import { getPilotOperationsAccessState } from "@/lib/pilot/access";
import { getPilotDashboardSnapshot, getTherapistDashboardSnapshot } from "@/lib/pilot/dashboard";
import { formatDateTime } from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function GatedDashboardState({ envVar }: { envVar: string }) {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
      <CircleAlert size={26} />
      <h1 className="mt-4 text-2xl font-semibold tracking-[-.02em]">Dashboard unavailable</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6">This pilot workspace is closed until <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs font-semibold">{envVar}=true</code> is configured.</p>
    </section>
  );
}

function ActionRow({ detail, href, label }: { detail: string; href: string; label: string }) {
  return (
    <Link href={href} className="group flex min-h-14 items-center justify-between gap-4 border-b border-line py-3 last:border-b-0 focus:outline-none focus:ring-4 focus:ring-blue/15">
      <span>
        <span className="block font-semibold text-ink group-hover:text-blue">{label}</span>
        <span className="mt-1 block text-sm leading-5 text-slate-600">{detail}</span>
      </span>
      <ArrowRight aria-hidden="true" className="shrink-0 text-blue" size={18} />
    </Link>
  );
}

async function TherapistDashboard({ email }: { email: string }) {
  const snapshot = await getTherapistDashboardSnapshot(email);

  return (
    <div className="mx-auto grid max-w-3xl gap-8">
      <header className="border-b border-line pb-5">
        <h1 className="text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Home</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Start with the next visit, then review new work and only what needs attention.</p>
      </header>

      {!snapshot.therapist ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h2 className="font-semibold">Therapist record not linked</h2>
          <p className="mt-2 text-sm leading-6">Your pilot login needs an active therapist record before work can be shown.</p>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-blue/20 bg-white p-5 shadow-[0_12px_28px_rgba(10,37,64,0.06)]">
            <p className="text-sm font-semibold text-teal">Next visit</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-.02em] text-ink">{snapshot.upcomingVisits > 0 ? "Your schedule is ready to review" : "No visit is scheduled next"}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{snapshot.upcomingVisits > 0 ? `${snapshot.upcomingVisits} upcoming visit${snapshot.upcomingVisits === 1 ? "" : "s"}.` : "Review assigned work or new opportunities."}</p>
            <Link href="/my-work#schedule" className="btn-primary mt-5 min-h-12 w-full sm:w-auto">Open schedule <ArrowRight aria-hidden="true" size={18} /></Link>
          </section>

          <section>
            <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">New work</h2>
            <ActionRow href="/my-work#opportunities" label={`${snapshot.assignedReferrals} assigned referral${snapshot.assignedReferrals === 1 ? "" : "s"}`} detail="Review opportunities and respond when they are a fit." />
            <ActionRow href="/my-work#attention" label={`${snapshot.needsContact} need contact`} detail="Open only the work that needs a next step." />
          </section>
        </>
      )}
    </div>
  );
}

function AdminSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">{title}</h2>
      <div className="mt-2 border-y border-line bg-white px-4">{children}</div>
    </section>
  );
}

export default async function DashboardPage() {
  const pilotAccess = getPilotOperationsAccessState();
  const session = await getCurrentPilotSession();

  if (!pilotAccess.enabled) return <GatedDashboardState envVar={pilotAccess.envVar} />;
  if (session?.role === "therapist") return <TherapistDashboard email={session.email} />;

  const snapshot = await getPilotDashboardSnapshot();
  const hasAttention = snapshot.unassignedReferrals > 0 || snapshot.contactedNotScheduled > 0 || snapshot.pastScheduledVisits > 0 || snapshot.optedOutSmsConsent > 0;

  return (
    <div className="grid gap-8">
      <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Operations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">The work that needs a decision, the work ready to move, and today&apos;s schedule.</p>
        </div>
        <Link href="/admin/referrals/new" className="btn-primary min-h-12"><FilePlus2 aria-hidden="true" size={18} />New referral</Link>
      </header>

      <AdminSection title="Needs attention">
        {snapshot.unassignedReferrals > 0 ? <ActionRow href="/admin/referrals?group=missing_therapist" label={`${snapshot.unassignedReferrals} without a therapist`} detail="Assign or review before offering work." /> : null}
        {snapshot.contactedNotScheduled > 0 ? <ActionRow href="/admin/referrals?group=needs_scheduling" label={`${snapshot.contactedNotScheduled} waiting to schedule`} detail="Intake is contacted but has no future visit." /> : null}
        {snapshot.pastScheduledVisits > 0 ? <ActionRow href="/admin/visits" label={`${snapshot.pastScheduledVisits} past scheduled visit${snapshot.pastScheduledVisits === 1 ? "" : "s"}`} detail="Confirm the current operational status." /> : null}
        {snapshot.optedOutSmsConsent > 0 ? <ActionRow href="/admin/messages" label={`${snapshot.optedOutSmsConsent} non-SMS contact${snapshot.optedOutSmsConsent === 1 ? "" : "s"}`} detail="Use a permitted non-SMS follow-up." /> : null}
        {!hasAttention ? <p className="py-5 text-sm text-slate-600">Nothing needs attention right now.</p> : null}
      </AdminSection>

      <AdminSection title="Ready to move">
        <ActionRow href="/admin/referrals?group=ready_scheduling" label={`${snapshot.contactedNotScheduled} ready to schedule`} detail="Move ready referrals into a visit when the gate allows it." />
        <ActionRow href="/admin/referrals" label={`${snapshot.referralCounts.new} new referral${snapshot.referralCounts.new === 1 ? "" : "s"}`} detail="Review intake and choose the next safe handoff." />
        <ActionRow href="/admin/referrals" label={`${snapshot.activeTherapists} active therapist${snapshot.activeTherapists === 1 ? "" : "s"}`} detail="Open the referral queue to review a therapist fit." />
      </AdminSection>

      <AdminSection title="Today">
        {snapshot.upcomingVisits.length > 0 ? snapshot.upcomingVisits.map((visit) => (
          <ActionRow key={visit.id} href="/admin/visits" label={visit.referral.patientName} detail={`${formatDateTime(visit.scheduledAt)} · ${visit.therapist?.name || "Unassigned"}`} />
        )) : <p className="py-5 text-sm text-slate-600">No visits are scheduled today.</p>}
      </AdminSection>

      <div className="flex flex-wrap gap-3 border-t border-line pt-5 text-sm font-semibold text-blue">
        <Link href="/admin/referrals" className="inline-flex min-h-11 items-center gap-2"><ClipboardList aria-hidden="true" size={17} />Referral queue</Link>
        <Link href="/admin/visits" className="inline-flex min-h-11 items-center gap-2"><CalendarClock aria-hidden="true" size={17} />Visits</Link>
        <Link href="/admin/data" className="inline-flex min-h-11 items-center gap-2"><UsersRound aria-hidden="true" size={17} />Data and admin tools</Link>
      </div>
    </div>
  );
}
