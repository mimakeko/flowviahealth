import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, Archive, Database, ListChecks, RefreshCw, ShieldCheck } from "lucide-react";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  ARCHIVE_FAKE_DATA_CONFIRMATION,
  ARCHIVE_SMOKE_TEST_DATA_CONFIRMATION,
  archiveCompletedCanceledFakeReferrals,
  archiveSmokeTestOperationalRecords,
  DEMO_SCENARIO_OPTIONS,
  getPilotDataStewardshipSummary,
  MARK_TEST_PHONE_OPTED_OUT_CONFIRMATION,
  markConfiguredPersonalTestPhoneOptedOut,
  REFRESH_FAKE_DATA_CONFIRMATION,
  RESET_DEMO_SCENARIOS_CONFIRMATION,
  resetDemoScenarios,
  seedOrRefreshFakePilotData,
  validateStewardshipConfirmation,
} from "@/lib/pilot/data-stewardship";
import { requirePilotSession } from "@/lib/pilot/auth";
import { formatDateTime, requirePilotOperationsAccess, textField } from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "Data Stewardship",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type StewardshipSearchParams = {
  error?: string;
  result?: string;
};

const stewardshipResultMessages = {
  archive_fake: "Completed/canceled fake workflows archived. Protected history preserved.",
  archive_smoke: "Smoke-test operational records archived. Protected history preserved.",
  mark_test_phone_opted_out: "Configured personal test phone marked opted out. Protected history preserved.",
  refresh_fake: "Fake pilot data refreshed. Protected history preserved.",
  reset_demo: "Demo scenarios reset. Protected history preserved.",
} as const;

const stewardshipErrorMessages = {
  archive_fake_confirmation: "Confirmation text did not match ARCHIVE FAKE DATA.",
  archive_smoke_confirmation: "Confirmation text did not match ARCHIVE SMOKE TEST DATA.",
  mark_test_phone_opted_out_confirmation: "Confirmation text did not match MARK TEST PHONE OPTED OUT.",
  refresh_fake_confirmation: "Confirmation text did not match REFRESH FAKE DATA.",
  reset_demo_confirmation: "Confirmation text did not match RESET DEMO SCENARIOS.",
  safe_failure: "Data Stewardship action failed safely. Protected history was not deleted.",
} as const;

type StewardshipResultKey = keyof typeof stewardshipResultMessages;
type StewardshipErrorKey = keyof typeof stewardshipErrorMessages;

type StewardshipCard = {
  label: string;
  value: string;
  tone?: "good" | "warn" | "neutral";
};

function cardToneClassName(tone: StewardshipCard["tone"] = "neutral") {
  if (tone === "good") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (tone === "warn") return "border-amber-200 bg-amber-50 text-amber-950";
  return "border-line bg-white text-ink";
}

function redirectWithResult(result: StewardshipResultKey) {
  redirect(`/admin/data?result=${encodeURIComponent(result)}`);
}

function redirectWithError(error: StewardshipErrorKey) {
  redirect(`/admin/data?error=${encodeURIComponent(error)}`);
}

function safeResultMessage(value: string | undefined) {
  if (!value) return null;
  return stewardshipResultMessages[value as StewardshipResultKey] ?? null;
}

function safeErrorMessage(value: string | undefined) {
  if (!value) return null;
  return stewardshipErrorMessages[value as StewardshipErrorKey] ?? stewardshipErrorMessages.safe_failure;
}

function exactConfirmationPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function seedFakeDataAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/data");
  const confirmation = textField(formData.get("confirmation"), 80);
  if (!validateStewardshipConfirmation(confirmation, REFRESH_FAKE_DATA_CONFIRMATION)) {
    redirectWithError("refresh_fake_confirmation");
  }

  const prisma = getPrismaClient();
  try {
    await seedOrRefreshFakePilotData(prisma, session.email);
  } catch {
    redirectWithError("safe_failure");
  }
  redirectWithResult("refresh_fake");
}

async function archiveFakeDataAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/data");
  const confirmation = textField(formData.get("confirmation"), 80);
  if (!validateStewardshipConfirmation(confirmation, ARCHIVE_FAKE_DATA_CONFIRMATION)) {
    redirectWithError("archive_fake_confirmation");
  }

  const prisma = getPrismaClient();
  try {
    await archiveCompletedCanceledFakeReferrals(prisma, session.email);
  } catch {
    redirectWithError("safe_failure");
  }
  redirectWithResult("archive_fake");
}

async function clearSmokeDataAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/data");
  const confirmation = textField(formData.get("confirmation"), 80);
  if (!validateStewardshipConfirmation(confirmation, ARCHIVE_SMOKE_TEST_DATA_CONFIRMATION)) {
    redirectWithError("archive_smoke_confirmation");
  }

  try {
    const prisma = getPrismaClient();
    await archiveSmokeTestOperationalRecords(prisma, session.email, confirmation);
  } catch {
    redirectWithError("safe_failure");
  }
  redirectWithResult("archive_smoke");
}

