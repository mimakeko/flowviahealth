import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { getPrismaClient } from "@/lib/db/prisma";
import { formatDate, requirePilotOperationsAccess, statusClassName, statusLabel } from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "Referral Operations",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ReferralListRow = {
  id: string;
  assignedTherapist: { name: string } | null;
  city: string | null;
  createdAt: Date | string;
  patientName: string;
  status: string;
  zip: string | null;
};

export default async function AdminReferralsPage() {
  requirePilotOperationsAccess();

  const prisma = getPrismaClient();
  const referrals = await prisma.patientReferral.findMany({
    include: { assignedTherapist: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const referralRows = referrals as ReferralListRow[];

  return (
    <div className="grid gap-8">
        <div className="flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="eyebrow">Pilot admin</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Referral operations</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Small field-pilot referral queue. Full addresses are intentionally excluded from this list view.
            </p>
          </div>
          <Link href="/admin/referrals/new" className="btn-primary">
            <Plus size={18} />
            New referral
          </Link>
        </div>

        <div className="mt-8 overflow-x-auto rounded-lg border border-line bg-white">
          <table className="min-w-full divide-y divide-line text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Therapist</th>
                <th className="px-4 py-3">City / ZIP</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {referralRows.map((referral: ReferralListRow) => (
                <tr key={referral.id}>
                  <td className="px-4 py-3 font-medium text-ink">{referral.patientName}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>
                      {statusLabel(referral.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{referral.assignedTherapist?.name || "Unassigned"}</td>
                  <td className="px-4 py-3 text-slate-600">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Not provided"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(referral.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/referrals/${referral.id}`} className="font-semibold text-blue underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
              {referralRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <ClipboardList className="mx-auto mb-3 text-slate-400" size={28} />
                    <p className="font-semibold text-ink">No referrals yet</p>
                    <p className="mt-1 text-sm text-slate-500">Seed fake pilot data or create a manual referral to start testing.</p>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
    </div>
  );
}
