import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { classifyOperationalNote, hasBlockedNoteClassification } = await import("../lib/compliance/note-classification.ts");
const { getTherapistFieldWorkflowStatus, resolveTherapistFieldVisitAction } = await import("../lib/pilot/therapist-field-workflow.ts");

const myWorkPage = await readFile(new URL("../app/my-work/page.tsx", import.meta.url), "utf8");
const adminHealthPage = await readFile(new URL("../app/admin/health/page.tsx", import.meta.url), "utf8");
const adminLayout = await readFile(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");
const myWorkLayout = await readFile(new URL("../app/my-work/layout.tsx", import.meta.url), "utf8");

assert.match(myWorkPage, /data-therapist-field-workspace="phone-ipad"/, "My Work must expose the phone/iPad workspace marker.");
assert.match(myWorkPage, /Next field action/, "My Work must show a near-top next field action panel.");
assert.match(myWorkPage, /Phone and iPad field workspace/, "My Work must identify the responsive field workspace.");
assert.match(myWorkPage, /xl:grid-cols-\[minmax\(0,1fr\)_390px\]/, "My Work should use a larger-screen field rail without forcing phones into columns.");
assert.match(myWorkPage, /xl:hidden/, "My Work should keep phone/tablet ordering distinct from the desktop rail.");
assert.match(myWorkPage, /sticky top-6/, "Desktop/tablet field rail should keep the next action visible.");
assert.match(myWorkPage, /min-h-14/, "Field action buttons should be thumb-friendly.");
assert.match(myWorkPage, /sm:grid-cols-2 2xl:grid-cols-4/, "Field action buttons should adapt from phone to tablet/desktop.");
assert.match(myWorkPage, /listedTodayVisits/, "The top next-action visit should not be duplicated in the Today queue.");
assert.match(myWorkPage, /redactPhone\(visit\.referral\.phone\)/, "Visit phone display must stay masked.");
assert.match(myWorkPage, /redactPhone\(referral\.phone\)/, "Referral phone display must stay masked.");
assert.match(myWorkPage, /No PHI in notes/, "No-PHI guidance must remain close to visit note inputs.");
assert.match(myWorkPage, /No-PHI notes/, "Workspace readiness copy must remind users notes are no-PHI.");
assert.match(myWorkPage, /SchedulingIntelligencePanel/, "Scheduling intelligence must remain visible on My Work.");
assert.match(myWorkPage, /OperationsAssistantPanel/, "Operations Assistant must remain visible on My Work.");
assert.match(myWorkPage, /Read-only scheduling context/, "Scheduling context must be read-only.");
assert.match(myWorkPage, /No visits are created here/, "Scheduling context must not create visits from My Work.");
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

const fieldStatus = getTherapistFieldWorkflowStatus();
assert.equal(fieldStatus.phoneLayoutEnabled, true);
assert.equal(fieldStatus.ipadLayoutEnabled, true);
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

assert.match(adminHealthPage, /Field phone layout/);
assert.match(adminHealthPage, /Field iPad layout/);
assert.match(adminHealthPage, /Field no-PHI notes/);
assert.match(adminHealthPage, /Terminal visit lock/);

console.log("Therapist workspace smoke passed: phone/iPad layout markers, touch actions, no-PHI notes, terminal locks, future warning, RBAC, no SMS, and no external API surfaces verified.");
