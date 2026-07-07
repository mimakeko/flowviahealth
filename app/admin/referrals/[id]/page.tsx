import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarPlus, Save } from "lucide-react";
import type { PrismaClient } from "@prisma/client";
import { BlockedNoteAlert } from "@/components/blocked-note-alert";
import { OperationsAssistantPanel } from "@/components/operations-assistant-panel";
import { SchedulingIntelligencePanel } from "@/components/scheduling-intelligence-panel";
import { getOperationsAssistantV2Status, getReferralAssistantCards } from "@/lib/ai/operations-assistant-v2";
import { getPrismaClient } from "@/lib/db/prisma";
import { activeWorkflowVisitWhere, activeWorkflowWhereClause } from "@/lib/pilot/data-stewardship";
import { getBlockedOperationalNoteRedirectSearch } from "@/lib/pilot/note-guardrail";
import { requirePilotSession } from "@/lib/pilot/auth";
import {
  dateTimeLocalValue,
  formatDateTime,
  optionalDateField,
  optionalTextField,
  redactPhone,
  referralStatusField,
  REFERRAL_STATUSES,
  requirePilotOperationsAccess,
  statusClassName,
  statusLabel,
  textField,
  visitStatusField,
  VISIT_STATUSES,
} from "@/lib/pilot/ops";
import {
  getSchedulingReadiness,
  getSuggestedSchedulingWindows,
  getTherapistFit,
} from "@/lib/pilot/scheduling-intelligence";
import {
  canCreateVisitForReferral,
  evaluateReferralIntakeQuality,
  getReferralDuplicateCandidates,
  type CreateVisitGateResult,
  type ReferralIntakeDuplicateSource,
  type ReferralIntakeQualityResult,
} from "@/lib/pilot/referral-intake-quality";
import {
  canOfferReferralOpportunity,
  getOpportunityStateFromAuditLogs,
  opportunityAllowsVisitCreation,
  opportunityBadgeClassName,
  opportunityStateLabel,
} from "@/lib/pilot/opportunity";
import { normalizeE164Phone } from "@/lib/sms/compliance";
import { getTelnyxConfigStatus } from "@/lib/sms/telnyx";

export const metadata: Metadata = {
  title: "Referral Detail",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type TherapistOption = {
  id: string;
  name: string;
};

type ReferralDetailVisit = {
  id: string;
  notes: string | null;
  scheduledAt: Date | string | null;
  status: string;
  therapist: { name: string } | null;
  therapistId: string | null;
};

type AuditLogListItem = {
  id: string;
  action: string;
  actorId: string | null;
  actorType: string;
  createdAt: Date | string;
  entityId: string | null;
  metadataJson: unknown;
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

const REFERRAL_WORKFLOW_STAGES = ["new", "contacted", "scheduled", "active", "completed", "canceled"] as const;
const INTAKE_AUDIT_ACTIONS = new Set([
  "referral_created",
  "referral_updated",
  "referral_status_changed",
  "therapist_assigned",
  "referral_duplicate_warning",
  "referral_duplicate_override",
  "operational_note_blocked",
]);

type ReferralDecision = {
  badgeClassName: string;
  detail: string;
  nextStep: string;
  state:
    | "Ready to create visit"
    | "Needs intake review"
    | "Duplicate review required"
    | "Non-SMS follow-up only"
    | "Missing therapist assignment"
    | "Terminal / archived / not schedulable";
};

function referralNextSteps(status: string) {
  if (status === "new") return "Contact the patient, confirm SMS consent readiness, and assign a therapist.";
  if (status === "contacted") return "Assign a therapist and schedule the first visit.";
  if (status === "scheduled") return "Monitor the upcoming visit and keep the operational note free of PHI.";
  if (status === "active") return "Complete the current visit or schedule the next follow-up.";
  if (status === "completed" || status === "canceled") return "Read-only pilot summary. Review audit events before reopening this fake workflow.";
  return "Review status, therapist assignment, and visit readiness.";
}

function isUpcomingVisit(visit: ReferralDetailVisit) {
  return Boolean(visit.scheduledAt && !["completed", "canceled", "no_show"].includes(visit.status));
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.filter(Boolean))];
}

