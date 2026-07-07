import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CircleAlert, Save, ShieldAlert } from "lucide-react";
import { BlockedNoteAlert } from "@/components/blocked-note-alert";
import { getPrismaClient } from "@/lib/db/prisma";
import { getBlockedOperationalNoteRedirectSearch } from "@/lib/pilot/note-guardrail";
import { requirePilotSession } from "@/lib/pilot/auth";
import { optionalTextField, referralStatusField, REFERRAL_STATUSES, requirePilotOperationsAccess, statusLabel, textField } from "@/lib/pilot/ops";
import {
  evaluateReferralIntakeQuality,
  getReferralDuplicateCandidates,
  type ReferralDuplicateScore,
  type ReferralIntakeDuplicateSource,
} from "@/lib/pilot/referral-intake-quality";

export const metadata: Metadata = {
  title: "New Referral",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type TherapistOption = {
  id: string;
  name: string;
};

type DuplicateReferralRow = {
  assignedTherapist: { name: string } | null;
  assignedTherapistId: string | null;
  city: string | null;
  createdAt: Date;
  id: string;
  patientName: string;
  phone: string;
  status: string;
  visits: { id: string }[];
  zip: string | null;
};

function duplicateSources(rows: DuplicateReferralRow[]): ReferralIntakeDuplicateSource[] {
  return rows.map((row: DuplicateReferralRow) => ({
    assignedTherapistId: row.assignedTherapistId,
    assignedTherapistName: row.assignedTherapist?.name,
    city: row.city,
    createdAt: row.createdAt,
    futureOpenVisitCount: row.visits.length,
    id: row.id,
    patientName: row.patientName,
    phone: row.phone,
    status: row.status,
    zip: row.zip,
  }));
}

function highestDuplicateScore(score: ReferralDuplicateScore | undefined) {
  return score || "none";
}

async function createReferralAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  await requirePilotSession(["admin"], "/admin/referrals/new");

  const prisma = getPrismaClient();
  const patientName = textField(formData.get("patientName"), 160);
  const phone = textField(formData.get("phone"), 40);
  const assignedTherapistId = optionalTextField(formData.get("assignedTherapistId"), 80);
  const notes = optionalTextField(formData.get("notes"), 3000);
  const duplicateOverrideReason = optionalTextField(formData.get("duplicateOverrideReason"), 500);

  if (!patientName || !phone) {
    redirect("/admin/referrals/new?error=missing_required");
  }

  const status = referralStatusField(formData.get("status"));
  const city = optionalTextField(formData.get("city"), 120);
  const zip = optionalTextField(formData.get("zip"), 20);
  const careType = optionalTextField(formData.get("careType"), 160);
  const blockedNoteSearch = await getBlockedOperationalNoteRedirectSearch({
    actorType: "pilot_admin",
    entityType: "PatientReferral",
    extra: { assignedTherapistId: assignedTherapistId || null, status },
    fieldLabel: "Referral note",
    route: "/admin/referrals/new",
    value: notes,
    workflow: "referral_create",
  });
  if (blockedNoteSearch) redirect(`/admin/referrals/new?${blockedNoteSearch}`);

  const duplicateRows = await prisma.patientReferral.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      assignedTherapist: { select: { name: true } },
      assignedTherapistId: true,
      city: true,
      createdAt: true,
      id: true,
      patientName: true,
      phone: true,
      status: true,
      visits: {
        select: { id: true },
        where: { status: { in: ["scheduled", "in_progress"] } },
      },
      zip: true,
    },
    take: 150,
    where: { status: { notIn: ["completed", "canceled"] } },
  });
  const duplicateCandidates = getReferralDuplicateCandidates({
    draft: {
      assignedTherapistId,
      city,
      createdAt: new Date(),
      id: "new-referral-draft",
      patientName,
      phone,
      status,
      zip,
    },
    sources: duplicateSources(duplicateRows as DuplicateReferralRow[]),
  });
  const duplicateReviewRequired = duplicateCandidates.some((candidate) => candidate.score === "high" || candidate.score === "medium");
  const intakeQuality = evaluateReferralIntakeQuality({
    assignedTherapistId,
    careType,
    city,
    duplicateCandidates,
    patientName,
    phone,
    smsConsentStatus: "none",
    status,
    zip,
  });
  if (duplicateReviewRequired && !duplicateOverrideReason) {
    await prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: "referral_duplicate_warning",
        entityType: "PatientReferral",
        metadataJson: {
          duplicateCandidateCount: duplicateCandidates.length,
          duplicateHighestScore: highestDuplicateScore(duplicateCandidates[0]?.score),
          route: "/admin/referrals/new",
          source: "deterministic_local",
          workflow: "referral_create",
        },
      },
    }).catch(() => undefined);
    redirect(`/admin/referrals/new?error=duplicate_review_required&duplicateCount=${duplicateCandidates.length}&duplicateScore=${highestDuplicateScore(duplicateCandidates[0]?.score)}`);
  }

  if (duplicateCandidates.length > 0 && duplicateOverrideReason) {
    const duplicateOverrideBlockedSearch = await getBlockedOperationalNoteRedirectSearch({
      actorType: "pilot_admin",
      entityType: "PatientReferral",
      extra: {
        duplicateCandidateCount: duplicateCandidates.length,
        duplicateHighestScore: highestDuplicateScore(duplicateCandidates[0]?.score),
        workflow: "referral_duplicate_override",
      },
      fieldLabel: "Duplicate override reason",
      route: "/admin/referrals/new",
      value: duplicateOverrideReason,
      workflow: "referral_duplicate_override",
    });
    if (duplicateOverrideBlockedSearch) redirect(`/admin/referrals/new?${duplicateOverrideBlockedSearch}`);
  }

  const referral = await prisma.patientReferral.create({
    data: {
      patientName,
      phone,
      email: optionalTextField(formData.get("email"), 160),
      city,
      zip,
      address: optionalTextField(formData.get("address"), 240),
      referralSource: optionalTextField(formData.get("referralSource"), 160),
      careType,
      notes,
      status,
      assignedTherapistId,
    },
  });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: "referral_created",
        entityType: "PatientReferral",
        entityId: referral.id,
        metadataJson: {
          assignedTherapistId: assignedTherapistId || null,
          hasOperationalNote: Boolean(notes),
          readinessLevel: intakeQuality.readinessLevel,
          status: referral.status,
          warningCodes: intakeQuality.warnings.map((item) => item.code).join(","),
        },
      },
    }),
    duplicateCandidates.length > 0
      ? prisma.auditLog.create({
          data: {
            actorType: "pilot_admin",
            action: duplicateOverrideReason ? "referral_duplicate_override" : "referral_duplicate_warning",
            entityType: "PatientReferral",
            entityId: referral.id,
            metadataJson: {
              duplicateCandidateCount: duplicateCandidates.length,
              duplicateHighestScore: highestDuplicateScore(duplicateCandidates[0]?.score),
              overrideReasonProvided: Boolean(duplicateOverrideReason),
              source: "deterministic_local",
              workflow: "referral_create",
            },
          },
        })
      : Promise.resolve(),
  ]);

  redirect(`/admin/referrals/${referral.id}`);
}

