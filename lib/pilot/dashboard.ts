import { getPrismaClient } from "@/lib/db/prisma";

const recentAuditWindowDays = 7;

type ReferralStatusCountKey = "active" | "canceled" | "completed" | "contacted" | "new" | "scheduled";

type ReferralStatusGroup = {
  status: ReferralStatusCountKey;
  _count: { _all: number };
};

type SmsDirectionGroup = {
  direction: string;
  _count: { _all: number };
};

type AssignedReferralIdRow = {
  id: string;
};

type DashboardVisitSummary = {
  scheduledAt: Date | null;
  status: string;
};

type DashboardTherapistSummary = {
  name: string;
};

type PilotDashboardRecentReferral = {
  id: string;
  assignedTherapist: DashboardTherapistSummary | null;
  city: string | null;
  patientName: string;
  status: string;
  visits: DashboardVisitSummary[];
  zip: string | null;
};

type PilotDashboardUpcomingVisit = {
  id: string;
  scheduledAt: Date | null;
  therapist: DashboardTherapistSummary | null;
  referral: {
    city: string | null;
    patientName: string;
    zip: string | null;
  };
};

type PilotDashboardAuditEvent = {
  action: string;
  actorType: string;
  createdAt: Date;
  entityType: string;
};

type PilotDashboardSmsMessage = {
  createdAt: Date;
  direction: string;
  eventType: string;
  status: string | null;
};

type TherapistDashboardTherapist = {
  id: string;
  email: string;
  name: string;
};

type TherapistDashboardRecentReferral = {
  id: string;
  city: string | null;
  patientName: string;
  status: string;
  visits: DashboardVisitSummary[];
  zip: string | null;
};

type TherapistDashboardAuditEvent = {
  action: string;
  actorType: string;
  createdAt: Date;
  entityId: string | null;
  entityType: string;
};

export type PilotDashboardSnapshot = {
  activeTherapists: number;
  completedVisits: number;
  optedOutSmsConsent: number;
  pendingSmsConsent: number;
  recentAuditActivity: number;
  recentAuditEvents: PilotDashboardAuditEvent[];
  recentAuditWindowDays: number;
  recentReferrals: PilotDashboardRecentReferral[];
  recentSmsActivitySummary: {
    inbound: number;
    outbound: number;
  };
  recentSmsMessages: PilotDashboardSmsMessage[];
  referralCounts: Record<ReferralStatusCountKey, number>;
  scheduledVisits: number;
  totalReferrals: number;
  unscheduledVisits: number;
  upcomingVisits: PilotDashboardUpcomingVisit[];
};

export type TherapistDashboardSnapshot = {
  assignedReferrals: number;
  needsContact: number;
  readyToSchedule: number;
  recentAuditEvents: TherapistDashboardAuditEvent[];
  recentReferrals: TherapistDashboardRecentReferral[];
  therapist: TherapistDashboardTherapist | null;
  upcomingVisits: number;
};

export async function getPilotDashboardSnapshot(): Promise<PilotDashboardSnapshot> {
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
  const referralStatusRows = referralStatusGroups as ReferralStatusGroup[];
  const smsDirectionRows = smsMessagesByDirection as SmsDirectionGroup[];

  for (const group of referralStatusRows) {
    referralCounts[group.status] = group._count._all;
  }

  const recentSmsActivitySummary = {
    inbound: smsDirectionRows.find((group: SmsDirectionGroup) => group.direction === "inbound")?._count._all ?? 0,
    outbound: smsDirectionRows.find((group: SmsDirectionGroup) => group.direction === "outbound")?._count._all ?? 0,
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

export async function getTherapistDashboardSnapshot(email: string): Promise<TherapistDashboardSnapshot> {
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
  const assignedReferralIdRows = assignedReferralIds as AssignedReferralIdRow[];

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
              in: assignedReferralIdRows.map((item: AssignedReferralIdRow) => item.id),
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