function getReferralDecision(input: {
  createVisitGate: CreateVisitGateResult;
  intakeQuality: ReferralIntakeQualityResult;
  smsReadiness: string;
}) {
  const reasons = input.createVisitGate.reasons;
  const hasNotSchedulableReason = reasons.some((reason) => (
    reason.includes("Archived") ||
    reason.includes("Smoke/test") ||
    reason.includes("Terminal") ||
    reason.includes("Existing open/future visit") ||
    reason.includes("Not in active workflow queue")
  ));
  if (input.createVisitGate.allowed) {
    return {
      badgeClassName: "bg-emerald-50 text-emerald-800 ring-emerald-200",
      detail: "All deterministic readiness checks passed for manual visit creation.",
      nextStep: "Open the Create visit form and submit only after admin review.",
      state: "Ready to create visit",
    } satisfies ReferralDecision;
  }
  if (hasNotSchedulableReason) {
    return {
      badgeClassName: "bg-rose-50 text-rose-800 ring-rose-200",
      detail: "The referral is terminal, archived, smoke/test, already has an open/future visit, or is outside the active workflow queue.",
      nextStep: "Review audit history and existing visits. Do not create a new visit from this record unless the workflow is manually corrected first.",
      state: "Terminal / archived / not schedulable",
    } satisfies ReferralDecision;
  }
  if (input.smsReadiness === "opted_out" || reasons.includes("Non-SMS only")) {
    return {
      badgeClassName: "bg-rose-50 text-rose-800 ring-rose-200",
      detail: "This referral is marked for non-SMS operational follow-up only.",
      nextStep: "Use non-SMS operational follow-up only. Do not add SMS controls or send messages from this workflow.",
      state: "Non-SMS follow-up only",
    } satisfies ReferralDecision;
  }
  if (input.intakeQuality.duplicateReviewRequired || input.intakeQuality.duplicateCandidates.length > 0 || reasons.includes("Duplicate review")) {
    return {
      badgeClassName: "bg-amber-50 text-amber-900 ring-amber-200",
      detail: "Local deterministic signals found a possible duplicate. The duplicate guard is warning-only and requires manual review.",
      nextStep: "Compare the safe duplicate summaries and audit history before deciding whether to continue.",
      state: "Duplicate review required",
    } satisfies ReferralDecision;
  }
  if (reasons.includes("Missing therapist") || !input.intakeQuality.checklist.hasAssignedTherapist) {
    return {
      badgeClassName: "bg-amber-50 text-amber-900 ring-amber-200",
      detail: "No active therapist assignment is present for this referral.",
      nextStep: "Choose an active therapist in the manual referral form below. No therapist is auto-assigned.",
      state: "Missing therapist assignment",
    } satisfies ReferralDecision;
  }

  return {
    badgeClassName: "bg-amber-50 text-amber-900 ring-amber-200",
    detail: "One or more required fake/pilot intake fields or scheduling readiness checks still need review.",
    nextStep: "Update the safe operational intake fields and status manually, then re-check this panel.",
    state: "Needs intake review",
  } satisfies ReferralDecision;
}

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

async function getCreateVisitGateForReferral(prisma: PrismaClient, referralId: string): Promise<CreateVisitGateResult | null> {
  const referral = await prisma.patientReferral.findUnique({
    include: {
      assignedTherapist: { select: { name: true } },
      visits: {
        select: { id: true },
        where: { status: { in: ["scheduled", "in_progress"] } },
      },
    },
    where: { id: referralId },
  });
  if (!referral) return null;

  const [activeWorkflowVisible, smsConsent, duplicateRows] = await Promise.all([
    prisma.patientReferral.count({ where: activeWorkflowWhereClause({ id: referral.id }) }),
    prisma.smsConsentEnrollment.findUnique({
      select: { status: true },
      where: { normalizedPhone: normalizeE164Phone(referral.phone) },
    }),
    prisma.patientReferral.findMany({
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
      where: activeWorkflowWhereClause({ status: { notIn: ["completed", "canceled"] } }),
    }),
  ]);
  const duplicateCandidates = getReferralDuplicateCandidates({
    draft: {
      assignedTherapistId: referral.assignedTherapistId,
      assignedTherapistName: referral.assignedTherapist?.name,
      city: referral.city,
      createdAt: referral.createdAt,
      id: referral.id,
      patientName: referral.patientName,
      phone: referral.phone,
      status: referral.status,
      zip: referral.zip,
    },
    sources: duplicateSources(duplicateRows as DuplicateReferralRow[]),
  });
  const intakeQuality = evaluateReferralIntakeQuality({
    assignedTherapistId: referral.assignedTherapistId,
    assignedTherapistName: referral.assignedTherapist?.name,
    careType: referral.careType,
    city: referral.city,
    duplicateCandidates,
    patientName: referral.patientName,
    phone: referral.phone,
    smsConsentStatus: smsConsent?.status || "none",
    status: referral.status,
    zip: referral.zip,
  });

  return canCreateVisitForReferral({
    activeWorkflowVisible: activeWorkflowVisible > 0,
    assignedTherapistId: referral.assignedTherapistId,
    assignedTherapistName: referral.assignedTherapist?.name,
    careType: referral.careType,
    city: referral.city,
    duplicateCandidates,
    futureVisitCount: referral.visits.length,
    intakeQuality,
    notes: referral.notes,
    patientName: referral.patientName,
    phone: referral.phone,
    referralSource: referral.referralSource,
    smsConsentStatus: smsConsent?.status || "none",
    status: referral.status,
    zip: referral.zip,
  });
}

