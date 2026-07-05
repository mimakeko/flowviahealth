import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  formatDateTime,
  requirePilotOperationsAccess,
  statusClassName,
  statusLabel,
  type VisitStatusValue,
  VISIT_STATUSES,
} from "@/lib/pilot/ops";

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

type TherapistFilterOption = {
  id: string;
  name: string;
};

export default async function AdminVisitsPage({
  searchParams,
}: {
  searchParams?: Promise<{ group?: string; status?: string; therapistId?: string }>;
}) {
  requirePilotOperationsAccess();

  const params = await searchParams;
  const selectedStatus = VISIT_STATUSES.includes(params?.status as VisitStatusValue) ? (params?.status as VisitStatusValue) : "";
  const selectedTherapistId = params?.therapistId || "";
  const selectedGroup = params?.group === "upcoming" || params?.group === "unscheduled" ? params.group : "";
  const now = new Date();
  const upcomingStatuses: VisitStatusValue[] = ["scheduled", "in_progress"];
  const visitFilters: Prisma.VisitWhereInput[] = [];

  if (selectedStatus) visitFilters.push({ status: selectedStatus });
  if (selectedTherapistId === "unassigned") visitFilters.push({ therapistId: null });
  if (selectedTherapistId && selectedTherapistId !== "unassigned") visitFilters.push({ therapistId: selectedTherapistId });
  if (selectedGroup === "upcoming") visitFilters.push({ scheduledAt: { gte: now }, status: { in: upcomingStatuses } });
  if (selectedGroup === "unscheduled") visitFilters.push({ OR: [{ scheduledAt: null }, { status: "unscheduled" }] });

  const prisma = getPrismaClient();
  const [visits, therapists] = await Promise.all([
    prisma.visit.findMany({
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
      where: visitFilters.length > 0 ? { AND: visitFilters } : undefined,
    }),
    prisma.therapist.findMany({
      orderBy: { name: "asc" },
      where: { active: true },
    }),
  ]);
  const visitRows = visits as VisitListRow[];
  const therapistOptions = therapists as TherapistFilterOption[];

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

      <form className="rounded-lg border border-line bg-white p-5">
        <div className="grid gap-4 md:grid-cols-5">
          <label className="text-sm font-semibold text-ink">
            Visit status
            <select className="field" name="status" defaultValue={selectedStatus}>
              <option value="">All statuses</option>
              {VISIT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            Therapist
            <select className="field" name="therapistId" defaultValue={selectedTherapistId}>
              <option value="">All therapists</option>
              <option value="unassigned">Unassigned</option>
              {therapistOptions.map((therapist: TherapistFilterOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            Queue
            <select className="field" name="group" defaultValue={selectedGroup}>
              <option value="">All visits</option>
              <option value="upcoming">Upcoming</option>
              <option value="unscheduled">Needs scheduling</option>
            </select>
          </label>
          <div className="flex items-end md:col-span-2">
            <div className="grid w-full grid-cols-2 gap-2">
              <button className="btn-primary justify-center" type="submit">Apply</button>
              <Link href="/admin/visits" className="btn-secondary justify-center">Reset</Link>
            </div>
          </div>
        </div>
      </form>

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
