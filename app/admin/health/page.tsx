import type { Metadata } from "next";
import { Activity, AlertTriangle, Archive, BriefcaseMedical, CalendarClock, Clock, Database, KeyRound, MessageSquareText, Radio, ShieldCheck } from "lucide-react";
import { getOperationsAssistantStatus } from "@/lib/ai/operations-assistant";
import { getOperationsAssistantV2Status } from "@/lib/ai/operations-assistant-v2";
import { getFlowviaDataModeStatus } from "@/lib/compliance/data-mode";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  getCloudDeployTarget,
  getDatabaseUrlComparison,
  safeInboundKeywordLabel,
} from "@/lib/pilot/cloud-health";
import { getPilotDataStewardshipSummary, getPilotDemoResetStatus } from "@/lib/pilot/data-stewardship";
import { requirePilotOperationsAccess } from "@/lib/pilot/ops";
import { redactPhone } from "@/lib/sms/compliance";
import { getSmsStoreStatus } from "@/lib/sms/store";
import { getTelnyxConfigStatus } from "@/lib/sms/telnyx";
import { getSchedulingIntelligenceStatus } from "@/lib/pilot/scheduling-intelligence";
import { getTherapistFieldWorkflowStatus } from "@/lib/pilot/therapist-field-workflow";
import { getReferralIntakeQualityStatus } from "@/lib/pilot/referral-intake-quality";

export const metadata: Metadata = {
  title: "Cloud Pilot Health",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type HealthMetric = {
  label: string;
  value: string;
  tone?: "good" | "warn" | "neutral";
};

type ActivitySnapshot = {
  error?: string;
  lastAuditActivityCount: number;
  lastInboundSmsTime: Date | null;
  lastInboundKeyword: string;
  lastOutboundSmsTime: Date | null;
  lastReferralCreatedTime: Date | null;
  lastSmsWebhookEventTime: Date | null;
  lastVisitCreatedTime: Date | null;
};

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function cardToneClassName(tone: HealthMetric["tone"] = "neutral") {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-line bg-white text-ink";
}

async function getActivitySnapshot(): Promise<ActivitySnapshot> {
  if (!process.env.DATABASE_URL) {
    return {
      error: "DATABASE_URL is missing, so cloud activity could not be queried.",
      lastAuditActivityCount: 0,
      lastInboundKeyword: "UNKNOWN",
      lastInboundSmsTime: null,
      lastOutboundSmsTime: null,
      lastReferralCreatedTime: null,
      lastSmsWebhookEventTime: null,
      lastVisitCreatedTime: null,
    };
  }

  try {
    const prisma = getPrismaClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lastAuditActivityCount = await prisma.auditLog.count({ where: { createdAt: { gte: since } } });
    const lastWebhook = await prisma.telnyxWebhookEvent.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const lastInbound = await prisma.smsMessage.findFirst({ orderBy: { createdAt: "desc" }, select: { body: true, createdAt: true }, where: { direction: "inbound" } });
    const lastOutbound = await prisma.smsMessage.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true }, where: { direction: "outbound" } });
    const lastReferral = await prisma.patientReferral.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    const lastVisit = await prisma.visit.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });

    return {
      lastAuditActivityCount,
      lastInboundKeyword: safeInboundKeywordLabel(lastInbound?.body),
      lastInboundSmsTime: lastInbound?.createdAt ?? null,
      lastOutboundSmsTime: lastOutbound?.createdAt ?? null,
      lastReferralCreatedTime: lastReferral?.createdAt ?? null,
      lastSmsWebhookEventTime: lastWebhook?.createdAt ?? null,
      lastVisitCreatedTime: lastVisit?.createdAt ?? null,
    };
  } catch {
    return {
      error: "Database activity snapshot is temporarily unavailable. Readiness flags below remain safe to review.",
      lastAuditActivityCount: 0,
      lastInboundKeyword: "UNKNOWN",
      lastInboundSmsTime: null,
      lastOutboundSmsTime: null,
      lastReferralCreatedTime: null,
      lastSmsWebhookEventTime: null,
      lastVisitCreatedTime: null,
    };
  }
}

function HealthCard({ icon: Icon, metric }: { icon: typeof Activity; metric: HealthMetric }) {
  return (
    <article className={`rounded-lg border p-5 ${cardToneClassName(metric.tone)}`}>
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Icon size={17} />
        {metric.label}
      </div>
      <p className="mt-3 break-words text-xl font-semibold tracking-[-.02em]">{metric.value}</p>
    </article>
  );
}

