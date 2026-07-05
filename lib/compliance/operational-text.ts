import { classifyOperationalNote, hasBlockedNoteClassification } from "./note-classification.ts";

export const OPERATIONAL_NOTE_PHI_ERROR =
  "Operational notes cannot include diagnoses, conditions, treatment details, medications, symptoms, or other PHI.";

export function hasForbiddenOperationalText(value: string | null | undefined) {
  return hasBlockedNoteClassification(classifyOperationalNote(value));
}

export function getOperationalTextGuardrailViolation(value: string | null | undefined) {
  return hasForbiddenOperationalText(value) ? OPERATIONAL_NOTE_PHI_ERROR : null;
}

export function assertOperationalTextSafe(value: string | null | undefined, fieldLabel = "Operational note") {
  const result = classifyOperationalNote(value, { fieldLabel });
  const violation = hasBlockedNoteClassification(result) ? OPERATIONAL_NOTE_PHI_ERROR : null;
  if (violation) throw new Error(violation);
}
