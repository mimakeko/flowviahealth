import type { NoteDestinationHint, NoteClassificationResult } from "./note-classification.ts";

export type SecureNoteAcknowledgementStatus = "not_required" | "required" | "acknowledged" | "disabled";

export type SecureNoteAcknowledgementReason =
  | "clinical_or_phi_like_content"
  | "secure_note_destination_required"
  | "pilot_no_phi_mode";

export type SecureNoteAcknowledgement = Readonly<{
  status: SecureNoteAcknowledgementStatus;
  required: boolean;
  acknowledgedByUserId?: string;
  acknowledgedAt?: string;
  reason?: SecureNoteAcknowledgementReason;
  auditEvent?: {
    action: "secure_note_acknowledgement_required" | "secure_note_acknowledged" | "secure_note_acknowledgement_disabled";
    metadataJson: Record<string, string | boolean | string[]>;
  };
  secureNoteDestination?: NoteDestinationHint;
}>;

export function secureClinicalNoteAcknowledgementEnabled() {
  return false;
}

export function getSecureNoteAcknowledgementPlaceholder(result: NoteClassificationResult): SecureNoteAcknowledgement {
  if (result.futureDestinationHint !== "future_secure_clinical_note_disabled") {
    return {
      required: false,
      status: "not_required",
      secureNoteDestination: result.futureDestinationHint,
    };
  }

  return {
    required: true,
    reason: "pilot_no_phi_mode",
    secureNoteDestination: result.futureDestinationHint,
    status: "disabled",
    auditEvent: {
      action: "secure_note_acknowledgement_disabled",
      metadataJson: {
        classification: result.classification,
        matchedCategories: result.matchedCategories,
        noPhiMode: true,
      },
    },
  };
}