async function updateReferralAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  await requirePilotSession(["admin"], "/admin/referrals");

  const prisma = getPrismaClient();
  const referralId = textField(formData.get("referralId"), 80);
  const assignedTherapistId = optionalTextField(formData.get("assignedTherapistId"), 80);
  const status = referralStatusField(formData.get("status"));
  const notes = optionalTextField(formData.get("notes"), 3000);

  if (!referralId) notFound();

  const blockedNoteSearch = await getBlockedOperationalNoteRedirectSearch({
    actorType: "pilot_admin",
    entityId: referralId,
    entityType: "PatientReferral",
    extra: { assignedTherapistId: assignedTherapistId || null, status },
    fieldLabel: "Referral note",
    route: `/admin/referrals/${referralId}`,
    value: notes,
    workflow: "referral_update",
  });
  if (blockedNoteSearch) redirect(`/admin/referrals/${referralId}?${blockedNoteSearch}`);

  const existing = await prisma.patientReferral.findUnique({
    select: { assignedTherapistId: true, status: true },
    where: { id: referralId },
  });
  if (!existing) notFound();

  const updated = await prisma.patientReferral.update({
    where: { id: referralId },
    data: {
      assignedTherapistId: assignedTherapistId || null,
      notes,
      status,
    },
  });
  const intakeQuality = evaluateReferralIntakeQuality({
    assignedTherapistId: updated.assignedTherapistId,
    careType: updated.careType,
    city: updated.city,
    patientName: updated.patientName,
    phone: updated.phone,
    smsConsentStatus: "none",
    status: updated.status,
    zip: updated.zip,
  });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: "referral_updated",
        entityType: "PatientReferral",
        entityId: referralId,
        metadataJson: {
          assignedTherapistId: updated.assignedTherapistId,
          hasOperationalNote: Boolean(notes),
          readinessLevel: intakeQuality.readinessLevel,
          status: updated.status,
          warningCodes: intakeQuality.warnings.map((item) => item.code).join(","),
        },
      },
    }),
    existing.status !== updated.status
      ? prisma.auditLog.create({
          data: {
            actorType: "pilot_admin",
            action: "referral_status_changed",
            entityType: "PatientReferral",
            entityId: referralId,
            metadataJson: { from: existing.status, to: updated.status },
          },
        })
      : Promise.resolve(),
    existing.assignedTherapistId !== updated.assignedTherapistId
      ? prisma.auditLog.create({
          data: {
            actorType: "pilot_admin",
            action: "therapist_assigned",
            entityType: "PatientReferral",
            entityId: referralId,
            metadataJson: { assignedTherapistId: updated.assignedTherapistId },
          },
        })
      : Promise.resolve(),
  ]);

  redirect(`/admin/referrals/${referralId}`);
}

async function saveVisitAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  await requirePilotSession(["admin"], "/admin/referrals");

  const prisma = getPrismaClient();
  const referralId = textField(formData.get("referralId"), 80);
  const visitId = optionalTextField(formData.get("visitId"), 80);
  const therapistId = optionalTextField(formData.get("therapistId"), 80);
  const scheduledAt = optionalDateField(formData.get("scheduledAt"));
  const status = visitStatusField(formData.get("status"));
  const notes = optionalTextField(formData.get("notes"), 2000);

  if (!referralId) notFound();

  const blockedNoteSearch = await getBlockedOperationalNoteRedirectSearch({
    actorType: "pilot_admin",
    entityId: visitId || null,
    entityType: "Visit",
    extra: { referralId, status, therapistId: therapistId || null },
    fieldLabel: "Visit note",
    route: `/admin/referrals/${referralId}`,
    value: notes,
    workflow: visitId ? "referral_visit_update" : "referral_visit_create",
  });
  if (blockedNoteSearch) redirect(`/admin/referrals/${referralId}?${blockedNoteSearch}`);

  if (!visitId) {
    const createVisitGate = await getCreateVisitGateForReferral(prisma, referralId);
    if (!createVisitGate) notFound();
    if (!createVisitGate.allowed) {
      await prisma.auditLog.create({
        data: {
          actorType: "pilot_admin",
          action: "visit_create_blocked",
          entityType: "PatientReferral",
          entityId: referralId,
          metadataJson: {
            reason: createVisitGate.reasons.slice(0, 5).join(","),
            route: `/admin/referrals/${referralId}`,
            severity: createVisitGate.severity,
          },
        },
      });
      redirect(`/admin/referrals/${referralId}?error=visit_create_blocked`);
    }
  }

  const existingVisit = visitId ? await prisma.visit.findUnique({ select: { status: true }, where: { id: visitId } }) : null;
  const visit = visitId
    ? await prisma.visit.update({
        where: { id: visitId },
        data: {
          notes,
          scheduledAt: scheduledAt || null,
          status,
          therapistId: therapistId || null,
        },
      })
    : await prisma.visit.create({
        data: {
          notes,
          referralId,
          scheduledAt,
          status,
          therapistId,
        },
      });

  await Promise.all([
    prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: visitId ? "visit_updated" : "visit_created",
        entityType: "Visit",
        entityId: visit.id,
        metadataJson: {
          referralId,
          status: visit.status,
          therapistId: visit.therapistId,
        },
      },
    }),
    existingVisit && existingVisit.status !== visit.status
      ? prisma.auditLog.create({
          data: {
            actorType: "pilot_admin",
            action: "visit_status_changed",
            entityType: "Visit",
            entityId: visit.id,
            metadataJson: {
              from: existingVisit.status,
              referralId,
              to: visit.status,
            },
          },
        })
      : Promise.resolve(),
    prisma.auditLog.create({
      data: {
        actorType: "pilot_admin",
        action: visitId ? "referral_visit_updated" : "referral_visit_created",
        entityType: "PatientReferral",
        entityId: referralId,
        metadataJson: {
          status: visit.status,
          visitId: visit.id,
        },
      },
    }),
  ]);

  redirect(`/admin/referrals/${referralId}`);
}

