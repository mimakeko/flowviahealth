import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { getPrismaClient } from "@/lib/db/prisma";
import { formatDateTime, requirePilotOperationsAccess, statusClassName, statusLabel } from "@/lib/pilot/ops";

export const metadata: Metadata = {
  title: "Visit Operations",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type VisitListRow = {
  id: string;
  scheduledAt: Date | string | null;
  status: string;
  referral: {
    city: string | null;
    patientName: string;
    zip: string | null;
  };
  therapist: { name: string } | null;
};

export default async function AdminVisitsPage() {
  requirePilotOperationsAccess();

  const prisma = getPrismaClient();
  const visits = await prisma.visit.findMany({
    include: {
      referral: {
        select: {
          city: true,
          id: true,
          patientName: true,
          status: true,
          zip: true,
        },
      },
      therapist: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
  const visitRows = visits as VisitListRow[];

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-5 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="eyebrow">Pilot admin</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.03em] text-ink sm:text-4xl">Visit operations</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Schedule and track fake field-pilot visits. No clinical notes or real patient data belong here.
          </p>
        </div>
        <Link href="/admin/visits/new" className="btn-primary">
          <Plus size={18} />
          New visit
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        {visitRows.map((visit: VisitListRow) => (
          <Link key={visit.id} href={`/admin/visits/${visit.id}`} className="grid gap-3 border-b border-line p-4 transition last:border-b-0 hover:bg-slate-50 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-ink">{visit.referral.patientName}</p>
                <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(visit.status)}`}>{statusLabel(visit.status)}</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {visit.therapist?.name || "Unassigned"} · {[visit.referral.city, visit.referral.zip].filter(Boolean).join(" / ") || "Location not provided"}
              </p>
            </div>
            <p className="text-sm text-slate-500">{formatDateTime(visit.scheduledAt)}</p>
          </Link>
        ))}
        {visitRows.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarClock className="mx-auto mb-3 text-slate-400" size={28} />
            <p className="font-semibold text-ink">No visits yet</p>
            <p className="mt-1 text-sm text-slate-500">Create a visit from a referral detail page or the visit form.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
