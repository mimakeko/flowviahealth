export type NoteClassification = "operational_safe" | "phi_like_or_clinical" | "sms_forbidden" | "ambiguous";
export type NoteSeverity = "allow" | "warn" | "block";
export type NoteDestinationHint = "operational_note" | "future_secure_clinical_note_disabled" | "sms_forbidden";

export type NoteMatchedCategory =
  | "ambiguous_context"
  | "clinical_measurement"
  | "clinical_note_reference"
  | "diagnosis_or_condition"
  | "long_sms_free_text"
  | "medication"
  | "symptom_or_status"
  | "treatment_or_care_plan";

export type NoteClassificationIntent = "operational_note" | "sms";

export type NoteClassificationOptions = Readonly<{
  fieldLabel?: string;
  intent?: NoteClassificationIntent;
}>;

export type NoteClassificationResult = Readonly<{
  classification: NoteClassification;
  severity: NoteSeverity;
  matchedCategories: NoteMatchedCategory[];
  matchedTerms: string[];
  explanation: string;
  suggestedOperationalRewrite?: string;
  futureDestinationHint: NoteDestinationHint;
}>;

export const NOTE_PILOT_FIELD_REMINDER =
  "Do not enter PHI, diagnosis, treatment details, medications, symptoms, or clinical notes in this pilot field.";

export const SECURE_CLINICAL_NOTES_DISABLED_MESSAGE =
  "Secure clinical notes are not enabled in this pilot. Use your approved clinical documentation system for PHI.";

const operationalSafeExplanation = "This note appears limited to scheduling, access, or workflow coordination.";

type TermRule = Readonly<{
  category: NoteMatchedCategory;
  terms: readonly string[];
}>;

const clinicalTermRules: readonly TermRule[] = [
  {
    category: "diagnosis_or_condition",
    terms: [
      "ALS",
      "cancer",
      "condition",
      "diagnosis",
      "diagnoses",
      "diabetes",
      "dementia",
      "stroke",
      "history of stroke",
      "hypertension",
    ],
  },
  {
    category: "medication",
    terms: [
      "eliquis",
      "gabapentin",
      "hydrocodone",
      "insulin",
      "lisinopril",
      "medication",
      "medications",
      "medication list",
      "metformin",
      "morphine",
      "oxycodone",
      "prednisone",
      "warfarin",
    ],
  },
  {
    category: "treatment_or_care_plan",
    terms: ["therapy plan", "treatment", "wound care", "care plan", "clinical plan"],
  },
  {
    category: "clinical_measurement",
    terms: ["blood pressure", "pain score", "vitals", "oxygen saturation"],
  },
  {
    category: "symptom_or_status",
    terms: ["symptom", "symptoms", "symptoms worse", "worse today", "pain is high", "high pain"],
  },
  {
    category: "clinical_note_reference",
    terms: ["clinical note", "clinical notes", "medical record", "chart note", "wound"],
  },
] as const;

const ambiguousOperationalContextTerms = [
  "patient needs",
  "patient requires",
  "patient issue",
  "patient problem",
  "health issue",
  "medical issue",
  "status worse",
] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function termPattern(term: string) {
  return new RegExp(`\\b${escapeRegExp(term).replaceAll(" ", "\\s+")}\\b`, "i");
}