async function offerOpportunityAction(formData: FormData) {
  "use server";

  requirePilotOperationsAccess();
  const session = await requirePilotSession(["admin"], "/admin/referrals");

  const prisma = getPrismaClient();
  const referralId = textField(formData.get("referralId"), 80);
  if (!referralId) notFound();

  const [referral, existingOpportunityLogs] = await Promise.all([
    prisma.patientReferral.findUnique({
      select: { assignedTherapistId: true },
      where: { id: referralId },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      where: {
        action: { in: ["opportunity_offered", "opportunity_accepted", "opportunity_declined", "opportunity_action_blocked"] },
        entityId: referralId,
        entityType: "PatientReferral",
      },
    }),
  ]);
  if (!referral) notFound();

  const createVisitGate = await getCreateVisitGateForReferral(prisma, referralId);
  const opportunityState = getOpportunityStateFromAuditLogs(existingOpportunityLogs).state;
  const allowed = Boolean(createVisitGate?.allowed && referral.assignedTherapistId && (opportunityState === "not_offered" || opportunityState === "declined"));

  if (!allowed) {
    await prisma.auditLog.create({
      data: {
        actorId: session.email,
        actorType: "pilot_admin",
        action: "opportunity_action_blocked",
        entityType: "PatientReferral",
        entityId: referralId,
        metadataJson: {
          attemptedAction: "offer",
          reason: createVisitGate?.reasons.slice(0, 5).join(",") || "not_offer_ready",
          route: `/admin/referrals/${referralId}`,
          therapistId: referral.assignedTherapistId || null,
        },
      },
    });
    redirect(`/admin/referrals/${referralId}?error=opportunity_offer_blocked`);
  }

  await prisma.auditLog.create({
    data: {
      actorId: session.email,
      actorType: "pilot_admin",
      action: "opportunity_offered",
      entityType: "PatientReferral",
      entityId: referralId,
      metadataJson: {
        source: "deterministic_manual",
        therapistId: referral.assignedTherapistId,
      },
    },
  });

  redirect(`/admin/referrals/${referralId}`);
}

