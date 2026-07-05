import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, Archive, Database, RefreshCw, ShieldCheck } from "lucide-react";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  ARCHIVE_FAKE_DATA_CONFIRMATION,
  archiveCompletedCanceledFakeReferrals,
  archiveSmokeTestOperationalRecords,
  CLEAR_TEST_DATA_CONFIRMATION,
  getPilotDataStewardshipSummary,
  MARK_TEST_PHONE_OPTED_OUT_CONFIRMATION,
  markConfiguredPersonalTestPhoneOptedOut,
  REFRESH_FAKE_DATA_CONFIRMATION,
  seedOrRefreshFakePilotData,
  validateStewardshipConfirmation,
} from "@/lib/pilot/data-stewardship";
import { requirePilotSession } from "@/lib/pilot/auth";
import { formatDateTime, requirePilotOperationsAccess, statusLabel, textField } from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "Data Stewardship",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type StewardshipSearchParams = {
  error?: string;
  result?: string;
};

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

function redirectWithResult(result: string) {
  redirect(`/admin/data?result=${encodeURIComponent(result)}`);
}

function redirectWithError(error: string) {
  redirect(`/admin/data?error=${encodeURIComponent(error)}`);
}

async function seedFakeDataAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/data");
  const confirmation = textField(formData.get("confirmation"), 80);
  if (!validateStewardshipConfirmation(confirmation, REFRESH_FAKE_DATA_CONFIRMATION)) {
    redirectWithError("Type REFRESH FAKE DATA to refresh fake pilot data.");
  }

  const prisma = getPrismaClient();
  const result = await seedOrRefreshFakePilotData(prisma, session.email);
  redirectWithResult(`Fake pilot data refreshed: ${result.referralCount} referrals, ${result.visitCount} visits, ${result.therapistCount} therapists.`);
}

async function archiveFakeDataAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/data");
  const confirmation = textField(formData.get("confirmation"), 80);
  if (!validateStewardshipConfirmation(confirmation, ARCHIVE_FAKE_DATA_CONFIRMATION)) {
    redirectWithError("Type ARCHIVE FAKE DATA to archive completed/canceled fake referrals.");
  }

  const prisma = getPrismaClient();
  const result = await archiveCompletedCanceledFakeReferrals(prisma, session.email);
  redirectWithResult(`Archived ${result.referralCount} completed/canceled fake referrals and ${result.visitCount} attached visits.`);
}

async function clearSmokeDataAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/data");
  const confirmation = textField(formData.get("confirmation"), 80);

  try {
    const prisma = getPrismaClient();
    const result = await archiveSmokeTestOperationalRecords(prisma, session.email, confirmation);
    redirectWithResult(`Archived ${result.referralCount} smoke referrals, ${result.visitCount} smoke visits, and deactivated ${result.therapistCount} smoke therapists.`);
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Smoke cleanup failed safely.");
  }
}

async function markPersonalTestPhoneOptedOutAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/data");
  const confirmation = textField(formData.get("confirmation"), 80);

  try {
    const prisma = getPrismaClient();
    const result = await markConfiguredPersonalTestPhoneOptedOut(prisma, session.email, confirmation);
    redirectWithResult(`Personal test phone status: ${result.maskedPhone} / ${statusLabel(result.status)}${result.changed ? "" : " (unchanged)"}.`);
  } catch (error) {
    redirectWithError(error instanceof Error ? error.message : "Personal test cleanup failed safely.");
  }
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
      </ul>
    </div>
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
        <input className="field" name="confirmation" placeholder={confirmation} />
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
  const lastAction = summary.lastStewardshipAudit
    ? `${summary.lastStewardshipAudit.action} / ${formatDateTime(summary.lastStewardshipAudit.createdAt)}`
    : "Not recorded";
  const cards: StewardshipCard[] = [
    { label: "Total fake referrals", value: `${summary.fakeReferralCount}` },
    { label: "Total fake visits", value: `${summary.fakeVisitCount}` },
    { label: "Archived fake referrals", value: `${summary.archivedFakeReferralCount}` },
    { label: "Total therapists", value: `${summary.therapistCount}` },
    { label: "SMS consent enrollments", value: `${summary.smsConsentEnrollmentCount}` },
    { label: "SMS messages", value: `${summary.smsMessageCount}` },
    { label: "Telnyx webhook events", value: `${summary.telnyxWebhookEventCount}` },
    { label: "Audit logs", value: `${summary.auditLogCount}` },
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

      {params?.result ? (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">{params.result}</p>
      ) : null}
      {params?.error ? (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-950">{params.error}</p>
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
          confirmation={CLEAR_TEST_DATA_CONFIRMATION}
          description="Targets only explicit smoke-test operational referrals/visits and deactivates smoke therapists. SMS and audit tables are not deleted."
          icon={Archive}
          title="Clear smoke-test operational records"
        />
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
