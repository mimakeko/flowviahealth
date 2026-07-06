import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { classifyOperationalNote, getSafeBlockedNoteAuditMetadata, hasBlockedNoteClassification } = await import("../lib/compliance/note-classification.ts");
const {
  getTherapistFieldWorkflowStatus,
  isTherapistFieldVisitActionConfirmed,
  resolveTherapistFieldVisitAction,
  THERAPIST_FIELD_CONFIRMATION_INTENT,
} = await import("../lib/pilot/therapist-field-workflow.ts");
const {
  getFieldWorkspaceEmptyState,
  getSafeWorkspaceLoadErrorMessage,
  getTherapistWorkspacePhoneDisplay,
  isReferralNeedingTherapistAction,
  THERAPIST_WORKSPACE_REFERRAL_SELECT,
  THERAPIST_WORKSPACE_THERAPIST_SELECT,
  THERAPIST_WORKSPACE_VISIT_ACTION_SELECT,
  THERAPIST_WORKSPACE_VISIT_SELECT,
} = await import("../lib/pilot/therapist-workspace.ts");

const myWorkPage = await readFile(new URL("../app/my-work/page.tsx", import.meta.url), "utf8");
const workspaceHelper = await readFile(new URL("../lib/pilot/therapist-workspace.ts", import.meta.url), "utf8");
const fieldWorkflow = await readFile(new URL("../lib/pilot/therapist-field-workflow.ts", import.meta.url), "utf8");
const pendingButton = await readFile(new URL("../components/pending-submit-button.tsx", import.meta.url), "utf8");
const transientBanner = await readFile(new URL("../components/transient-action-banner.tsx", import.meta.url), "utf8");

const workspaceRenderingSource = [myWorkPage, workspaceHelper, pendingButton, transientBanner].join("\n");

assert.doesNotMatch(workspaceRenderingSource, /\bnew PrismaClient\b/, "Workspace must keep using the Prisma wrapper and not construct PrismaClient directly.");
assert.match(myWorkPage, /getPrismaClient\(\)/, "My Work should keep using the existing Prisma wrapper.");
assert.doesNotMatch(myWorkPage, /include:\s*\{/, "My Work route queries should use explicit selects instead of nested includes.");
assert.doesNotMatch(workspaceHelper, /\bbody\b/i, "Workspace select helpers must not select raw SMS body fields.");
assert.doesNotMatch(workspaceRenderingSource, /\b(sendSms|sendMessage|telnyx\.messages|messagingProfile|SMS send|Send SMS)\b/i, "Workspace must not introduce SMS send controls or sending paths.");
assert.doesNotMatch(workspaceRenderingSource, /\b(googleapis|mapbox|geocode|geocoding|travelTime|routeOptimization|directionsService)\b/i, "Workspace must not introduce maps, geocoding, travel-time, or route APIs.");
assert.doesNotMatch(myWorkPage, /\b(fetch\(|axios|XMLHttpRequest|openai|anthropic)\b/i, "My Work must not introduce external AI/API calls.");

assert.deepEqual(THERAPIST_WORKSPACE_THERAPIST_SELECT, { id: true, name: true }, "Therapist selector should use a minimal therapist payload.");
assert.equal("body" in THERAPIST_WORKSPACE_REFERRAL_SELECT, false);
assert.equal("body" in THERAPIST_WORKSPACE_VISIT_SELECT, false);
assert.equal("body" in THERAPIST_WORKSPACE_VISIT_ACTION_SELECT, false);
assert.equal(getTherapistWorkspacePhoneDisplay("+15550112222"), "********2222", "Workspace phone display must mask full phone numbers.");

assert.equal(getFieldWorkspaceEmptyState("today").title, "No visits today");
assert.equal(getFieldWorkspaceEmptyState("upcoming").detail, "No upcoming visits assigned.");
assert.equal(getFieldWorkspaceEmptyState("completed").detail, "No recent field completions.");
assert.equal(getFieldWorkspaceEmptyState("referrals").detail, "No assigned referrals needing action.");
assert.doesNotMatch(getSafeWorkspaceLoadErrorMessage(), /\b(stack|Prisma|DATABASE_URL|postgres|pool|secret|token)\b/i, "Load error copy must not expose internals.");
assert.equal(isReferralNeedingTherapistAction({ status: "completed" }), false);
assert.equal(isReferralNeedingTherapistAction({ status: "contacted" }), true);

const terminal = resolveTherapistFieldVisitAction({
  action: "mark_completed",
  scheduledAt: new Date("2026-07-10T15:00:00.000Z"),
  status: "completed",
});
assert.equal(terminal?.allowed, false, "Terminal visits must remain protected.");
assert.equal(terminal?.terminalWarning, true, "Terminal visit protection must remain visible to callers.");

assert.equal(isTherapistFieldVisitActionConfirmed({
  action: "mark_completed",
  confirmationIntent: THERAPIST_FIELD_CONFIRMATION_INTENT,
}), true, "Valid confirmation requirement must remain enforced.");
assert.equal(isTherapistFieldVisitActionConfirmed({
  action: "mark_completed",
  confirmationIntent: null,
}), false, "Missing confirmation must remain blocked.");

const unsafeRawNote = "Patient medication changed before visit.";
const unsafe = classifyOperationalNote(unsafeRawNote, { fieldLabel: "Visit note" });
assert.equal(hasBlockedNoteClassification(unsafe), true, "Unsafe clinical note text must be classified as blocked.");
const safeMetadata = JSON.stringify(getSafeBlockedNoteAuditMetadata(unsafe, {
  extra: {
    attemptedAction: "mark_completed",
    referralId: "referral-safe-id",
    status: "scheduled",
    therapistId: "therapist-safe-id",
  },
  fieldLabel: "Visit note",
  route: "/my-work",
  workflow: "therapist_field_visit_action",
}));
assert.doesNotMatch(safeMetadata, /Patient medication changed before visit/i, "Blocked unsafe note text must not be persisted in safe metadata.");
assert.match(safeMetadata, /matchedCategoryCount/, "Safe metadata may keep category counts without storing the raw note body.");

const fieldStatus = getTherapistFieldWorkflowStatus();
assert.equal(fieldStatus.fieldWorkspaceOptimized, true);
assert.equal(fieldStatus.emptyStatesEnabled, true);
assert.equal(fieldStatus.mobileOverflowGuardEnabled, true);
assert.equal(fieldStatus.queryMinimizationEnabled, true);
assert.equal(fieldStatus.confirmationUxEnabled, true);
assert.equal(fieldStatus.terminalVisitLockEnabled, true);
assert.equal(fieldStatus.smsSendingEnabled, false);
assert.equal(fieldStatus.externalApisEnabled, false);
assert.equal(fieldStatus.externalAiEnabled, false);
assert.equal(fieldStatus.geocodingEnabled, false);
assert.equal(fieldStatus.travelTimeApisEnabled, false);
assert.equal(fieldStatus.autonomousStatusChangesEnabled, false);

assert.match(fieldWorkflow, /smsSendingEnabled: false/);
assert.match(fieldWorkflow, /externalApisEnabled: false/);
assert.match(fieldWorkflow, /autonomousStatusChangesEnabled: false/);

console.log("Therapist performance smoke passed: minimized selects, safe empty/loading copy, masked phones, confirmation/terminal guards, blocked-note safety, no SMS send path, no external APIs, and Prisma wrapper usage verified.");