export default async function ReferralDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ error?: string; noteCategory?: string; noteClassification?: string; noteDestination?: string; noteSuggestion?: string }>;
}) {
  requirePilotOperationsAccess();

  const { id } = await params;
  const query = await searchParams;
  const prisma = getPrismaClient();
  const [referral, therapists] = await Promise.all([
    prisma.patientReferral.findUnique({
      where: { id },
      include: {
        assignedTherapist: true,
        visits: {
          include: { therapist: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.therapist.findMany({
      orderBy: { name: "asc" },
      where: { active: true },
    }),
  ]);

  if (!referral) notFound();

  const referralVisits = referral.visits as ReferralDetailVisit[];
  const referralVisitIds = referralVisits.map((visit: ReferralDetailVisit) => visit.id);
  const therapistOptions = therapists as TherapistOption[];
  const upcomingVisits = referralVisits.filter(isUpcomingVisit);

  const [auditLogs, smsConsent, duplicateRows, activeWorkflowVisible] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      where: {
        OR: [
          { entityType: "PatientReferral", entityId: referral.id },
          { entityType: "Visit", entityId: { in: referralVisitIds } },
        ],
      },
    }),
    prisma.smsConsentEnrollment.findUnique({
      where: { normalizedPhone: normalizeE164Phone(referral.phone) },
    }),
    prisma.patientReferral.findMany({
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
      where: activeWorkflowWhereClause({ status: { notIn: ["completed", "canceled"] } }),
    }),
    prisma.patientReferral.count({ where: activeWorkflowWhereClause({ id: referral.id }) }),
  ]);
  const referralAuditLogs = auditLogs as AuditLogListItem[];
  const opportunityState = getOpportunityStateFromAuditLogs(referralAuditLogs);
  const intakeAuditLogs = referralAuditLogs.filter((log: AuditLogListItem) => INTAKE_AUDIT_ACTIONS.has(log.action));
  const smsReadiness = smsConsent?.status || "none";
  const futureOpenVisitCount = referralVisits.filter((visit: ReferralDetailVisit) => ["scheduled", "in_progress"].includes(visit.status)).length;
  const duplicateCandidates = getReferralDuplicateCandidates({
    draft: {
      assignedTherapistId: referral.assignedTherapistId,
      assignedTherapistName: referral.assignedTherapist?.name,
      city: referral.city,
      createdAt: referral.createdAt,
      id: referral.id,
      patientName: referral.patientName,
      phone: referral.phone,
      status: referral.status,
      zip: referral.zip,
    },
    sources: duplicateSources(duplicateRows as DuplicateReferralRow[]),
  });
  const intakeQuality = evaluateReferralIntakeQuality({
    assignedTherapistId: referral.assignedTherapistId,
    assignedTherapistName: referral.assignedTherapist?.name,
    careType: referral.careType,
    city: referral.city,
    duplicateCandidates,
    patientName: referral.patientName,
    phone: referral.phone,
    smsConsentStatus: smsReadiness,
    status: referral.status,
    zip: referral.zip,
  });
  const createVisitGate = canCreateVisitForReferral({
    activeWorkflowVisible: activeWorkflowVisible > 0,
    assignedTherapistId: referral.assignedTherapistId,
    assignedTherapistName: referral.assignedTherapist?.name,
    careType: referral.careType,
    city: referral.city,
    duplicateCandidates,
    futureVisitCount: futureOpenVisitCount,
    intakeQuality,
    notes: referral.notes,
    patientName: referral.patientName,
    phone: referral.phone,
    referralSource: referral.referralSource,
    smsConsentStatus: smsReadiness,
    status: referral.status,
    zip: referral.zip,
  });
  const opportunityOfferGate = canOfferReferralOpportunity({
    activeWorkflowVisible: activeWorkflowVisible > 0,
    assignedTherapistId: referral.assignedTherapistId,
    createVisitGate,
    intakeQuality,
    opportunityState: opportunityState.state,
    status: referral.status,
  });
  const opportunityAllowsCreateVisit = opportunityAllowsVisitCreation({
    opportunityState: opportunityState.state,
    referralSource: referral.referralSource,
  });
  const referralDecision = getReferralDecision({ createVisitGate, intakeQuality, smsReadiness });
  const decisionReasons = uniqueStrings([
    ...createVisitGate.reasons,
    ...intakeQuality.warnings.map((item) => item.label),
  ]);
  const missingItems = intakeQuality.warnings.filter((item) => [
    "missing_phone",
    "missing_city",
    "missing_zip",
    "missing_service_area",
  ].includes(item.code));
  const telnyx = getTelnyxConfigStatus();
  const assignedTherapistOpenVisits = referral.assignedTherapistId
    ? await prisma.visit.findMany({
        orderBy: { scheduledAt: "asc" },
        select: { id: true, scheduledAt: true, status: true },
        where: {
          ...activeWorkflowVisitWhere({
            therapistId: referral.assignedTherapistId,
            status: { in: ["scheduled", "in_progress"] },
          }),
        },
      })
    : [];
  const schedulingReadiness = getSchedulingReadiness({
    assignedTherapistId: referral.assignedTherapistId,
    futureVisitCount: upcomingVisits.length,
    referralStatus: referral.status,
    smsConsentStatus: smsReadiness,
  });
  const therapistFit = getTherapistFit({
    active: referral.assignedTherapist?.active ?? false,
    currentOpenVisitCount: assignedTherapistOpenVisits.length,
    referralCity: referral.city,
    referralZip: referral.zip,
    serviceAreaNotes: referral.assignedTherapist?.serviceAreaNotes,
    therapistName: referral.assignedTherapist?.name,
  });
  const suggestedWindows = getSuggestedSchedulingWindows({
    scheduledVisits: assignedTherapistOpenVisits,
  });
  const assistantCards = getReferralAssistantCards({
    assignedTherapistId: referral.assignedTherapistId,
    noteClassification: query?.noteClassification,
    smsConsentStatus: smsReadiness,
    status: referral.status,
    upcomingVisitCount: upcomingVisits.length,
  });
  const assistantStatus = getOperationsAssistantV2Status();

  return (
    <div>
      <Link href="/admin/referrals" className="inline-flex items-center gap-2 text-sm font-semibold text-blue underline">
        <ArrowLeft size={16} />
        Back to referrals
      </Link>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-lg border border-line bg-white p-6">
          <p className="eyebrow">Referral detail</p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-.03em] text-ink">{referral.patientName}</h1>
              <p className="mt-2 text-sm text-slate-600">{[referral.city, referral.zip].filter(Boolean).join(" / ") || "Location not provided"}</p>
            </div>
            <span className={`inline-flex w-fit rounded-md px-2 py-1 text-xs font-semibold ring-1 ${statusClassName(referral.status)}`}>
              {statusLabel(referral.status)}
            </span>
          </div>

          <div className="mt-6 rounded-lg border border-line bg-slate-50 p-4">
            <div className="flex flex-wrap gap-2">
              {REFERRAL_WORKFLOW_STAGES.map((stage) => (
                <span key={stage} className={`inline-flex min-h-8 items-center rounded-md px-3 text-xs font-semibold ring-1 ${stage === referral.status ? statusClassName(stage) : "bg-white text-slate-500 ring-line"}`}>
                  {statusLabel(stage)}
                </span>
              ))}
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <div>
                <p className="font-semibold text-ink">Current status</p>
                <p className="mt-1 text-slate-600">{statusLabel(referral.status)}</p>
              </div>
              <div>
                <p className="font-semibold text-ink">Next step</p>
                <p className="mt-1 text-slate-600">{referralNextSteps(referral.status)}</p>
              </div>
              <div>
                <p className="font-semibold text-ink">Upcoming visits</p>
                <p className="mt-1 text-slate-600">{upcomingVisits.length > 0 ? `${upcomingVisits.length} active/upcoming` : "None scheduled"}</p>
              </div>
            </div>
          </div>

          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-ink">Phone</dt><dd className="mt-1 text-slate-600">{redactPhone(referral.phone)}</dd></div>
            <div><dt className="font-semibold text-ink">Email</dt><dd className="mt-1 text-slate-600">{referral.email || "Not provided"}</dd></div>
            <div><dt className="font-semibold text-ink">Service area / workflow type</dt><dd className="mt-1 text-slate-600">{referral.careType || "Not provided"}</dd></div>
            <div><dt className="font-semibold text-ink">Referral source</dt><dd className="mt-1 text-slate-600">{referral.referralSource || "Not provided"}</dd></div>
            <div><dt className="font-semibold text-ink">Assigned therapist</dt><dd className="mt-1 text-slate-600">{referral.assignedTherapist?.name || "Unassigned"}</dd></div>
            <div><dt className="font-semibold text-ink">Created</dt><dd className="mt-1 text-slate-600">{formatDateTime(referral.createdAt)}</dd></div>
          </dl>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-ink">Assignment and schedule</p>
              <p className="mt-1">Therapist: {referral.assignedTherapist?.name || "Unassigned"}</p>
              <p className="mt-1">Next visit: {upcomingVisits[0] ? `${formatDateTime(upcomingVisits[0].scheduledAt)} · ${upcomingVisits[0].therapist?.name || "Unassigned"}` : "Not scheduled"}</p>
            </div>
            <div className="rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-ink">SMS consent readiness</p>
              <p className="mt-1">Phone: {redactPhone(referral.phone)} · Consent: {statusLabel(smsReadiness)}</p>
              <p className="mt-1">Template: safe transactional templates available · Real SMS gate: {telnyx.realSmsTestsEnabled ? "On" : "Off"}</p>
              <p className="mt-1 text-xs text-slate-500">SMS send disabled in this workflow. Controlled SMS tests require `FLOWVIA_ALLOW_REAL_SMS_TEST=true`, personal-number-only testing, and no PHI.</p>
            </div>
          </div>

          <BlockedNoteAlert className="mt-5" searchParams={query} />

          {query?.error === "visit_create_blocked" ? (
            <section className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-950">
              Visit creation was blocked by the deterministic scheduling ready gate. Review the referral decision panel before trying again.
            </section>
          ) : null}

          {query?.error === "opportunity_offer_blocked" ? (
            <section className="mt-5 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-950">
              Opportunity offer was blocked by deterministic safety checks. Review therapist assignment and readiness before offering.
            </section>
          ) : null}

          <section className="mt-5 rounded-lg border border-line bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow">Referral decision</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-.02em] text-ink">{referralDecision.state}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{referralDecision.detail}</p>
              </div>
              <span className={`inline-flex w-fit rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ${referralDecision.badgeClassName}`}>
                {createVisitGate.allowed ? "create allowed" : "review only"}
              </span>
            </div>

            <div className={`mt-4 rounded-lg border p-4 text-sm leading-6 ${createVisitGate.allowed ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
              <p className="font-semibold">Next manual admin step</p>
              <p className="mt-1">{referralDecision.nextStep}</p>
              {createVisitGate.allowed && opportunityAllowsCreateVisit ? (
                <Link href={`/admin/visits/new?referralId=${referral.id}`} className="btn-primary mt-3">
                  <CalendarPlus size={18} />
                  Create visit
                </Link>
              ) : (
                <p className="mt-3 rounded-md bg-white/70 p-2 font-semibold">{createVisitGate.allowed ? "Create visit is suppressed until therapist acceptance is recorded." : "Create visit is suppressed until review blockers are resolved."}</p>
              )}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-lg border border-line bg-slate-50 p-4">
                <p className="font-semibold text-ink">Deterministic blockers and reasons</p>
                <div className="mt-3 grid gap-2">
                  {decisionReasons.length > 0 ? decisionReasons.map((reason) => (
                    <p key={reason} className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-line">{reason}</p>
                  )) : (
                    <p className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">No readiness blockers found.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-line bg-slate-50 p-4">
                <p className="font-semibold text-ink">Safe referral signals</p>
                <dl className="mt-3 grid gap-3 text-sm">
                  <div><dt className="font-semibold text-ink">Masked phone</dt><dd className="mt-1 text-slate-600">{intakeQuality.safeDisplay.maskedPhone}</dd></div>
                  <div><dt className="font-semibold text-ink">Therapist</dt><dd className="mt-1 text-slate-600">{intakeQuality.safeDisplay.therapistLabel}</dd></div>
                  <div><dt className="font-semibold text-ink">City / ZIP</dt><dd className="mt-1 text-slate-600">{intakeQuality.safeDisplay.city} / {intakeQuality.safeDisplay.zip}</dd></div>
                  <div><dt className="font-semibold text-ink">SMS consent</dt><dd className="mt-1 text-slate-600">{statusLabel(smsReadiness)}{smsReadiness === "opted_out" ? " · Use non-SMS operational follow-up only" : " · No SMS controls here"}</dd></div>
                </dl>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {Object.entries(intakeQuality.checklist).map(([key, value]) => (
                <p key={key} className={`rounded-md px-3 py-2 text-sm font-semibold ring-1 ${value ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-950 ring-amber-200"}`}>
                  {value ? "Ready" : "Review"} · {key.replace(/([A-Z])/g, " $1").replace(/^has /, "").replace(/^status /, "status ").toLowerCase()}
                </p>
              ))}
            </div>

            {missingItems.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <p className="font-semibold">Missing intake checklist</p>
                <div className="mt-3 grid gap-2">
                  {missingItems.map((item) => (
                    <p key={item.code} className="rounded-md bg-white/70 p-2"><span className="font-semibold">{item.label}:</span> {item.nextAction}</p>
                  ))}
                </div>
              </div>
            ) : null}

            {intakeQuality.warnings.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {intakeQuality.warnings.map((item) => (
                  <div key={item.code} className={`rounded-lg border p-3 text-sm leading-6 ${item.level === "blocker" ? "border-rose-200 bg-rose-50 text-rose-950" : item.level === "warning" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-line bg-slate-50 text-slate-700"}`}>
                    <p className="font-semibold">{item.label}</p>
                    <p className="mt-1">{item.nextAction}</p>
                  </div>
                ))}
              </div>
            ) : null}

            {duplicateCandidates.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <p className="font-semibold">Possible duplicate referrals</p>
                <div className="mt-3 grid gap-2">
                  {duplicateCandidates.map((candidate) => (
                    <div key={candidate.id} className="rounded-md bg-white/70 p-3">
                      <p className="font-semibold">Score: {candidate.score} · Status: {statusLabel(candidate.status)} · Therapist: {candidate.therapistLabel}</p>
                      <p className="mt-1 text-xs">Signals: {candidate.reasons.join(", ")}</p>
                      <Link href={`/admin/referrals/${candidate.id}`} className="mt-2 inline-flex font-semibold text-blue underline">Review safe referral record</Link>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 rounded-lg border border-line bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-semibold text-ink">Safety guarantees</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  "Deterministic/local data only",
                  "No SMS sent",
                  "No autonomous scheduling",
                  "No external duplicate API",
                  "No maps/geocoding/travel-time API",
                  "No PHI storage in notes",
                  "Manual admin review required",
                ].map((item) => (
                  <p key={item} className="rounded-md bg-white px-3 py-2 font-semibold ring-1 ring-line">{item}</p>
                ))}
              </div>
            </div>
          </section>

          <section data-testid="therapist-opportunity-panel" className="mt-5 rounded-lg border border-line bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow">Therapist opportunity</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-.02em] text-ink">{opportunityStateLabel(opportunityState.state)}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Manual staffing opportunity review only. This does not create a visit, send SMS, auto-assign, auto-accept, or call external matching services.
                </p>
              </div>
              <span className={`inline-flex w-fit rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ${opportunityBadgeClassName(opportunityState.state)}`}>
                {opportunityStateLabel(opportunityState.state)}
              </span>
            </div>
            <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
              <div className="rounded-lg border border-line bg-slate-50 p-3"><dt className="font-semibold text-ink">Assigned therapist</dt><dd className="mt-1 text-slate-600">{referral.assignedTherapist?.name || "Unassigned"}</dd></div>
              <div className="rounded-lg border border-line bg-slate-50 p-3"><dt className="font-semibold text-ink">Offer readiness</dt><dd className="mt-1 text-slate-600">{opportunityOfferGate.allowed ? "Safe to offer" : "Review required"}</dd></div>
              <div className="rounded-lg border border-line bg-slate-50 p-3"><dt className="font-semibold text-ink">Source</dt><dd className="mt-1 text-slate-600">deterministic/manual</dd></div>
            </dl>
            {opportunityOfferGate.allowed ? (
              <form action={offerOpportunityAction} className="mt-4">
                <input type="hidden" name="referralId" value={referral.id} />
                <button className="btn-primary" type="submit">Offer to assigned therapist</button>
              </form>
            ) : (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                <p className="font-semibold">Cannot offer yet</p>
                <p className="mt-1">{opportunityOfferGate.reasons.join(" · ") || "Already offered or accepted."}</p>
              </div>
            )}
            <div className="mt-4 rounded-lg border border-line bg-slate-50 p-4 text-xs leading-5 text-slate-600">
              Safety guarantees: no PHI fields, no full address, no SMS send, no auto scheduling, no automatic therapist matching, no EMR/billing/OASIS/claims workflow.
            </div>
          </section>

          <div className="mt-5">
            <OperationsAssistantPanel
              cards={assistantCards}
              status={assistantStatus}
              summary="Referral guidance is deterministic and limited to operational workflow state. It does not send messages or make autonomous changes."
              title="Operations Assistant"
            />
          </div>

          <div className="mt-5">
            <SchedulingIntelligencePanel
              fit={therapistFit}
              readiness={schedulingReadiness}
              summary="Referral scheduling readiness uses fake pilot status, therapist assignment, SMS consent state, and existing future visits. Suggested windows require manual review."
              windows={suggestedWindows}
            />
            {createVisitGate.allowed && opportunityAllowsCreateVisit ? (
              <Link href={`/admin/visits/new?referralId=${referral.id}`} className="btn-secondary mt-4">
                <CalendarPlus size={18} />
                Open Create visit flow
              </Link>
            ) : null}
          </div>

          {referral.address ? (
            <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
              A full address is stored for this fake referral, but it is not displayed broadly. Keep pilot data fake and non-PHI.
            </p>
          ) : null}

          <form action={updateReferralAction} className="mt-8 grid gap-5 border-t border-line pt-6 md:grid-cols-2">
            <input type="hidden" name="referralId" value={referral.id} />
            <label className="text-sm font-semibold text-ink">Status<select className="field" name="status" defaultValue={referral.status}>{REFERRAL_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
            <label className="text-sm font-semibold text-ink">Assigned therapist<select className="field" name="assignedTherapistId" defaultValue={referral.assignedTherapistId || ""}><option value="">Unassigned</option>{therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-ink md:col-span-2">Internal operational note <span className="font-normal text-slate-400">(no PHI or clinical detail)</span><textarea className="field min-h-32" name="notes" defaultValue={referral.notes || ""} /></label>
            <div className="md:col-span-2"><button className="btn-primary" type="submit"><Save size={18} />Save referral</button></div>
          </form>
        </div>

        <aside className="grid gap-5">
        <section className="rounded-lg border border-line bg-white p-6">
          <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Intake history</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Audit-safe intake events only. Raw blocked note text, full phones, raw SMS bodies, and provider payloads are not shown.</p>
          <div className="mt-5 space-y-3">
            {intakeAuditLogs.map((log: AuditLogListItem) => (
              <div key={log.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold text-ink">{log.action}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(log.createdAt)} · {log.actorType}</p>
              </div>
            ))}
            {intakeAuditLogs.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No intake events recorded yet.</p> : null}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-6">
          <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Audit trail</h2>
          <div className="mt-5 space-y-3">
            {referralAuditLogs.map((log: AuditLogListItem) => (
              <div key={log.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="font-semibold text-ink">{log.action}</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(log.createdAt)} · {log.actorType}</p>
              </div>
            ))}
            {referralAuditLogs.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No audit events recorded for this referral yet.</p> : null}
          </div>
        </section>
        </aside>
      </div>

      <section className="mt-8 rounded-lg border border-line bg-white p-6">
        <h2 className="text-xl font-semibold tracking-[-.02em] text-ink">Visits</h2>
        <div className="mt-5 space-y-5">
          {referralVisits.map((visit: ReferralDetailVisit) => (
            <form key={visit.id} action={saveVisitAction} className="grid gap-4 rounded-lg border border-line p-4 md:grid-cols-4">
              <input type="hidden" name="referralId" value={referral.id} />
              <input type="hidden" name="visitId" value={visit.id} />
              <label className="text-sm font-semibold text-ink">Scheduled<input className="field" name="scheduledAt" type="datetime-local" defaultValue={dateTimeLocalValue(visit.scheduledAt)} /></label>
              <label className="text-sm font-semibold text-ink">Status<select className="field" name="status" defaultValue={visit.status}>{VISIT_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select></label>
              <label className="text-sm font-semibold text-ink">Therapist<select className="field" name="therapistId" defaultValue={visit.therapistId || ""}><option value="">Unassigned</option>{therapistOptions.map((therapist: TherapistOption) => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}</select></label>
              <label className="text-sm font-semibold text-ink">Operational note<input className="field" name="notes" defaultValue={visit.notes || ""} /></label>
              <div className="md:col-span-4"><button className="btn-secondary" type="submit"><Save size={18} />Update visit</button></div>
            </form>
          ))}
          {referralVisits.length === 0 ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No visits created yet.</p> : null}
        </div>

        <div className="mt-6 border-t border-line pt-6">
          {createVisitGate.allowed && opportunityAllowsCreateVisit ? (
            <Link href={`/admin/visits/new?referralId=${referral.id}`} className="btn-primary">
              <CalendarPlus size={18} />
              Create visit
            </Link>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
              {createVisitGate.allowed ? "Create visit is suppressed until therapist acceptance is recorded." : "Create visit is review-only from this referral. Resolve the decision panel blockers before opening the manual visit creation flow."}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