async function resetDemoScenariosAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/data");
  const confirmation = textField(formData.get("confirmation"), 80);
  const scenarios = formData.getAll("scenario").filter((item): item is string => typeof item === "string");
  if (!validateStewardshipConfirmation(confirmation, RESET_DEMO_SCENARIOS_CONFIRMATION)) {
    redirectWithError("reset_demo_confirmation");
  }

  try {
    const prisma = getPrismaClient();
    await resetDemoScenarios(prisma, session.email, confirmation, scenarios);
  } catch {
    redirectWithError("safe_failure");
  }
  redirectWithResult("reset_demo");
}

async function markPersonalTestPhoneOptedOutAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/data");
  const confirmation = textField(formData.get("confirmation"), 80);
  if (!validateStewardshipConfirmation(confirmation, MARK_TEST_PHONE_OPTED_OUT_CONFIRMATION)) {
    redirectWithError("mark_test_phone_opted_out_confirmation");
  }

  try {
    const prisma = getPrismaClient();
    await markConfiguredPersonalTestPhoneOptedOut(prisma, session.email, confirmation);
  } catch {
    redirectWithError("safe_failure");
  }
  redirectWithResult("mark_test_phone_opted_out");
}

function WarningList() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle size={18} />
        Stewardship safeguards
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <li>No PHI, real patient data, diagnosis, treatment detail, or raw SMS content belongs in these tools.</li>
        <li>Audit logs, SMS consent records, SMS messages, and Telnyx webhook events are preserved.</li>
        <li>Cleanup archives operational fake/smoke records instead of deleting audit history.</li>
        <li>Real SMS is not sent by any Data Stewardship action.</li>
        <li>Demo reset tools are fake-data only and do not reset real-looking operational records.</li>
      </ul>
    </div>
  );
}

function DemoScenarioPanel() {
  return (
    <form action={resetDemoScenariosAction} className="rounded-lg border border-line bg-white p-5 xl:col-span-2">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-ice p-2 text-blue"><ListChecks size={20} /></div>
        <div>
          <h2 className="text-lg font-semibold tracking-[-.02em] text-ink">Reset demo scenarios</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Archives old demo operational rows, keeps protected history tables intact, and seeds selected fake/demo scenarios for referrals, scheduling, visits, and therapist field workflow.
          </p>
        </div>
      </div>
      <WarningList />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {DEMO_SCENARIO_OPTIONS.map((scenario) => (
          <label key={scenario.key} className="flex gap-3 rounded-lg border border-line bg-slate-50 p-3 text-sm leading-6">
            <input className="mt-1 h-4 w-4 shrink-0" type="checkbox" name="scenario" value={scenario.key} defaultChecked />
            <span>
              <span className="block font-semibold text-ink">{scenario.label}</span>
              <span className="block text-slate-600">{scenario.description}</span>
            </span>
          </label>
        ))}
      </div>
      <label className="mt-4 block text-sm font-semibold text-ink">
        Confirmation
        <input className="field" name="confirmation" pattern={exactConfirmationPattern(RESET_DEMO_SCENARIOS_CONFIRMATION)} placeholder={RESET_DEMO_SCENARIOS_CONFIRMATION} required />
      </label>
      <p className="mt-2 text-xs font-semibold text-slate-500">Type exactly: {RESET_DEMO_SCENARIOS_CONFIRMATION}</p>
      <button className="btn-primary mt-4" type="submit">Reset demo scenarios</button>
    </form>
  );
}

function ActionPanel({
  action,
  buttonLabel,
  confirmation,
  description,
  icon: Icon,
  title,
}: {
  action: (formData: FormData) => Promise<void>;
  buttonLabel: string;
  confirmation: string;
  description: string;
  icon: typeof Database;
  title: string;
}) {
  return (
    <form action={action} className="rounded-lg border border-line bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-ice p-2 text-blue"><Icon size={20} /></div>
        <div>
          <h2 className="text-lg font-semibold tracking-[-.02em] text-ink">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      <WarningList />
      <label className="mt-4 block text-sm font-semibold text-ink">
        Confirmation
        <input className="field" name="confirmation" pattern={exactConfirmationPattern(confirmation)} placeholder={confirmation} required />
      </label>
      <p className="mt-2 text-xs font-semibold text-slate-500">Type exactly: {confirmation}</p>
      <button className="btn-primary mt-4" type="submit">{buttonLabel}</button>
    </form>
  );
}

