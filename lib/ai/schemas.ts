export type OperationsAssistantTask =
  | "admin_daily_briefing"
  | "referral_next_action"
  | "safe_note_rewrite"
  | "sms_template_safety_check"
  | "therapist_assignment_suggestion"
  | "visit_readiness_check";

export type OperationsAssistantProviderName = "mock" | "none" | "openai";

export type OperationsAssistantConfig = Readonly<{
  auditOnly: boolean;
  enabled: boolean;
  noPhiMode: boolean;
  provider: OperationsAssistantProviderName;
}>;

export type OperationsAssistantRole = "admin" | "system" | "therapist";

export type SafeNoteRewriteInput = Readonly<{
  noteText: string;
}>;

export type ReferralNextActionInput = Readonly<{
  referralStatus: string;
  smsConsentStatus?: string | null;
  visitCount: number;
}>;

export type TherapistAssignmentSuggestionInput = Readonly<{
  activeTherapists: number;
  city?: string | null;
  unassignedReferrals: number;
}>;

export type VisitReadinessCheckInput = Readonly<{
  hasTherapist: boolean;
  hasVisitTime: boolean;
  referralStatus: string;
  smsConsentStatus?: string | null;
}>;

export type SmsTemplateSafetyCheckInput = Readonly<{
  templateBody: string;
}>;

export type AdminDailyBriefingInput = Readonly<{
  optedOutContacts: number;
  realSmsTestMode: boolean;
  referralsNeedContact: number;
  unscheduledVisits: number;
}>;

export type OperationsAssistantInputByTask = Readonly<{
  admin_daily_briefing: AdminDailyBriefingInput;
  referral_next_action: ReferralNextActionInput;
  safe_note_rewrite: SafeNoteRewriteInput;
  sms_template_safety_check: SmsTemplateSafetyCheckInput;
  therapist_assignment_suggestion: TherapistAssignmentSuggestionInput;
  visit_readiness_check: VisitReadinessCheckInput;
}>;

export type OperationsAssistantRequest<TTask extends OperationsAssistantTask = OperationsAssistantTask> = Readonly<{
  input: OperationsAssistantInputByTask[TTask];
  requestedByRole: OperationsAssistantRole;
  task: TTask;
}>;

export type OperationsAssistantSuggestion = Readonly<{
  audit: {
    accepted: false;
    auditOnly: boolean;
    mutationAllowed: false;
    smsSendAllowed: false;
  };
  confidence: "deterministic_mock";
  data: Record<string, unknown>;
  provider: OperationsAssistantProviderName;
  safety: {
    canBypassCompliance: false;
    containsPhi: false;
    noPhiMode: boolean;
  };
  status: "disabled" | "mock";
  summary: string;
  task: OperationsAssistantTask;
}>;