function normalizedText(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function uniqueValues<T>(values: readonly T[]) {
  return Array.from(new Set(values));
}

function matchingClinicalTerms(text: string) {
  const matchedCategories: NoteMatchedCategory[] = [];
  const matchedTerms: string[] = [];

  for (const rule of clinicalTermRules) {
    for (const term of rule.terms) {
      if (termPattern(term).test(text)) {
        matchedCategories.push(rule.category);
        matchedTerms.push(term);
      }
    }
  }

  return {
    matchedCategories: uniqueValues(matchedCategories),
    matchedTerms: uniqueValues(matchedTerms),
  };
}

function matchingAmbiguousCategories(text: string) {
  return ambiguousOperationalContextTerms.some((term) => termPattern(term).test(text)) ? (["ambiguous_context"] as const) : [];
}

function isLongSmsFreeText(text: string) {
  if (text.length < 160) return false;
  return /\b(patient|clinical|medical|issue|concern|history|today|needs|requires)\b/i.test(text);
}

export function suggestOperationalRewrite(value: string | null | undefined) {
  const text = normalizedText(value).toLowerCase();
  if (!text) return undefined;

  if (/\b(morning|am visit|early)\b/i.test(text)) {
    return "Prefers morning visit window.";
  }

  if (/\b(extra time|more time|additional time|longer visit)\b/i.test(text)) {
    return "Allow extra time for mobility coordination. Do not include diagnosis in operational note.";
  }

  if (/\b(gate|gate code|door code|side entrance|entrance)\b/i.test(text)) {
    return "Confirm access details before arrival.";
  }

  if (/\b(call|phone|contact)\b/i.test(text) && /\b(first|before|prior|ahead)\b/i.test(text)) {
    return "Call before visit for scheduling coordination.";
  }

  if (/\b(medication|medications|meds|insulin|metformin|lisinopril|eliquis|warfarin)\b/i.test(text)) {
    return "Call before visit for scheduling coordination.";
  }

  if (/\b(pain score|blood pressure|vitals|symptom|symptoms|worse today|wound|treatment)\b/i.test(text)) {
    return "Contact office before visit. Do not include clinical detail in operational note.";
  }

  if (/\b(late|running late|delay|delayed)\b/i.test(text)) {
    return "Running behind; update visit timing.";
  }

  if (/\b(call|phone|contact)\b/i.test(text)) {
    return "Call before visit for scheduling coordination.";
  }

  return "Contact office before visit. Do not include clinical detail in operational note.";
}

export function classifyOperationalNote(
  value: string | null | undefined,
  options: NoteClassificationOptions = {},
): NoteClassificationResult {
  const text = normalizedText(value);
  const fieldLabel = options.fieldLabel || "Operational note";
  const intent = options.intent || "operational_note";

  if (!text) {
    return {
      classification: "operational_safe",
      severity: "allow",
      matchedCategories: [],
      matchedTerms: [],
      explanation: `${fieldLabel} is blank.`,
      futureDestinationHint: "operational_note",
    };
  }

  const clinicalMatches = matchingClinicalTerms(text);
  const hasClinicalMatch = clinicalMatches.matchedCategories.length > 0;

  if (intent === "sms" && (hasClinicalMatch || isLongSmsFreeText(text))) {
    const matchedCategories = hasClinicalMatch
      ? clinicalMatches.matchedCategories
      : (["long_sms_free_text"] as NoteMatchedCategory[]);

    return {
      classification: "sms_forbidden",
      severity: "block",
      matchedCategories,
      matchedTerms: clinicalMatches.matchedTerms,
      explanation: "SMS cannot include clinical, PHI-like, or long free-text clinical content.",
      suggestedOperationalRewrite: suggestOperationalRewrite(text),
      futureDestinationHint: "sms_forbidden",
    };
  }

  if (hasClinicalMatch) {
    return {
      classification: "phi_like_or_clinical",
      severity: "block",
      matchedCategories: clinicalMatches.matchedCategories,
      matchedTerms: clinicalMatches.matchedTerms,
      explanation: `${fieldLabel} appears to include diagnosis, treatment, medication, symptom, measurement, or other clinical content.`,
      suggestedOperationalRewrite: suggestOperationalRewrite(text),
      futureDestinationHint: "future_secure_clinical_note_disabled",
    };
  }

  const ambiguousCategories = matchingAmbiguousCategories(text);
  if (ambiguousCategories.length > 0) {
    return {
      classification: "ambiguous",
      severity: "warn",
      matchedCategories: [...ambiguousCategories],
      matchedTerms: [],
      explanation: `${fieldLabel} may be operational, but the wording has clinical-risk context. Keep it logistics-only.`,
      suggestedOperationalRewrite: suggestOperationalRewrite(text),
      futureDestinationHint: "operational_note",
    };
  }

  return {
    classification: "operational_safe",
    severity: "allow",
    matchedCategories: [],
    matchedTerms: [],
    explanation: operationalSafeExplanation,
    futureDestinationHint: "operational_note",
  };
}

export function hasBlockedNoteClassification(result: NoteClassificationResult) {
  return result.severity === "block";
}

export function describeNoteMatchedCategory(category: string | null | undefined) {
  const labels: Record<NoteMatchedCategory, string> = {
    ambiguous_context: "Ambiguous operational wording",
    clinical_measurement: "Clinical measurement",
    clinical_note_reference: "Clinical note reference",
    diagnosis_or_condition: "Diagnosis or condition",
    long_sms_free_text: "Long SMS free text",
    medication: "Medication",
    symptom_or_status: "Symptom or status",
    treatment_or_care_plan: "Treatment or care plan",
  };

  return category && category in labels ? labels[category as NoteMatchedCategory] : "Clinical or PHI-like content";
}

export function describeNoteDestinationHint(destination: string | null | undefined) {
  const labels: Record<NoteDestinationHint, string> = {
    future_secure_clinical_note_disabled: "Future secure clinical note workflow (disabled)",
    operational_note: "Operational note",
    sms_forbidden: "SMS forbidden",
  };

  return destination && destination in labels ? labels[destination as NoteDestinationHint] : labels.future_secure_clinical_note_disabled;
}

export function buildBlockedNoteSearchParams(result: NoteClassificationResult) {
  const params = new URLSearchParams();
  params.set("error", "blocked_note");
  params.set("noteClassification", result.classification);
  params.set("noteDestination", result.futureDestinationHint);

  const primaryCategory = result.matchedCategories[0];
  if (primaryCategory) params.set("noteCategory", primaryCategory);
  if (result.suggestedOperationalRewrite) params.set("noteSuggestion", result.suggestedOperationalRewrite);

  return params.toString();
}

export function getSafeBlockedNoteAuditMetadata(
  result: NoteClassificationResult,
  context: Readonly<{
    fieldLabel: string;
    route: string;
    workflow: string;
    extra?: Record<string, string | number | boolean | null | undefined>;
  }>,
) {
  return {
    classification: result.classification,
    destinationHint: result.futureDestinationHint,
    fieldLabel: context.fieldLabel,
    matchedCategories: result.matchedCategories,
    route: context.route,
    severity: result.severity,
    suggestedOperationalRewriteAvailable: Boolean(result.suggestedOperationalRewrite),
    workflow: context.workflow,
    ...(context.extra ? { context: context.extra } : {}),
  };
}
