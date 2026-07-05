import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BriefcaseMedical,
  CalendarClock,
  ClipboardList,
  FilePlus2,
  MessageSquareText,
  PhoneOff,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { OperationsAssistantPanel } from "@/components/operations-assistant-panel";
import { SchedulingIntelligencePanel } from "@/components/scheduling-intelligence-panel";
import {
  getOperationsAssistantV2Status,
  getQueueAssistantCards,
  getTherapistAssistantCards,
} from "@/lib/ai/operations-assistant-v2";
import { getSchedulingQueueCards } from "@/lib/pilot/scheduling-intelligence";
import { getCurrentPilotSession } from "@/lib/pilot/auth";
import { getPilotOperationsAccessState } from "@/lib/pilot/access";
import { getPilotDashboardSnapshot, getTherapistDashboardSnapshot } from "@/lib/pilot/dashboard";
import { formatDateTime, statusClassName, statusLabel } from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const quickActions = [
  { href: "/admin/referrals", icon: ClipboardList, label: "Referral Operations" },
  { href: "/admin/referrals/new", icon: FilePlus2, label: "New Referral" },
  { href: "/admin/visits", icon: CalendarClock, label: "Visit Operations" },
  { href: "/admin/messages", icon: MessageSquareText, label: "Message Ledger" },
  { href: "/my-work", icon: BriefcaseMedical, label: "My Work" },
] as const;

function MetricCard({ icon: Icon, label, note, value }: { icon: typeof ClipboardList; label: string; note: string; value: number }) {
  return (
    <article className="rounded-lg border border-line bg-white p-5 shadow-[0_10px_30px_rgba(10,37,64,0.05)]">
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-600">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ice text-blue">
          <Icon size={18} />
        </span>
        {label}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-[-.03em] text-ink">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{note}</p>
    </article>
  );
}

function GatedDashboardState({ envVar }: { envVar: string }) {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
      <ShieldAlert size={26} />
      <h1 className="mt-4 text-2xl font-semibold tracking-[-.02em]">Dashboard blocked by pilot gate</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6">
        Internal operational data stays closed until <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs font-semibold">{envVar}=true</code> is set in the deployment environment. Real patient use is still blocked until auth/RBAC and policy work are complete.
      </p>
    </section>
  );
}

