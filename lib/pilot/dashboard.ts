import { getPrismaClient } from "@/lib/db/prisma";

const recentAuditWindowDays = 7;

export type PilotDashboardSnapshot = Awaited<ReturnType<typeof getPilotDashboardSnapshot>>;
export type TherapistDashboardSnapshot = Awaited<ReturnType<typeof getTherapistDashboardSnapshot>>;

export async function getPilotDashboardSnapshot() {
  const prisma = getPrismaClient();
  const recentAuditSince = new Date(Date.now() - recentAuditWindowDays * 24 * 60 * 60 * 1000);

  const [
    referralStatusGroups,
    totalReferrals,
    scheduledVisits,
    unscheduledVisits,
    completedVisits,
    pendingSmsConsent,
    optedOutSmsConsent,
    smsMessagesByDirection,
    recentAuditActivity,
    activeTherapists,
    upcomingVisits,
    recentReferrals,
    recentAuditEvents,
    recentSmsMessages,
  ] = await Promise.all([
    prisma.patientReferral.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.patientReferral.count(),
    prisma.visit.count({ where: { status: { in: ["scheduled", "in_progress"] } } }),
    prisma.visit.count({ where: { status: "unscheduled" } }),
    prisma.visit.count({ where: { status: "completed" } }),
    prisma.smsConsentEnrollment.count({ where: { status: "pending_confirmation" } }),
    prisma.smsConsentEnrollment.count({ where: { status: "opted_out" } }),
    prisma.smsMessage.groupBy({
      by: ["direction"],
      _count: { _all: true },
      where: { createdAt: { gte: recentAuditSince } },
    }),
    prisma.auditLog.count({ where: { createdAt: { gte: recentAuditSince } } }),
    prisma.therapist.count({ where: { active: true } }),
    prisma.visit.findMany({
      include: {
        referral: {
          select: {
            city: true,
            patientName: true,
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
      take: 5,
      where: {
        status: { in: ["scheduled", "in_progress"] },
      },
    }),
    prisma.patientReferral.findMany({
      include: {
        assignedTherapist: {
          select: {
            name: true,
          },
        },
        visits: {
          orderBy: { scheduledAt: "asc" },
          select: {
            scheduledAt: true,
            status: true,
          },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        actorType: true,
        createdAt: true,
        entityType: true,
      },
      take: 6,
    }),
    prisma.smsMessage.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        direction: true,
        eventType: true,
        status: true,
      },
      take: 6,
    }),
  ]);

  const referralCounts = {
    active: 0,
    canceled: 0,
    completed: 0,
    contacted: 0,
    new: 0,
    scheduled: 0,
  };
  for (const group of referralStatusGroups) {
    referralCounts[group.status] = group._count._all;
  }

  const recentSmsActivitySummary = {
    inbound: smsMessagesByDirection.find((group) => group.direction === "inbound")?._count._all ?? 0,
    outbound: smsMessagesByDirection.find((group) => group.direction === "outbound")?._count._all ?? 0,
  };

  return {
    activeTherapists,
    completedVisits,
    optedOutSmsConsent,
    pendingSmsConsent,
    recentAuditEvents,
    recentAuditActivity,
    recentAuditWindowDays,
    recentReferrals,
    recentSmsActivitySummary,
    recentSmsMessages,
    referralCounts,
    scheduledVisits,
    totalReferrals,
    unscheduledVisits,
    upcomingVisits,
  };
}

export async function getTherapistDashboardSnapshot(email: string) {
  const prisma = getPrismaClient();
  const therapist = await prisma.therapist.findFirst({
    where: {
      active: true,
      email,
    },
  });

  if (!therapist) {
    return {
      assignedReferrals: 0,
      needsContact: 0,
      readyToSchedule: 0,
      recentAuditEvents: [],
      recentReferrals: [],
      upcomingVisits: 0,
      therapist: null,
    };
  }

  const assignedReferralIdsPromise = prisma.patientReferral.findMany({
    select: { id: true },
    where: { assignedTherapistId: therapist.id },
  });

  const [assignedReferralIds, assignedReferrals, readyToSchedule, upcomingVisits, needsContact, recentReferrals] = await Promise.all([
    assignedReferralIdsPromise,
    prisma.patientReferral.count({
      where: {
        assignedTherapistId: therapist.id,
        status: { notIn: ["completed", "canceled"] },
      },
    }),
    prisma.patientReferral.count({
      where: {
        assignedTherapistId: therapist.id,
        status: "contacted",
      },
    }),
    prisma.visit.count({
      where: {
        therapistId: therapist.id,
        status: { in: ["scheduled", "in_progress"] },
      },
    }),
    prisma.patientReferral.count({
      where: {
        assignedTherapistId: therapist.id,
        status: "new",
      },
    }),
    prisma.patientReferral.findMany({
      include: {
        visits: {
          orderBy: { scheduledAt: "asc" },
          select: {
            scheduledAt: true,
            status: true,
          },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
      where: {
        assignedTherapistId: therapist.id,
      },
    }),
  ]);

  const recentAuditEvents = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        action: true,
        actorType: true,
        createdAt: true,
        entityId: true,
        entityType: true,
      },
      take: 6,
      where: {
        OR: [
          { actorId: therapist.id },
          {
            entityType: "PatientReferral",
            entityId: {
              in: assignedReferralIds.map((item) => item.id),
            },
          },
        ],
      },
    });

  return {
    assignedReferrals,
    needsContact,
    readyToSchedule,
    recentAuditEvents,
    recentReferrals,
    upcomingVisits,
    therapist,
  };
}
