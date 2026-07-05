import {
  buildBlockedNoteSearchParams,
  classifyOperationalNote,
  suggestOperationalRewrite,
} from "../compliance/note-classification.ts";
import type {
  AdminDailyBriefingInput,
  OperationsAssistantConfig,
  OperationsAssistantRequest,
  OperationsAssistantSuggestion,
  OperationsAssistantTask,
  ReferralNextActionInput,
  SmsTemplateSafetyCheckInput,
  TherapistAssignmentSuggestionInput,
  VisitReadinessCheckInput,
} from "./schemas.ts";
import type { OperationsAssistantProvider } from "./provider.ts";

function baseSuggestion(
  task: OperationsAssistantTask,
  config: OperationsAssistantConfig,
  summary: string,
  data: Record<string, unknown>,
): OperationsAssistantSuggestion {
  return {
    audit: {
      accepted: false,
      auditOnly: config.auditOnly,
      mutationAllowed: false,
      smsSendAllowed: false,
    },
    confidence: "deterministic_mock",
    data,
    provider: "mock",
    safety: {
      canBypassCompliance: false,
      containsPhi: false,
      noPhiMode: config.noPhiMode,
    },
    status: config.enabled ? "mock" : "disabled",
    summary,
    task,
  };
}

function isString(value: string | null): value is string {
  return typeof value === "string";
}

function safeNoteRewrite(input: { noteText: string }, config: OperationsAssistantConfig) {
  const classification = classifyOperationalNote(input.noteText, { fieldLabel: "Operational note" });
  return baseSuggestion("safe_note_rewrite", config, classification.suggestedOperationalRewrite || "No rewrite needed.", {
    classification: classification.classification,
    futureDestinationHint: classification.futureDestinationHint,
    matchedCategories: classification.matchedCategories,
    redirectSearchIfBlocked: classification.severity === "block" ? buildBlockedNoteSearchParams(classification) : null,
    severity: classification.severity,
    suggestedOperationalRewrite: classification.suggestedOperationalRewrite || suggestOperationalRewrite(input.noteText) || null,
  });
}

function referralNextAction(input: ReferralNextActionInput, config: OperationsAssistantConfig) {
  const nextAction =
    input.referralStatus === "new"
      ? "Contact referral using approved non-PHI workflow."
      : input.visitCount === 0
        ? "Review scheduling readiness and create a visit when operational details are complete."
        : "Monitor visit status and audit trail.";

  return baseSuggestion("referral_next_action", config, nextAction, {
    nextAction,
    referralStatus: input.referralStatus,
    smsConsentStatus: input.smsConsentStatus ?? "unknown",
    visitCount: input.visitCount,
  });
}

function therapistAssignmentSuggestion(input: TherapistAssignmentSuggestionInput, config: OperationsAssistantConfig) {
  const summary =
    input.activeTherapists === 0
      ? "No active therapists are available for assignment."
      : input.unassignedReferrals > 0
        ? "Review unassigned referrals against active therapist coverage."
        : "No assignment action is needed.";

  return baseSuggestion("therapist_assignment_suggestion", config, summary, {
    activeTherapists: input.activeTherapists,
    city: input.city ?? null,
    unassignedReferrals: input.unassignedReferrals,
  });
}

function visitReadinessCheck(input: VisitReadinessCheckInput, config: OperationsAssistantConfig) {
  const blockers = [
    input.hasTherapist ? null : "Assign a therapist.",
    input.hasVisitTime ? null : "Set a visit time.",
    input.referralStatus === "canceled" ? "Referral is canceled." : null,
  ].filter(isString);

  return baseSuggestion(
    "visit_readiness_check",
    config,
    blockers.length > 0 ? "Visit is not ready for field workflow." : "Visit looks operationally ready.",
    {
      blockers,
      hasTherapist: input.hasTherapist,
      hasVisitTime: input.hasVisitTime,
      referralStatus: input.referralStatus,
      smsConsentStatus: input.smsConsentStatus ?? "unknown",
    },
  );
}

function smsTemplateSafetyCheck(input: SmsTemplateSafetyCheckInput, config: OperationsAssistantConfig) {
  const classification = classifyOperationalNote(input.templateBody, { fieldLabel: "SMS template", intent: "sms" });
  return baseSuggestion(
    "sms_template_safety_check",
    config,
    classification.severity === "block" ? "Template is not safe for SMS." : "Template appears safe for transactional SMS review.",
    {
      classification: classification.classification,
      matchedCategories: classification.matchedCategories,
      severity: classification.severity,
    },
  );
}

function adminDailyBriefing(input: AdminDailyBriefingInput, config: OperationsAssistantConfig) {
  const items = [
    `${input.referralsNeedContact} referrals need contact`,
    `${input.unscheduledVisits} visits unscheduled`,
    `${input.optedOutContacts} opted-out contact${input.optedOutContacts === 1 ? " requires" : "s require"} phone call`,
    `Real SMS test mode is ${input.realSmsTestMode ? "on" : "off"}`,
  ];

  return baseSuggestion("admin_daily_briefing", config, "Mock operations briefing generated from dashboard-safe counts.", {
    items,
  });
}

export const mockOperationsAssistantProvider: OperationsAssistantProvider = {
  name: "mock",
  async suggest<TTask extends OperationsAssistantTask>(
    request: OperationsAssistantRequest<TTask>,
    config: OperationsAssistantConfig,
  ) {
    switch (request.task) {
      case "safe_note_rewrite":
        return safeNoteRewrite(request.input as { noteText: string }, config);
      case "referral_next_action":
        return referralNextAction(request.input as ReferralNextActionInput, config);
      case "therapist_assignment_suggestion":
        return therapistAssignmentSuggestion(request.input as TherapistAssignmentSuggestionInput, config);
      case "visit_readiness_check":
        return visitReadinessCheck(request.input as VisitReadinessCheckInput, config);
      case "sms_template_safety_check":
        return smsTemplateSafetyCheck(request.input as SmsTemplateSafetyCheckInput, config);
      case "admin_daily_briefing":
        return adminDailyBriefing(request.input as AdminDailyBriefingInput, config);
    }
  },
};