async function TherapistDashboard({ email }: { email: string }) {
  const snapshot = await getTherapistDashboardSnapshot(email);
  const assistantStatus = getOperationsAssistantV2Status();
  const assistantCards = getTherapistAssistantCards({
    inProgressVisits: snapshot.inProgressVisits,
    needsContact: snapshot.needsContact,
    readyToSchedule: snapshot.readyToSchedule,
    recentlyCompleted: snapshot.recentlyCompleted,
    upcomingVisits: snapshot.upcomingVisits,
  });
  const schedulingCards = getSchedulingQueueCards({
    archiveCandidates: 0,
    capacityCautions: snapshot.upcomingVisits >= 6 ? 1 : 0,
    conflicts: snapshot.inProgressVisits,
    contactedWithoutFutureVisit: snapshot.readyToSchedule,
    optedOutContacts: 0,
    readyToSchedule: snapshot.readyToSchedule,
    unassignedReferrals: 0,
    upcomingNextSevenDays: snapshot.upcomingVisits,
  });

  return (
    <div className="grid gap-8">
      <section className="flex flex-col gap-5 border-b border-line pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Therapist workspace</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">My pilot dashboard</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Scoped view for the therapist login. Referral detail, message ledger, and admin queues stay admin-only.
          </p>
        </div>
        <Link href="/my-work" className="btn-primary">
          <BriefcaseMedical size={18} />
          Open My Work
        </Link>
      </section>

      {!snapshot.therapist ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <ShieldAlert size={26} />
          <h2 className="mt-4 text-xl font-semibold tracking-[-.02em]">Therapist record not linked</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6">
            This login email must match an active `Therapist.email` row before assigned work can be shown.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={ClipboardList} label="Assigned referrals" note="Assigned referrals that are not completed or canceled." value={snapshot.assignedReferrals} />
            <MetricCard icon={Activity} label="Ready to schedule" note="Assigned contacted referrals ready for admin scheduling." value={snapshot.readyToSchedule} />
            <MetricCard icon={CalendarClock} label="Upcoming visits" note="Scheduled or in-progress visits assigned to this therapist." value={snapshot.upcomingVisits} />
            <MetricCard icon={ShieldAlert} label="Needs contact" note="New assigned referrals waiting for first contact." value={snapshot.needsContact} />
          </section>

          <OperationsAssistantPanel
            cards={assistantCards}
            status={assistantStatus}
            summary="Your next best operational step is deterministic, scoped to your assigned fake pilot work, and requires human review."
            title="Operations Assistant"
          />

          <SchedulingIntelligencePanel
            cards={schedulingCards}
            summary="Therapist-scoped scheduling guidance from assigned fake pilot work only. Admin-only controls and SMS internals remain hidden."
          />

          <section>
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Recent assigned work</h2>
              <Link href="/my-work" className="inline-flex items-center gap-1 text-sm font-semibold text-blue hover:underline">Open worklist <ArrowRight size={15} /></Link>
            </div>
            <div className="overflow-hidden rounded-lg border border-line bg-white">
              {snapshot.recentReferrals.map((referral) => (
                <div key={referral.id} className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{referral.patientName}</p>
                      <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>{statusLabel(referral.status)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
                  </div>
                  <p className="text-sm text-slate-500">{formatDateTime(referral.visits[0]?.scheduledAt)}</p>
                </div>
              ))}
              {snapshot.recentReferrals.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No assigned referrals yet.</p> : null}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold tracking-[-.02em] text-ink">Recent assigned activity</h2>
            <div className="grid gap-3">
              {snapshot.recentAuditEvents.map((event) => (
                <article key={`${event.action}-${event.createdAt.toISOString()}`} className="rounded-lg border border-line bg-white p-4 text-sm">
                  <p className="font-semibold text-ink">{event.action}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDateTime(event.createdAt)} · {event.actorType}</p>
                </article>
              ))}
              {snapshot.recentAuditEvents.length === 0 ? <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-slate-500">No assigned activity yet.</p> : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const pilotAccess = getPilotOperationsAccessState();
  const session = await getCurrentPilotSession();

  if (!pilotAccess.enabled) {
    return <GatedDashboardState envVar={pilotAccess.envVar} />;
  }

  if (session?.role === "therapist") {
    return <TherapistDashboard email={session.email} />;
  }

  const snapshot = await getPilotDashboardSnapshot();
  const assistantStatus = getOperationsAssistantV2Status();
  const assistantCards = getQueueAssistantCards({
    contactedNotScheduled: snapshot.contactedNotScheduled,
    newReferrals: snapshot.referralCounts.new,
    optedOutContacts: snapshot.optedOutSmsConsent,
    pastScheduledVisits: snapshot.pastScheduledVisits,
    scheduledVisitsNextSevenDays: snapshot.scheduledVisitsNextSevenDays,
    smokeTestRecords: snapshot.smokeTestRecords,
    unassignedReferrals: snapshot.unassignedReferrals,
  });
  const schedulingCards = getSchedulingQueueCards({
    archiveCandidates: snapshot.referralCounts.completed + snapshot.referralCounts.canceled,
    capacityCautions: 0,
    conflicts: snapshot.pastScheduledVisits,
    contactedWithoutFutureVisit: snapshot.contactedNotScheduled,
    optedOutContacts: snapshot.optedOutSmsConsent,
    readyToSchedule: snapshot.contactedNotScheduled,
    unassignedReferrals: snapshot.unassignedReferrals,
    upcomingNextSevenDays: snapshot.scheduledVisitsNextSevenDays,
  });
  const metrics = [
    { icon: ClipboardList, label: "Total referrals", note: "All fake/test referrals in the pilot workspace.", value: snapshot.totalReferrals },
    { icon: ClipboardList, label: "New referrals", note: "Fake/test referrals waiting for first contact.", value: snapshot.referralCounts.new },
    { icon: Activity, label: "Contacted referrals", note: "Referrals contacted and ready for scheduling decisions.", value: snapshot.referralCounts.contacted },
    { icon: CalendarClock, label: "Scheduled referrals", note: "Referrals currently in scheduled workflow state.", value: snapshot.referralCounts.scheduled },
    { icon: Activity, label: "Active referrals", note: "Referrals actively moving through the field workflow.", value: snapshot.referralCounts.active },
    { icon: Activity, label: "Completed referrals", note: "Referrals completed in the fake/test pilot workflow.", value: snapshot.referralCounts.completed },
    { icon: ShieldAlert, label: "Canceled referrals", note: "Canceled fake/test pilot referrals.", value: snapshot.referralCounts.canceled },
    { icon: CalendarClock, label: "Visits scheduled", note: "Scheduled or in-progress visits.", value: snapshot.scheduledVisits },
    { icon: CalendarClock, label: "Visits completed", note: "Completed fake/test visits.", value: snapshot.completedVisits },
    { icon: MessageSquareText, label: "Open SMS consent", note: "Consent enrollments waiting for confirmation.", value: snapshot.pendingSmsConsent },
    { icon: PhoneOff, label: "Opted out", note: "SMS consent enrollments currently opted out.", value: snapshot.optedOutSmsConsent },
    { icon: UsersRound, label: "Active therapists", note: "Therapists marked active in the cloud database.", value: snapshot.activeTherapists },
    { icon: Activity, label: "Recent audit activity", note: `Audit events recorded in the last ${snapshot.recentAuditWindowDays} days.`, value: snapshot.recentAuditActivity },
  ];

  return (
    <div className="grid gap-8">
      <section className="flex flex-col gap-5 border-b border-line pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Internal dashboard</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Pilot operations overview</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Live Prisma/Postgres snapshot for fake field-pilot referrals, visits, SMS consent, therapist capacity, and audit activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/referrals/new" className="btn-primary">
            <FilePlus2 size={18} />
            New referral
          </Link>
          <Link href="/admin/referrals" className="btn-secondary">
            <ClipboardList size={18} />
            Referral queue
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </section>

      <OperationsAssistantPanel
        cards={assistantCards}
        status={assistantStatus}
        summary="Queue-level risk signals are generated from safe counts only. No autonomous action, messaging, or clinical guidance is enabled."
        title="Operations Assistant"
      />

      <SchedulingIntelligencePanel
        cards={schedulingCards}
        summary="Deterministic scheduling summary from safe queue counts. No maps, geocoding, travel-time calculation, or autonomous scheduling."
      />

      <section className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Recent referrals</h2>
            <Link href="/admin/referrals" className="inline-flex items-center gap-1 text-sm font-semibold text-blue hover:underline">Open queue <ArrowRight size={15} /></Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            {snapshot.recentReferrals.map((referral) => (
              <Link key={referral.id} href={`/admin/referrals/${referral.id}`} className="grid gap-3 border-b border-line p-4 transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{referral.patientName}</p>
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>{statusLabel(referral.status)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"} · {referral.assignedTherapist?.name || "Unassigned"}</p>
                </div>
                <p className="text-sm text-slate-500">{formatDateTime(referral.visits[0]?.scheduledAt)}</p>
              </Link>
            ))}
            {snapshot.recentReferrals.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No referrals yet. Seed fake pilot data or create a manual referral.</p> : null}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold tracking-[-.02em] text-ink">Quick actions</h2>
          <div className="grid gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className="flex min-h-14 items-center justify-between gap-4 rounded-lg border border-line bg-white p-4 text-sm font-semibold text-ink transition hover:border-blue/40 hover:text-blue">
                  <span className="flex items-center gap-3">
                    <Icon size={18} />
                    {action.label}
                  </span>
                  <ArrowRight size={16} />
                </Link>
              );
            })}
          </div>

          <h2 className="mb-3 mt-6 text-xl font-semibold tracking-[-.02em] text-ink">Upcoming visits</h2>
          <div className="grid gap-3">
            {snapshot.upcomingVisits.map((visit) => (
              <article key={visit.id} className="rounded-lg border border-line bg-white p-4">
                <p className="font-semibold text-ink">{visit.referral.patientName}</p>
                <p className="mt-1 text-sm text-slate-600">{formatDateTime(visit.scheduledAt)} · {visit.therapist?.name || "Unassigned"}</p>
                <p className="mt-1 text-xs text-slate-500">{[visit.referral.city, visit.referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
              </article>
            ))}
            {snapshot.upcomingVisits.length === 0 ? <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-slate-500">No scheduled or in-progress visits yet.</p> : null}
          </div>

          <h2 className="mb-3 mt-6 text-xl font-semibold tracking-[-.02em] text-ink">SMS activity summary</h2>
          <div className="rounded-lg border border-line bg-white p-4 text-sm">
            <dl className="grid gap-2">
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Recent inbound</dt><dd className="font-semibold text-ink">{snapshot.recentSmsActivitySummary.inbound}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-600">Recent outbound</dt><dd className="font-semibold text-ink">{snapshot.recentSmsActivitySummary.outbound}</dd></div>
            </dl>
            <div className="mt-4 grid gap-2">
              {snapshot.recentSmsMessages.map((message) => (
                <div key={`${message.eventType}-${message.createdAt.toISOString()}`} className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {formatDateTime(message.createdAt)} · {message.direction} · {message.status || message.eventType}
                </div>
              ))}
              {snapshot.recentSmsMessages.length === 0 ? <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">No recent SMS ledger activity.</p> : null}
            </div>
          </div>

          <h2 className="mb-3 mt-6 text-xl font-semibold tracking-[-.02em] text-ink">Recent audit</h2>
          <div className="grid gap-2">
            {snapshot.recentAuditEvents.map((event) => (
              <article key={`${event.action}-${event.createdAt.toISOString()}`} className="rounded-lg border border-line bg-white p-4 text-sm">
                <p className="font-semibold text-ink">{event.action}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(event.createdAt)} · {event.actorType} · {event.entityType}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