export default async function AdminDataStewardshipPage({
  searchParams,
}: {
  searchParams?: Promise<StewardshipSearchParams>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const prisma = getPrismaClient();
  const summary = await getPilotDataStewardshipSummary(prisma);
  const resultMessage = safeResultMessage(params?.result);
  const errorMessage = safeErrorMessage(params?.error);
  const lastAction = summary.lastStewardshipAudit
    ? `${summary.lastStewardshipAudit.action} / ${formatDateTime(summary.lastStewardshipAudit.createdAt)}`
    : "Not recorded";
  const cards: StewardshipCard[] = [
    { label: "Active demo referrals", value: `${summary.activeDemoReferralCount}` },
    { label: "Active smoke/test referrals", value: `${summary.activeSmokeReferralCount}`, tone: summary.activeSmokeReferralCount > 0 ? "warn" : "good" },
    { label: "Active demo visits", value: `${summary.activeDemoVisitCount}` },
    { label: "Active smoke/test visits", value: `${summary.activeSmokeVisitCount}`, tone: summary.activeSmokeVisitCount > 0 ? "warn" : "good" },
    { label: "Terminal demo records", value: `${summary.terminalDemoRecordCount}` },
    { label: "Archived fake referrals", value: `${summary.archivedFakeReferralCount}` },
    { label: "Archived fake visits", value: `${summary.archivedFakeVisitCount}` },
    { label: "Audit activity, last 24h", value: `${summary.recentAuditLogCount}` },
    { label: "SMS consent enrollments", value: `${summary.smsConsentEnrollmentCount}` },
    { label: "SMS messages", value: `${summary.smsMessageCount}` },
    { label: "Telnyx webhook events", value: `${summary.telnyxWebhookEventCount}` },
    { label: "Audit logs preserved", value: `${summary.auditLogCount}`, tone: summary.auditPreservingCleanupEnabled ? "good" : "warn" },
    { label: "Protected history", value: "SMS / consent / webhook preserved", tone: "good" },
    { label: "Hard delete mode", value: summary.hardDeleteMode, tone: summary.hardDeleteMode === "disabled" ? "good" : "warn" },
    { label: "Personal-number test mode", value: summary.personalNumberTestModeStatus, tone: summary.personalTestEnrollment.configured ? "neutral" : "warn" },
    { label: "Real SMS gate", value: summary.realSmsGateStatus, tone: summary.realSmsGateStatus === "Off" ? "good" : "warn" },
    { label: "Data mode", value: summary.dataModeLabel, tone: summary.dataModeLabel.toLowerCase().includes("phi") ? "good" : "neutral" },
    { label: "Last stewardship action", value: lastAction },
  ];

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-5 border-b border-line pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Pilot admin</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Data Stewardship</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Audit-preserving tools for fake and personal-number pilot data. This page does not expose PHI, raw SMS bodies, secrets, or bulk messaging controls.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          <ShieldCheck size={18} />
          Admin only
        </div>
      </div>

      {resultMessage ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">{resultMessage}</p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-950">{errorMessage}</p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className={`rounded-lg border p-5 ${cardToneClassName(card.tone)}`}>
            <p className="text-sm font-semibold text-slate-600">{card.label}</p>
            <p className="mt-3 break-words text-2xl font-semibold tracking-[-.02em]">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <ActionPanel
          action={seedFakeDataAction}
          buttonLabel="Refresh fake data"
          confirmation={REFRESH_FAKE_DATA_CONFIRMATION}
          description="Rebuilds the known demo therapists, referrals, and visits. Existing seed audit history is preserved. No SMS is sent."
          icon={RefreshCw}
          title="Seed / refresh fake pilot data"
        />
        <ActionPanel
          action={archiveFakeDataAction}
          buttonLabel="Archive fake workflows"
          confirmation={ARCHIVE_FAKE_DATA_CONFIRMATION}
          description="Archives completed or canceled fake referrals by adding a safe stewardship marker to operational notes. Records and audit logs remain queryable."
          icon={Archive}
          title="Archive completed/canceled fake referrals"
        />
        <ActionPanel
          action={clearSmokeDataAction}
          buttonLabel="Archive smoke-test data"
          confirmation={ARCHIVE_SMOKE_TEST_DATA_CONFIRMATION}
          description="Targets only explicit smoke-test operational referrals/visits and deactivates smoke therapists. SMS and audit tables are not deleted."
          icon={Archive}
          title="Archive smoke-test operational records"
        />
        <DemoScenarioPanel />
        <ActionPanel
          action={markPersonalTestPhoneOptedOutAction}
          buttonLabel="Mark opted out"
          confirmation={MARK_TEST_PHONE_OPTED_OUT_CONFIRMATION}
          description={summary.personalTestEnrollment.configured ? "Marks the configured personal test phone enrollment as opted_out without sending SMS or deleting message history." : "No personal test phone is configured. Set FLOWVIA_PERSONAL_TEST_PHONE only when a known owner test number needs safe stewardship."}
          icon={ShieldCheck}
          title="Personal-number test cleanup"
        />
      </section>
    </div>
  );
}
