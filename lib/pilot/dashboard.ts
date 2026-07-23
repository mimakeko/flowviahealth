import { getPrismaClient } from "@/lib/db/prisma";
import { activeWorkflowVisitWhere, activeWorkflowWhereClause, smokeOperationalReferralWhere } from "@/lib/pilot/data-stewardship";
import { getOpportunityStatesByReferralId } from "@/lib/pilot/opportunity";
import { getReferralWorkflowState, type ReferralWorkflowState } from "@/lib/pilot/referral-workflow-state";

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
  assignedTherapistId: string | null;
  city: string | null;
  patientName: string;
  referralSource: string | null;
  status: string;
  visits: DashboardVisitSummary[];
  workflowState: ReferralWorkflowState;
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
  referralSource: string | null;
  status: string;
  visits: DashboardVisitSummary[];
  workflowState: ReferralWorkflowState;
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
  contactedNotScheduled: number;
  completedVisits: number;
  optedOutSmsConsent: number;
  pastScheduledVisits: number;
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
  scheduledVisitsNextSevenDays: number;
  smokeTestRecords: number;
  totalReferrals: number;
  unassignedReferrals: number;
  unscheduledVisits: number;
  upcomingVisits: PilotDashboardUpcomingVisit[];
};

export type TherapistDashboardSnapshot = {
  assignedReferrals: number;
  inProgressVisits: number;
  needsContact: number;
  readyToSchedule: number;
  recentlyCompleted: number;
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
    contactedNotScheduled,
    pendingSmsConsent,
    optedOutSmsConsent,
    pastScheduledVisits,
    smsMessagesByDirection,
    recentAuditActivity,
    activeTherapists,
    scheduledVisitsNextSevenDays,
    smokeTestRecords,
    unassignedReferrals,
    upcomingVisits,
    recentReferrals,
    recentAuditEvents,
    recentSmsMessages,
    opportunityLogs,
  ] = await Promise.all([
    prisma.patientReferral.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: activeWorkflowWhereClause(),
    }),
    prisma.patientReferral.count({ where: activeWorkflowWhereClause() }),
    prisma.visit.count({ where: activeWorkflowVisitWhere({ status: { in: ["scheduled", "in_progress"] } }) }),
    prisma.visit.count({ where: activeWorkflowVisitWhere({ status: "unscheduled" }) }),
    prisma.visit.count({ where: activeWorkflowVisitWhere({ status: "completed" }) }),
    prisma.patientReferral.count({
      where: activeWorkflowWhereClause({
        status: "contacted",
        visits: { none: { status: { in: ["scheduled", "in_progress"] } } },
      }),
    }),
    prisma.smsConsentEnrollment.count({ where: { status: "pending_confirmation" } }),
    prisma.smsConsentEnrollment.count({ where: { status: "opted_out" } }),
    prisma.visit.count({
      where: activeWorkflowVisitWhere({
        scheduledAt: { lt: new Date() },
        status: { in: ["scheduled", "in_progress"] },
      }),
    }),
    prisma.smsMessage.groupBy({
      by: ["direction"],
      _count: { _all: true },
      where: { createdAt: { gte: recentAuditSince } },
    }),
    prisma.auditLog.count({ where: { createdAt: { gte: recentAuditSince } } }),
    prisma.therapist.count({ where: { active: true } }),
    prisma.visit.count({
      where: activeWorkflowVisitWhere({
        scheduledAt: {
          gte: new Date(),
          lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        status: { in: ["scheduled", "in_progress"] },
      }),
    }),
    prisma.patientReferral.count({
      where: activeWorkflowWhereClause(smokeOperationalReferralWhere()),
    }),
    prisma.patientReferral.count({
      where: activeWorkflowWhereClause({
        assignedTherapistId: null,
        status: { notIn: ["completed", "canceled"] },
      }),
    }),
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
      where: activeWorkflowVisitWhere({
        status: { in: ["scheduled", "in_progress"] },
      }),
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
      where: activeWorkflowWhereClause(),
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
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      select: { action: true, actorId: true, actorType: true, createdAt: true, entityId: true, metadataJson: true },
      take: 500,
      where: {
        action: { in: ["opportunity_offered", "opportunity_accepted", "opportunity_declined", "opportunity_action_blocked"] },
        entityType: "PatientReferral",
      },
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
  const opportunityStates = getOpportunityStatesByReferralId(opportunityLogs);
  const recentReferralStates = (recentReferrals as Omit<PilotDashboardRecentReferral, "workflowState">[]).map((referral) => ({
    ...referral,
    workflowState: getReferralWorkflowState({
      assignedTherapistId: referral.assignedTherapistId,
      openVisitStatuses: referral.visits.map((visit) => visit.status),
      opportunityState: opportunityStates.get(referral.id)?.state,
      referralSource: referral.referralSource,
      status: referral.status,
    }),
  }));

  return {
    activeTherapists,
    contactedNotScheduled,
    completedVisits,
    optedOutSmsConsent,
    pastScheduledVisits,
    pendingSmsConsent,
    recentAuditEvents,
    recentAuditActivity,
    recentAuditWindowDays,
    recentReferrals: recentReferralStates,
    recentSmsActivitySummary,
    recentSmsMessages,
    referralCounts,
    scheduledVisits,
    scheduledVisitsNextSevenDays,
    smokeTestRecords,
    totalReferrals,
    unassignedReferrals,
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
      inProgressVisits: 0,
      needsContact: 0,
      readyToSchedule: 0,
      recentlyCompleted: 0,
      recentAuditEvents: [],
      recentReferrals: [],
      upcomingVisits: 0,
      therapist: null,
    };
  }

  const assignedReferralIdsPromise = prisma.patientReferral.findMany({
    select: { id: true },
    where: activeWorkflowWhereClause({ assignedTherapistId: therapist.id }),
  });

  const [assignedReferralIds, assignedReferrals, readyToSchedule, upcomingVisits, needsContact, inProgressVisits, recentlyCompleted, recentReferrals] = await Promise.all([
    assignedReferralIdsPromise,
    prisma.patientReferral.count({
      where: activeWorkflowWhereClause({
        assignedTherapistId: therapist.id,
        status: { notIn: ["completed", "canceled"] },
      }),
    }),
    prisma.patientReferral.count({
      where: activeWorkflowWhereClause({
        assignedTherapistId: therapist.id,
        status: "contacted",
      }),
    }),
    prisma.visit.count({
      where: activeWorkflowVisitWhere({
        therapistId: therapist.id,
        status: { in: ["scheduled", "in_progress"] },
      }),
    }),
    prisma.patientReferral.count({
      where: activeWorkflowWhereClause({
        assignedTherapistId: therapist.id,
        status: "new",
      }),
    }),
    prisma.visit.count({
      where: activeWorkflowVisitWhere({
        therapistId: therapist.id,
        status: "in_progress",
      }),
    }),
    prisma.visit.count({
      where: activeWorkflowVisitWhere({
        therapistId: therapist.id,
        status: "completed",
        updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      }),
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
      where: activeWorkflowWhereClause({
        assignedTherapistId: therapist.id,
      }),
    }),
  ]);
  const assignedReferralIdRows = assignedReferralIds as AssignedReferralIdRow[];

  const [recentAuditEvents, opportunityLogs] = await Promise.all([prisma.auditLog.findMany({
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
    }), prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      select: { action: true, actorId: true, actorType: true, createdAt: true, entityId: true, metadataJson: true },
      where: {
        action: { in: ["opportunity_offered", "opportunity_accepted", "opportunity_declined", "opportunity_action_blocked"] },
        entityId: { in: assignedReferralIdRows.map((item: AssignedReferralIdRow) => item.id) },
        entityType: "PatientReferral",
      },
    })]);
  const opportunityStates = getOpportunityStatesByReferralId(opportunityLogs);
  const recentReferralStates = (recentReferrals as Array<Omit<TherapistDashboardRecentReferral, "workflowState"> & { assignedTherapistId?: string | null }>).map((referral) => ({
    ...referral,
    workflowState: getReferralWorkflowState({
      assignedTherapistId: therapist.id,
      openVisitStatuses: referral.visits.map((visit) => visit.status),
      opportunityState: opportunityStates.get(referral.id)?.state,
      referralSource: referral.referralSource,
      status: referral.status,
    }),
  }));

  return {
    assignedReferrals,
    inProgressVisits,
    needsContact,
    readyToSchedule,
    recentlyCompleted,
    recentAuditEvents,
    recentReferrals: recentReferralStates,
    upcomingVisits,
    therapist,
  };
}
