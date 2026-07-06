import type { Prisma } from "@prisma/client";
import { redactPhone } from "../sms/compliance.ts";

export type FieldVisitQueue = "today" | "upcoming" | "completed";
export type FieldWorkspaceEmptyStateKey = FieldVisitQueue | "referrals";

export const THERAPIST_WORKSPACE_THERAPIST_SELECT = {
  id: true,
  name: true,
} satisfies Prisma.TherapistSelect;

export const THERAPIST_WORKSPACE_REFERRAL_SELECT = {
  careType: true,
  city: true,
  id: true,
  notes: true,
  patientName: true,
  phone: true,
  status: true,
  visits: {
    orderBy: { scheduledAt: "asc" },
    select: {
      id: true,
      notes: true,
      scheduledAt: true,
      status: true,
    },
    take: 3,
  },
  zip: true,
} satisfies Prisma.PatientReferralSelect;

export const THERAPIST_WORKSPACE_VISIT_SELECT = {
  id: true,
  notes: true,
  scheduledAt: true,
  status: true,
  referral: {
    select: {
      city: true,
      id: true,
      patientName: true,
      phone: true,
      status: true,
      zip: true,
    },
  },
} satisfies Prisma.VisitSelect;

export const THERAPIST_WORKSPACE_VISIT_ACTION_SELECT = {
  id: true,
  notes: true,
  referralId: true,
  scheduledAt: true,
  status: true,
  referral: {
    select: {
      status: true,
    },
  },
} satisfies Prisma.VisitSelect;

export const FIELD_WORKSPACE_EMPTY_STATES: Record<FieldWorkspaceEmptyStateKey, { action: string; detail: string; title: string }> = {
  today: {
    action: "Review upcoming visits or assigned referrals.",
    detail: "No visits today.",
    title: "No visits today",
  },
  upcoming: {
    action: "Check referrals that are ready to schedule.",
    detail: "No upcoming visits assigned.",
    title: "No upcoming visits assigned",
  },
  completed: {
    action: "Completed field activity will appear here after manual confirmation.",
    detail: "No recent field completions.",
    title: "No recent field completions",
  },
  referrals: {
    action: "New assigned referrals that need contact or scheduling will appear here.",
    detail: "No assigned referrals needing action.",
    title: "No assigned referrals needing action",
  },
};

export function getFieldWorkspaceEmptyState(key: FieldWorkspaceEmptyStateKey) {
  return FIELD_WORKSPACE_EMPTY_STATES[key];
}

export function getFieldVisitQueueCopy(queue: FieldVisitQueue) {
  if (queue === "today") return "Due today and in-progress visits.";
  if (queue === "upcoming") return "Future assigned visits.";
  return "Locked terminal visits for review.";
}

export function getSafeWorkspaceLoadErrorMessage() {
  return "The field workspace could not load right now. Refresh or ask an admin to check Health Center readiness.";
}

export function getTherapistWorkspacePhoneDisplay(phone: string) {
  return redactPhone(phone);
}

export function isReferralNeedingTherapistAction(referral: { status: string }) {
  return !["completed", "canceled", "archived"].includes(referral.status);
}
