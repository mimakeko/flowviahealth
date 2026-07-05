import assert from "node:assert/strict";

async function main() {
  process.env.FLOWVIA_AI_ENABLED = "false";
  process.env.FLOWVIA_AI_PROVIDER = "mock";
  process.env.FLOWVIA_AI_NO_PHI_MODE = "true";
  process.env.FLOWVIA_AI_AUDIT_ONLY = "true";

  const {
    buildBlockedNoteSearchParams,
    classifyOperationalNote,
    describeNoteMatchedCategory,
    suggestOperationalRewrite,
  } = await import("../lib/compliance/note-classification.ts");
  const {
    getSecureNoteAcknowledgementPlaceholder,
    secureClinicalNoteAcknowledgementEnabled,
  } = await import("../lib/compliance/note-acknowledgement.ts");
  const { OPERATIONAL_NOTE_PHI_ERROR, assertOperationalTextSafe } = await import("../lib/compliance/operational-text.ts");
  const {
    getAdminDailyBriefingPreview,
    getOperationsAssistantStatus,
    getOperationsAssistantSuggestion,
  } = await import("../lib/ai/operations-assistant.ts");

  const als = classifyOperationalNote("Patient has ALS and needs extra time.", { fieldLabel: "Visit note" });
  assert.equal(als.classification, "phi_like_or_clinical");
  assert.equal(als.severity, "block");
  assert.ok(als.matchedCategories.includes("diagnosis_or_condition"));
  assert.equal(als.suggestedOperationalRewrite, "Allow extra time for mobility coordination. Do not include diagnosis in operational note.");
  assert.ok(!als.suggestedOperationalRewrite?.includes("ALS"));

  const diabetes = classifyOperationalNote("Patient has diabetes and needs morning visit.", { fieldLabel: "Referral note" });
  assert.equal(diabetes.suggestedOperationalRewrite, "Prefers morning visit window.");
  assert.ok(!diabetes.suggestedOperationalRewrite?.includes("diabetes"));

  const medication = classifyOperationalNote("Medication issue, call first.", { fieldLabel: "Therapist note" });
  assert.equal(medication.classification, "phi_like_or_clinical");
  assert.equal(medication.suggestedOperationalRewrite, "Call before visit for scheduling coordination.");

  const pain = classifyOperationalNote("Pain score is high.", { fieldLabel: "Visit note" });
  assert.equal(pain.suggestedOperationalRewrite, "Contact office before visit. Do not include clinical detail in operational note.");

  const safeNotes = ["Call before arrival", "Gate code needed", "Prefers morning scheduling", "Running 10 minutes late", "Test scheduling note"];
  for (const note of safeNotes) {
    assert.equal(classifyOperationalNote(note).classification, "operational_safe", note);
    assert.doesNotThrow(() => assertOperationalTextSafe(note), note);
  }

  assert.throws(
    () => assertOperationalTextSafe("Patient has diabetes"),
    (error) => error instanceof Error && error.message === OPERATIONAL_NOTE_PHI_ERROR,
  );

  const ambiguous = classifyOperationalNote("Patient needs morning scheduling.");
  assert.equal(ambiguous.classification, "ambiguous");
  assert.equal(ambiguous.severity, "warn");

  const sms = classifyOperationalNote("Patient has diabetes", { fieldLabel: "SMS template", intent: "sms" });
  assert.equal(sms.classification, "sms_forbidden");
  assert.equal(sms.futureDestinationHint, "sms_forbidden");

  const blockedSearch = buildBlockedNoteSearchParams(als);
  assert.ok(blockedSearch.includes("error=blocked_note"));
  assert.ok(!blockedSearch.includes("ALS"));
  assert.equal(describeNoteMatchedCategory("medication"), "Medication");
  assert.equal(suggestOperationalRewrite("Medication issue, call first."), "Call before visit for scheduling coordination.");

  assert.equal(secureClinicalNoteAcknowledgementEnabled(), false);
  const acknowledgement = getSecureNoteAcknowledgementPlaceholder(als);
  assert.equal(acknowledgement.status, "disabled");
  assert.equal(acknowledgement.required, true);

  const assistantStatus = getOperationsAssistantStatus();
  assert.equal(assistantStatus.enabled, false);
  assert.equal(assistantStatus.provider, "mock");
  assert.equal(assistantStatus.realProviderCallsEnabled, false);

  const briefing = await getAdminDailyBriefingPreview({
    optedOutContacts: 1,
    realSmsTestMode: false,
    referralsNeedContact: 3,
    unscheduledVisits: 2,
  });
  assert.equal(briefing.status, "disabled");
  assert.deepEqual(briefing.data.items, [
    "3 referrals need contact",
    "2 visits unscheduled",
    "1 opted-out contact requires phone call",
    "Real SMS test mode is off",
  ]);
  assert.equal(briefing.audit.mutationAllowed, false);
  assert.equal(briefing.audit.smsSendAllowed, false);
  assert.equal(briefing.safety.canBypassCompliance, false);

  const rewrite = await getOperationsAssistantSuggestion({
    input: { noteText: "Patient has ALS and needs extra time." },
    requestedByRole: "admin",
    task: "safe_note_rewrite",
  });
  assert.equal(rewrite.data.suggestedOperationalRewrite, als.suggestedOperationalRewrite);
  assert.ok(!JSON.stringify(rewrite.data).includes("ALS"));

  console.log("Note classification smoke passed: blocked notes classified, safe rewrites generated, acknowledgements disabled, and AI mock stayed non-mutating.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Note classification smoke failed.");
  process.exitCode = 1;
});
