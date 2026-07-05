import {
  buildBlockedNoteSearchParams,
  classifyOperationalNote,
  getSafeBlockedNoteAuditMetadata,
  hasBlockedNoteClassification,
} from "@/lib/compliance/note-classification";
import { getPrismaClient } from "@/lib/db/prisma";

type BlockedOperationalNoteInput = Readonly<{
  actorId?: string | null;
  actorType: "pilot_admin" | "therapist_pilot" | "system";
  entityId?: string | null;
  entityType: "PatientReferral" | "Visit" | "OperationalNote";
  extra?: Record<string, string | number | boolean | null | undefined>;
  fieldLabel: string;
  route: string;
  value: string | null | undefined;
  workflow: string;
}>;

export async function getBlockedOperationalNoteRedirectSearch(input: BlockedOperationalNoteInput) {
  const result = classifyOperationalNote(input.value, { fieldLabel: input.fieldLabel });
  if (!hasBlockedNoteClassification(result)) return null;

  const prisma = getPrismaClient();
  await prisma.auditLog.create({
    data: {
      action: "operational_note_blocked",
      actorId: input.actorId || undefined,
      actorType: input.actorType,
      entityId: input.entityId || undefined,
      entityType: input.entityType,
      metadataJson: getSafeBlockedNoteAuditMetadata(result, {
        extra: input.extra,
        fieldLabel: input.fieldLabel,
        route: input.route,
        workflow: input.workflow,
      }),
    },
  }).catch(() => undefined);

  return buildBlockedNoteSearchParams(result);
}
