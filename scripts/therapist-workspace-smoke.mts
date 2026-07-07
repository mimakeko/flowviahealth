import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { classifyOperationalNote, hasBlockedNoteClassification } = await import("../lib/compliance/note-classification.ts");
const {
  getTherapistFieldWorkflowStatus,
  isTherapistFieldVisitActionConfirmed,
  resolveTherapistFieldVisitAction,
  THERAPIST_FIELD_CONFIRMATION_INTENT,
} = await import("../lib/pilot/therapist-field-workflow.ts");

const myWorkPage = await readFile(new URL("../app/my-work/page.tsx", import.meta.url), "utf8");
const myWorkLoading = await readFile(new URL("../app/my-work/loading.tsx", import.meta.url), "utf8");
const myWorkError = await readFile(new URL("../app/my-work/error.tsx", import.meta.url), "utf8");
const transientActionBanner = await readFile(new URL("../components/transient-action-banner.tsx", import.meta.url), "utf8");
const adminHealthPage = await readFile(new URL("../app/admin/health/page.tsx", import.meta.url), "utf8");
const adminLayout = await readFile(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");
const myWorkLayout = await readFile(new URL("../app/my-work/layout.tsx", import.meta.url), "utf8");

assert.match(myWorkPage, /data-therapist-field-workspace="phone-ipad"/, "My Work must expose the phone/iPad workspace marker.");
assert.match(myWorkPage, /Next field action/, "My Work must show a near-top next field action panel.");
assert.match(myWorkPage, /Therapist field workspace/, "My Work must identify the therapist field workspace.");
assert.match(myWorkPage, /Today&apos;s field focus/, "My Work should lead with today's field focus.");
assert.match(myWorkPage, /getNextFieldAction/, "My Work should derive one prioritized next field action.");
assert.match(myWorkPage, /New referral opportunities/, "My Work should separate new opportunities from assigned work.");
assert.match(myWorkPage, /Needs attention/, "My Work should include a compact attention section.");
assert.match(myWorkPage, /Lower-priority details/, "My Work should demote completed and lower-priority details.");
assert.doesNotMatch(myWorkPage, /xl:grid-cols-\[minmax\(0,1fr\)_390px\]/, "My Work should not keep the old dashboard rail layout.");
assert.match(myWorkPage, /min-h-14/, "Field action buttons should be thumb-friendly.");
assert.match(myWorkPage, /sm:grid-cols-2 2xl:grid-cols-4/, "Field action buttons should adapt from phone to tablet/desktop.");
assert.match(myWorkPage, /Open visit/, "The top next-action panel should jump to the full visit action card.");
assert.match(myWorkPage, /id=\{visitDomId\(visit\.id\)\}/, "Visit cards should expose stable anchors for the next-action jump.");
assert.match(myWorkPage, /FieldWorkspaceEmptyState/, "My Work must render centralized calm empty states.");
assert.match(myWorkPage, /TransientActionBanner/, "Action banners should clear transient query params after rendering.");
assert.match(myWorkPage, /PendingSubmitButton/, "Manual action forms should prevent accidental double submits while pending.");
assert.match(myWorkLoading, /Loading the field workspace/, "My Work should provide a calm loading state.");
assert.match(myWorkError, /Field workspace unavailable/, "My Work should provide a safe operational error state.");
assert.doesNotMatch(myWorkPage, /listedTodayVisits|listedUpcomingVisits|listedCompletedVisits/, "Assigned visits should remain visible in their queue instead of being hidden behind the summary card.");
assert.match(myWorkPage, /THERAPIST_FIELD_CONFIRMATION_INTENT/, "Visit status writes must carry a confirmation intent.");
assert.match(myWorkPage, /<details/, "Visit status writes should use inline confirmation disclosures.");
assert.match(myWorkPage, /confirmation_required/, "Missing confirmation should produce a safe error banner.");
assert.match(transientActionBanner, /role="status"/, "Successful visit writes should show a safe success banner.");
assert.match(transientActionBanner, /role="alert"/, "Validation failures should show a safe error banner.");
assert.match(myWorkPage, /getTherapistWorkspacePhoneDisplay\(visit\.referral\.phone\)/, "Visit phone display must stay masked.");
assert.match(myWorkPage, /getTherapistWorkspacePhoneDisplay\(referral\.phone\)/, "Referral phone display must stay masked.");
assert.match(myWorkPage, /No PHI in notes/, "No-PHI guidance must remain close to visit note inputs.");
assert.match(myWorkPage, /notes stay no PHI/, "Workspace copy must remind users notes are no-PHI.");
assert.doesNotMatch(myWorkPage, /SchedulingIntelligencePanel/, "Scheduling intelligence panel should not dominate My Work.");
assert.doesNotMatch(myWorkPage, /OperationsAssistantPanel/, "Operations Assistant panel should not dominate My Work.");
assert.doesNotMatch(myWorkPage, /deterministic, therapist-scoped guidance/i, "My Work should not lead with system-style assistant copy.");
assert.match(myWorkPage, /requirePilotSession\(\["admin", "therapist"\]/, "My Work must stay admin/therapist scoped.");
assert.match(myWorkLayout, /requirePilotSession\(\["admin", "therapist"\]/, "My Work layout must stay admin/therapist scoped.");
assert.match(adminLayout, /requirePilotSession\(\["admin"\]/, "Admin layout must remain admin-only.");

assert.doesNotMatch(myWorkPage, /\b(sendSms|sendMessage|telnyx\.messages|messagingProfile|SMS send|Send SMS)\b/i, "My Work must not add SMS send controls or sending paths.");
assert.doesNotMatch(myWorkPage, /\b(googleapis|mapbox|geocode|geocoding|travelTime|routeOptimization|directionsService)\b/i, "My Work must not add maps, geocoding, travel-time, or route APIs.");
assert.doesNotMatch(myWorkPage, /\b(openai|anthropic|fetch\(|axios|XMLHttpRequest)\b/i, "My Work must not add external AI/API calls.");

const unsafe = classifyOperationalNote("Patient medication list changed.", { fieldLabel: "Visit note" });
assert.equal(hasBlockedNoteClassification(unsafe), true, "Unsafe clinical/PHI-like notes must be blocked.");

const terminal = resolveTherapistFieldVisitAction({
  action: "mark_completed",
  now: new Date("2026-07-10T16:00:00.000Z"),
  scheduledAt: new Date("2026-07-10T15:00:00.000Z"),
  status: "completed",
});
assert.equal(terminal?.allowed, false, "Terminal visits must not allow therapist field updates.");
assert.equal(terminal?.terminalWarning, true, "Terminal visit protection should expose a terminal warning.");

const futureCompletion = resolveTherapistFieldVisitAction({
  action: "mark_completed",
  now: new Date("2026-07-10T16:00:00.000Z"),
  scheduledAt: new Date("2026-07-12T15:00:00.000Z"),
  status: "scheduled",
});
assert.equal(futureCompletion?.allowed, true, "Future completion remains a manual action, not an automatic block.");
assert.equal(futureCompletion?.earlyCompletionWarning, true, "Future completion must keep an auditable warning flag.");

assert.equal(isTherapistFieldVisitActionConfirmed({
  action: "mark_completed",
  confirmationIntent: THERAPIST_FIELD_CONFIRMATION_INTENT,
}), true, "Valid confirmation intent should allow a manual visit action to proceed.");
assert.equal(isTherapistFieldVisitActionConfirmed({
  action: "mark_completed",
  confirmationIntent: null,
}), false, "Missing confirmation intent must block a manual visit action.");

const fieldStatus = getTherapistFieldWorkflowStatus();
assert.equal(fieldStatus.phoneLayoutEnabled, true);
assert.equal(fieldStatus.ipadLayoutEnabled, true);
assert.equal(fieldStatus.emptyStatesEnabled, true);
assert.equal(fieldStatus.fieldWorkspaceOptimized, true);
assert.equal(fieldStatus.mobileOverflowGuardEnabled, true);
assert.equal(fieldStatus.mobileActionUxEnabled, true);
assert.equal(fieldStatus.queryMinimizationEnabled, true);
assert.equal(fieldStatus.confirmationUxEnabled, true);
assert.equal(fieldStatus.therapistFieldConfirmationsEnabled, true);
assert.equal(fieldStatus.safeBlockedNoteFeedbackEnabled, true);
assert.equal(fieldStatus.therapistFieldActivityAuditEnabled, true);
assert.equal(fieldStatus.manualOnly, true);
assert.equal(fieldStatus.noPhiMode, true);
assert.equal(fieldStatus.noPhiNotesEnforced, true);
assert.equal(fieldStatus.terminalVisitLockEnabled, true);
assert.equal(fieldStatus.smsSendingEnabled, false);
assert.equal(fieldStatus.externalApisEnabled, false);
assert.equal(fieldStatus.externalAiEnabled, false);
assert.equal(fieldStatus.geocodingEnabled, false);
assert.equal(fieldStatus.travelTimeApisEnabled, false);
assert.equal(fieldStatus.autonomousStatusChangesEnabled, false);

assert.match(adminHealthPage, /Field workspace optimized/);
assert.match(adminHealthPage, /Empty states/);
assert.match(adminHealthPage, /Mobile overflow guard/);
assert.match(adminHealthPage, /Query minimization/);
assert.match(adminHealthPage, /Confirmation UX/);
assert.match(adminHealthPage, /No SMS controls/);
assert.match(adminHealthPage, /No external APIs/);
assert.match(adminHealthPage, /No autonomous actions/);
assert.match(adminHealthPage, /Field phone layout/);
assert.match(adminHealthPage, /Field iPad layout/);
assert.match(adminHealthPage, /Field no-PHI notes/);
assert.match(adminHealthPage, /Therapist field confirmations/);
assert.match(adminHealthPage, /Mobile action UX/);
assert.match(adminHealthPage, /Blocked note safe feedback/);
assert.match(adminHealthPage, /Field activity audit/);
assert.match(adminHealthPage, /Autonomous field actions/);
assert.match(adminHealthPage, /External AI\/API for field notes/);
assert.match(adminHealthPage, /PHI note storage/);
assert.match(adminHealthPage, /Terminal visit lock/);

console.log("Therapist workspace smoke passed: field focus hierarchy, next action, opportunities, no-PHI notes, terminal locks, RBAC, no SMS, and no external API surfaces verified.");
