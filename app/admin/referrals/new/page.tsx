import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { BlockedNoteAlert } from "@/components/blocked-note-alert";
import { getPrismaClient } from "@/lib/db/prisma";
import { getBlockedOperationalNoteRedirectSearch } from "@/lib/pilot/note-guardrail";
import { requirePilotSession } from "@/lib/pilot/auth";
import { optionalTextField, referralStatusField, REFERRAL_STATUSES, requirePilotOperationsAccess, statusLabel, textField } from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "New Referral",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type TherapistOption = {
  id: string;
  name: string;
};

async function createReferralAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  await requirePilotSession(["admin"], "/admin/referrals/new");

  const prisma = getPrismaClient();
  const patientName = textField(formData.get("patientName"), 160);
  const phone = textField(formData.get("phone"), 40);
  const assignedTherapistId = optionalTextField(formData.get("assignedTherapistId"), 80);
  const notes = optionalTextField(formData.get("notes"), 3000);

  if (!patientName || !phone) {
    redirect("/admin/referrals/new?error=missing_required");
  }

  const status = referralStatusField(formData.get("status"));
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

  const referral = await prisma.patientReferral.create({
    data: {
      patientName,
      phone,
      email: optionalTextField(formData.get("email"), 160),
      city: optionalTextField(formData.get("city"), 120),
      zip: optionalTextField(formData.get("zip"), 20),
      address: optionalTextField(formData.get("address"), 240),
      referralSource: optionalTextField(formData.get("referralSource"), 160),
      careType: optionalTextField(formData.get("careType"), 160),
      notes,
      status,
      assignedTherapistId,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: "pilot_admin",
      action: "referral_created",
      entityType: "PatientReferral",
      entityId: referral.id,
      metadataJson: {
        assignedTherapistId: assignedTherapistId || null,
        hasOperationalNote: Boolean(notes),
        status: referral.status,
      },
    },
  });

  redirect(`/admin/referrals/${referral.id}`);
}

export default async function NewReferralPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; noteCategory?: string; noteDestination?: string; noteSuggestion?: string }>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const prisma = getPrismaClient();
  const therapists = await prisma.therapist.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const therapistOptions = therapists as TherapistOption[];

  return (
    <div className="max-w-4xl">
        <Link href="/admin/referrals" className="inline-flex items-center gap-2 text-sm font-semibold text-blue underline">
          <ArrowLeft size={16} />
          Back to referrals
        </Link>
        <div className="mt-6 border-b border-line pb-6">
          <p className="eyebrow">Pilot admin</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink">Create referral</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Manual intake for field-pilot testing. Do not enter PHI unless the pilot access model is approved.</p>
        </div>

        <BlockedNoteAlert searchParams={params} />

        {params?.error === "missing_required" ? (
          <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900">
            Patient name and phone are required.
          </p>
        ) : null}

        <form action={createReferralAction} className="mt-8 grid gap-6 rounded-lg border border-line bg-white p-6 md:grid-cols-2">
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
          <label className="text-sm font-semibold text-ink md:col-span-2">Internal operational note <span className="font-normal text-slate-400">(optional, no PHI or clinical detail)</span><textarea className="field min-h-32" name="notes" placeholder="Fake scheduling/admin note only" /></label>
          <div className="md:col-span-2">
            <button className="btn-primary" type="submit"><Save size={18} />Create referral</button>
          </div>
        </form>
    </div>
  );
}