async function getSafeStewardshipSummary() {
  if (!process.env.DATABASE_URL) return null;

  try {
    return await getPilotDataStewardshipSummary(getPrismaClient());
  } catch {
    return null;
  }
}

export default async function AdminHealthPage() {
  requirePilotOperationsAccess();

  const deployTarget = getCloudDeployTarget();
  const dataMode = getFlowviaDataModeStatus();
  const telnyx = getTelnyxConfigStatus();
  const aiStatus = getOperationsAssistantStatus();
  const aiV2Status = getOperationsAssistantV2Status();
  const smsStore = getSmsStoreStatus();
  const dbUrls = getDatabaseUrlComparison();
  const schedulingStatus = getSchedulingIntelligenceStatus();
  const therapistFieldWorkflow = getTherapistFieldWorkflowStatus();
  const referralIntakeQuality = getReferralIntakeQualityStatus();
  const demoResetStatus = getPilotDemoResetStatus();
  const activitySnapshot = await getActivitySnapshot();
  const databaseStorageMode = process.env.DATABASE_URL ? "Postgres" : smsStore.label;
  const webhookEnforced = telnyx.webhookSigningConfigured && !telnyx.unsignedWebhookTestBypassEnabled;
  const dbIdenticalLabel = dbUrls.identical === null ? "Unknown" : dbUrls.identical ? "Identical" : "Non-identical";
  const stewardshipSummary = await getSafeStewardshipSummary();
  const lastStewardshipAction = stewardshipSummary?.lastStewardshipAudit
    ? `${stewardshipSummary.lastStewardshipAudit.action} / ${formatDateTime(stewardshipSummary.lastStewardshipAudit.createdAt)}`
    : "Not recorded";

  const statusMetrics: Array<{ icon: typeof Activity; metric: HealthMetric }> = [
    { icon: Activity, metric: { label: "Deploy target", value: deployTarget } },
    { icon: ShieldCheck, metric: { label: "Data mode", value: dataMode.safeLabel, tone: dataMode.blockers.length > 0 ? "warn" : "good" } },
    { icon: Radio, metric: { label: "Real SMS gate", value: telnyx.realSmsTestsEnabled ? "On" : "Off", tone: telnyx.realSmsTestsEnabled ? "warn" : "good" } },
    { icon: Activity, metric: { label: "AI mode / provider", value: `${aiStatus.modeLabel} / ${aiStatus.provider}`, tone: aiStatus.enabled && aiStatus.provider !== "mock" ? "warn" : "good" } },
    { icon: Activity, metric: { label: "AI assistant v2", value: `${aiV2Status.versionLabel} / ${aiV2Status.providerLabel}`, tone: "good" } },
    { icon: ShieldCheck, metric: { label: "AI external API calls", value: aiV2Status.externalApiCallsEnabled ? "Enabled" : "Disabled", tone: aiV2Status.externalApiCallsEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "AI autonomous actions", value: aiV2Status.autonomousActionsEnabled ? "Enabled" : "Disabled", tone: aiV2Status.autonomousActionsEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "AI no-PHI mode", value: aiStatus.noPhiMode ? "On" : "Off", tone: aiStatus.noPhiMode ? "good" : "warn" } },
    { icon: Database, metric: { label: "SMS store mode", value: smsStore.label } },
    { icon: Database, metric: { label: "Database storage mode", value: databaseStorageMode, tone: databaseStorageMode === "Postgres" ? "good" : "warn" } },
    { icon: KeyRound, metric: { label: "Webhook signing", value: webhookEnforced ? "Configured and enforced" : telnyx.webhookSigningConfigured ? "Configured; bypass enabled" : "Missing/dev skipped", tone: webhookEnforced ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Unsigned webhook bypass", value: telnyx.unsignedWebhookTestBypassEnabled ? "Enabled" : "Disabled", tone: telnyx.unsignedWebhookTestBypassEnabled ? "warn" : "good" } },
    { icon: KeyRound, metric: { label: "Telnyx API key", value: telnyx.apiKeyConfigured ? "Set" : "Missing", tone: telnyx.apiKeyConfigured ? "good" : "warn" } },
    { icon: MessageSquareText, metric: { label: "Telnyx messaging profile", value: telnyx.messagingProfileConfigured ? "Set" : "Missing", tone: telnyx.messagingProfileConfigured ? "good" : "warn" } },
    { icon: Radio, metric: { label: "Telnyx from number", value: redactPhone(telnyx.fromNumber) } },
    { icon: Database, metric: { label: "DATABASE_URL mode", value: `${dbUrls.databaseUrl.mode} / port ${dbUrls.databaseUrl.port}`, tone: dbUrls.databaseUrl.mode === "transaction" ? "good" : "warn" } },
    { icon: Database, metric: { label: "DIRECT_URL mode", value: `${dbUrls.directUrl.mode} / port ${dbUrls.directUrl.port}`, tone: dbUrls.directUrl.mode === "session" ? "good" : "warn" } },
    { icon: Database, metric: { label: "Database URL comparison", value: dbIdenticalLabel, tone: dbUrls.identical === false ? "good" : "warn" } },
    { icon: CalendarClock, metric: { label: "Scheduling intelligence", value: schedulingStatus.enabled ? "Enabled" : "Disabled", tone: schedulingStatus.enabled ? "good" : "warn" } },
    { icon: CalendarClock, metric: { label: "Scheduling source", value: schedulingStatus.source, tone: "good" } },
    { icon: CalendarClock, metric: { label: "Scheduling windows", value: `${schedulingStatus.suggestedBusinessDays} business days only`, tone: "good" } },
    { icon: ShieldCheck, metric: { label: "Maps/geocoding APIs", value: schedulingStatus.geocodingEnabled || schedulingStatus.externalApisEnabled ? "Enabled" : "Disabled", tone: schedulingStatus.geocodingEnabled || schedulingStatus.externalApisEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "Travel-time APIs", value: schedulingStatus.travelTimeApisEnabled ? "Enabled" : "Disabled", tone: schedulingStatus.travelTimeApisEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "Scheduling external AI", value: schedulingStatus.externalAiEnabled ? "Enabled" : "Disabled", tone: schedulingStatus.externalAiEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "Autonomous scheduling", value: schedulingStatus.autonomousSchedulingEnabled ? "Enabled" : "Disabled", tone: schedulingStatus.autonomousSchedulingEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "Referral intake quality", value: referralIntakeQuality.enabled ? "Enabled" : "Disabled", tone: referralIntakeQuality.enabled ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Duplicate guard", value: referralIntakeQuality.duplicateGuardEnabled ? referralIntakeQuality.duplicateGuardMode : "Disabled", tone: referralIntakeQuality.duplicateGuardEnabled ? "good" : "warn" } },
    { icon: Database, metric: { label: "Duplicate source", value: referralIntakeQuality.duplicateSource, tone: "good" } },
    { icon: ShieldCheck, metric: { label: "Referral auto-assignment", value: referralIntakeQuality.autoAssignmentEnabled ? "Enabled" : "Disabled", tone: referralIntakeQuality.autoAssignmentEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "Auto visit creation from referral", value: referralIntakeQuality.autoVisitCreationEnabled ? "Enabled" : "Disabled", tone: referralIntakeQuality.autoVisitCreationEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "Intake PHI storage", value: referralIntakeQuality.intakePhiStorageEnabled ? "Enabled" : "Disabled", tone: referralIntakeQuality.intakePhiStorageEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "External duplicate APIs", value: referralIntakeQuality.externalDuplicateApisEnabled ? "Enabled" : "Disabled", tone: referralIntakeQuality.externalDuplicateApisEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "SMS sending from intake", value: referralIntakeQuality.smsSendingEnabled ? "Enabled" : "Disabled", tone: referralIntakeQuality.smsSendingEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "Full phone display", value: referralIntakeQuality.fullPhoneDisplayEnabled ? "Enabled" : "Disabled / masked", tone: referralIntakeQuality.fullPhoneDisplayEnabled ? "warn" : "good" } },
    { icon: BriefcaseMedical, metric: { label: "Therapist field workflow", value: therapistFieldWorkflow.enabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.enabled ? "good" : "warn" } },
    { icon: BriefcaseMedical, metric: { label: "Field workspace optimized", value: therapistFieldWorkflow.fieldWorkspaceOptimized ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.fieldWorkspaceOptimized ? "good" : "warn" } },
    { icon: BriefcaseMedical, metric: { label: "Empty states", value: therapistFieldWorkflow.emptyStatesEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.emptyStatesEnabled ? "good" : "warn" } },
    { icon: BriefcaseMedical, metric: { label: "Field phone layout", value: therapistFieldWorkflow.phoneLayoutEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.phoneLayoutEnabled ? "good" : "warn" } },
    { icon: BriefcaseMedical, metric: { label: "Field iPad layout", value: therapistFieldWorkflow.ipadLayoutEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.ipadLayoutEnabled ? "good" : "warn" } },
    { icon: BriefcaseMedical, metric: { label: "Mobile overflow guard", value: therapistFieldWorkflow.mobileOverflowGuardEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.mobileOverflowGuardEnabled ? "good" : "warn" } },
    { icon: Database, metric: { label: "Query minimization", value: therapistFieldWorkflow.queryMinimizationEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.queryMinimizationEnabled ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Field workflow mode", value: therapistFieldWorkflow.manualOnly ? "Manual only" : "Autonomous", tone: therapistFieldWorkflow.manualOnly ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Field workflow no-PHI", value: therapistFieldWorkflow.noPhiMode ? "On" : "Off", tone: therapistFieldWorkflow.noPhiMode ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Field no-PHI notes", value: therapistFieldWorkflow.noPhiNotesEnforced ? "Enforced" : "Not enforced", tone: therapistFieldWorkflow.noPhiNotesEnforced ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Therapist field confirmations", value: therapistFieldWorkflow.therapistFieldConfirmationsEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.therapistFieldConfirmationsEnabled ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Confirmation UX", value: therapistFieldWorkflow.confirmationUxEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.confirmationUxEnabled ? "good" : "warn" } },
    { icon: BriefcaseMedical, metric: { label: "Mobile action UX", value: therapistFieldWorkflow.mobileActionUxEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.mobileActionUxEnabled ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Blocked note safe feedback", value: therapistFieldWorkflow.safeBlockedNoteFeedbackEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.safeBlockedNoteFeedbackEnabled ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Field activity audit", value: therapistFieldWorkflow.therapistFieldActivityAuditEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.therapistFieldActivityAuditEnabled ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Terminal visit lock", value: therapistFieldWorkflow.terminalVisitLockEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.terminalVisitLockEnabled ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Field workflow SMS sending", value: therapistFieldWorkflow.smsSendingEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.smsSendingEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "No SMS controls", value: therapistFieldWorkflow.smsSendingEnabled ? "Not enforced" : "Enforced", tone: therapistFieldWorkflow.smsSendingEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "Autonomous field actions", value: therapistFieldWorkflow.autonomousStatusChangesEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.autonomousStatusChangesEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "No autonomous actions", value: therapistFieldWorkflow.autonomousStatusChangesEnabled ? "Not enforced" : "Enforced", tone: therapistFieldWorkflow.autonomousStatusChangesEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "External AI/API for field notes", value: therapistFieldWorkflow.externalApisEnabled || therapistFieldWorkflow.externalAiEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.externalApisEnabled || therapistFieldWorkflow.externalAiEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "No external APIs", value: therapistFieldWorkflow.externalApisEnabled || therapistFieldWorkflow.externalAiEnabled ? "Not enforced" : "Enforced", tone: therapistFieldWorkflow.externalApisEnabled || therapistFieldWorkflow.externalAiEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "PHI note storage", value: therapistFieldWorkflow.phiNoteStorageEnabled ? "Enabled" : "Disabled", tone: therapistFieldWorkflow.phiNoteStorageEnabled ? "warn" : "good" } },
    { icon: Activity, metric: { label: "Audit activity, last 24h", value: `${activitySnapshot.lastAuditActivityCount}` } },
    { icon: Clock, metric: { label: "Last SMS webhook event", value: formatDateTime(activitySnapshot.lastSmsWebhookEventTime) } },
    { icon: Clock, metric: { label: "Last inbound SMS", value: formatDateTime(activitySnapshot.lastInboundSmsTime) } },
    { icon: MessageSquareText, metric: { label: "Latest inbound keyword", value: activitySnapshot.lastInboundKeyword } },
    { icon: Clock, metric: { label: "Last outbound SMS", value: formatDateTime(activitySnapshot.lastOutboundSmsTime) } },
    { icon: Clock, metric: { label: "Last referral created", value: formatDateTime(activitySnapshot.lastReferralCreatedTime) } },
    { icon: Clock, metric: { label: "Last visit created", value: formatDateTime(activitySnapshot.lastVisitCreatedTime) } },
    { icon: Database, metric: { label: "Data stewardship", value: stewardshipSummary ? "Audit-preserving cleanup enabled" : "Unavailable", tone: stewardshipSummary?.auditPreservingCleanupEnabled ? "good" : "warn" } },
    { icon: Clock, metric: { label: "Last seed/reset/archive action", value: lastStewardshipAction } },
    { icon: ShieldCheck, metric: { label: "Cleanup mode", value: stewardshipSummary?.auditPreservingCleanupEnabled ? "Archive only / audit preserved" : "Disabled", tone: stewardshipSummary?.auditPreservingCleanupEnabled ? "good" : "warn" } },
    { icon: Database, metric: { label: "Pilot demo reset tools", value: demoResetStatus.enabled ? "Enabled" : "Disabled", tone: demoResetStatus.enabled ? "good" : "warn" } },
    { icon: Archive, metric: { label: "Smoke/test archive", value: demoResetStatus.smokeTestArchiveEnabled ? "Enabled" : "Disabled", tone: demoResetStatus.smokeTestArchiveEnabled ? "good" : "warn" } },
    { icon: Database, metric: { label: "Demo scenario seeding", value: demoResetStatus.demoScenarioSeedingEnabled ? "Enabled" : "Disabled", tone: demoResetStatus.demoScenarioSeedingEnabled ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Audit preservation", value: demoResetStatus.auditPreservationEnforced ? "Enforced" : "Not enforced", tone: demoResetStatus.auditPreservationEnforced ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "SMS ledger preservation", value: demoResetStatus.smsLedgerPreservationEnforced ? "Enforced" : "Not enforced", tone: demoResetStatus.smsLedgerPreservationEnforced ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Webhook preservation", value: demoResetStatus.webhookPreservationEnforced ? "Enforced" : "Not enforced", tone: demoResetStatus.webhookPreservationEnforced ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Consent preservation", value: demoResetStatus.consentPreservationEnforced ? "Enforced" : "Not enforced", tone: demoResetStatus.consentPreservationEnforced ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Hard delete mode", value: demoResetStatus.hardDeleteMode, tone: demoResetStatus.hardDeleteMode === "disabled" ? "good" : "warn" } },
    { icon: Archive, metric: { label: "Archived workflow rows hidden", value: demoResetStatus.archivedWorkflowRowsHidden ? "Enabled" : "Disabled", tone: demoResetStatus.archivedWorkflowRowsHidden ? "good" : "warn" } },
    { icon: Archive, metric: { label: "Smoke/test active queue exclusion", value: demoResetStatus.smokeTestActiveQueueExclusionEnabled ? "Enabled" : "Disabled", tone: demoResetStatus.smokeTestActiveQueueExclusionEnabled ? "good" : "warn" } },
    { icon: Archive, metric: { label: "Demo reset archive-first", value: demoResetStatus.demoResetArchiveFirst ? "Enabled" : "Disabled", tone: demoResetStatus.demoResetArchiveFirst ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Protected history preserved", value: demoResetStatus.hardDeleteProtectedHistoryDisabled ? "Enforced" : "Not enforced", tone: demoResetStatus.hardDeleteProtectedHistoryDisabled ? "good" : "warn" } },
    { icon: ShieldCheck, metric: { label: "Audit/SMS/webhook/consent hard delete", value: demoResetStatus.hardDeleteProtectedHistoryDisabled ? "Disabled" : "Enabled", tone: demoResetStatus.hardDeleteProtectedHistoryDisabled ? "good" : "warn" } },
    { icon: Database, metric: { label: "Active queue source", value: demoResetStatus.activeQueueSource, tone: "good" } },
    { icon: ShieldCheck, metric: { label: "Real data reset", value: demoResetStatus.realDataResetEnabled ? "Enabled" : "Disabled", tone: demoResetStatus.realDataResetEnabled ? "warn" : "good" } },
    { icon: ShieldCheck, metric: { label: "External reset APIs", value: demoResetStatus.externalResetApisEnabled ? "Enabled" : "Disabled", tone: demoResetStatus.externalResetApisEnabled ? "warn" : "good" } },
  ];

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Pilot operations</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Health Center</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Safe cloud status for the always-on pilot. Values are redacted or reduced to set/missing, mode, port, and timestamps.
          </p>
        </div>
        <div className="rounded-lg border border-line bg-white px-4 py-3 text-sm font-semibold text-slate-700">
          Read-only monitoring · no bulk SMS controls
        </div>
      </div>

      {activitySnapshot.error ? (
        <section className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} />
            Database activity snapshot unavailable
          </div>
          <p className="mt-2">{activitySnapshot.error}</p>
        </section>
      ) : null}

      {dataMode.blockers.length > 0 ? (
        <section className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm leading-6 text-rose-950">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={18} />
            Data mode blockers
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {dataMode.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statusMetrics.map((item) => (
          <HealthCard key={item.metric.label} icon={item.icon} metric={item.metric} />
        ))}
      </section>
    </div>
  );
}