export default async function NewReferralPage({
  searchParams,
}: {
  searchParams?: Promise<{ duplicateCount?: string; duplicateScore?: string; error?: string; noteCategory?: string; noteDestination?: string; noteSuggestion?: string }>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const prisma = getPrismaClient();
  const therapists = await prisma.therapist.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const therapistOptions = therapists as TherapistOption[];
  const emptyIntakePreview = evaluateReferralIntakeQuality({
    status: "new",
  });

  return (
    <div className="max-w-4xl">
      <Link href="/admin/referrals" className="inline-flex items-center gap-2 text-sm font-semibold text-blue underline">
        <ArrowLeft size={16} />
        Back to referrals
      </Link>
      <div className="mt-4 border-b border-line pb-4 sm:mt-6 sm:pb-6">
        <p className="eyebrow">Pilot admin</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-.03em] text-ink sm:mt-3 sm:text-3xl">Create referral</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">Manual review required. Keep notes operational and no-PHI.</p>
      </div>

      <BlockedNoteAlert searchParams={params} />

      {params?.error === "missing_required" ? (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900 sm:mt-6">
          Patient name and phone are required.
        </p>
      ) : null}

      {params?.error === "duplicate_review_required" ? (
        <div role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 sm:mt-6">
          <div className="flex items-center gap-2 font-semibold"><CircleAlert size={18} />Duplicate checks require review.</div>
          <details className="mt-2">
            <summary className="cursor-pointer list-none text-sm font-semibold text-amber-950 underline [&::-webkit-details-marker]:hidden">Duplicate checks</summary>
            <p className="mt-2">The local duplicate guard found {params.duplicateCount || "one or more"} possible match{params.duplicateCount === "1" ? "" : "es"} with {params.duplicateScore || "review"} confidence. Review existing referrals, then enter an operational duplicate override reason if this fake referral should still be created.</p>
          </details>
        </div>
      ) : null}

      <form action={createReferralAction} className="mt-6 grid gap-5 rounded-lg border border-line bg-white p-4 sm:p-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <h2 className="text-lg font-semibold tracking-[-.02em] text-ink">Referral form</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">Manual review required.</p>
        </div>
        <label className="text-sm font-semibold text-ink">Patient name<input className="field" name="patientName" required /></label>
        <label className="text-sm font-semibold text-ink">Phone<input className="field" name="phone" required inputMode="tel" /></label>
        <label className="text-sm font-semibold text-ink">Email <span className="font-normal text-slate-400">(optional)</span><input className="field" name="email" type="email" /></label>
        <label className="text-sm font-semibold text-ink">Target city <span className="font-normal text-slate-400">(optional)</span><input className="field" name="city" /></label>
        <label className="text-sm font-semibold text-ink">Target ZIP <span className="font-normal text-slate-400">(optional)</span><input className="field" name="zip" inputMode="numeric" /></label>
        <label className="text-sm font-semibold text-ink">Service area / workflow type <span className="font-normal text-slate-400">(optional)</span><input className="field" name="careType" placeholder="Example: demo mobility visit" /></label>
        <label className="text-sm font-semibold text-ink md:col-span-2">Address <span className="font-normal text-slate-400">(optional, restricted)</span><input className="field" name="address" /></label>
        <label className="text-sm font-semibold text-ink">Referral source <span className="font-normal text-slate-400">(optional)</span><input className="field" name="referralSource" /></label>
        <label className="text-sm font-semibold text-ink">Status<select className="field" name="status" defaultValue="new">{REFERRAL_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
        <label className="text-sm font-semibold text-ink md:col-span-2">Assigned therapist<select className="field" name="assignedTherapistId" defaultValue=""><option value="">Unassigned</option>{therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
        <details className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 md:col-span-2">
          <summary className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">Manual review required</summary>
          <p className="mt-2">No PHI in intake notes. Use scheduling, access, assignment, or status wording only; no diagnosis, treatment, symptoms, medications, clinical measurements, addresses, or clinical details.</p>
        </details>
        <label className="text-sm font-semibold text-ink md:col-span-2">Internal operational note <span className="font-normal text-slate-400">(optional, no PHI or clinical detail)</span><textarea className="field min-h-32" name="notes" placeholder="Fake scheduling/admin note only" /></label>
        <label className="text-sm font-semibold text-ink md:col-span-2">Duplicate override reason <span className="font-normal text-slate-400">(only if the duplicate guard warns)</span><textarea className="field min-h-24" name="duplicateOverrideReason" placeholder="Example: Separate fake pilot test case; reviewed existing referral." /></label>
        <div className="md:col-span-2">
          <button className="btn-primary w-full justify-center sm:w-auto" type="submit"><Save size={18} />Create referral</button>
        </div>
      </form>

      <details className="mt-4 rounded-lg border border-line bg-white p-4 sm:mt-6 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <span>Intake checks</span>
          <ShieldAlert size={18} className="text-blue" />
        </summary>
        <div className="mt-4 grid gap-4">
          <p className="text-sm leading-6 text-slate-600">The server checks missing intake data, scheduling readiness, local duplicate signals, opt-out state, and no-PHI note safety before this referral reaches scheduling or therapist work.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {emptyIntakePreview.warnings.slice(0, 5).map((item) => (
              <div key={item.code} className="rounded-lg border border-line bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-ink">{item.label}</p>
                <p className="mt-1 text-slate-600">{item.nextAction}</p>
              </div>
            ))}
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950">Duplicate guard is warning-only and local-data-only. It never auto-assigns therapists, creates visits, sends SMS, or calls external duplicate APIs.</p>
        </div>
      </details>
    </div>
  );
}
