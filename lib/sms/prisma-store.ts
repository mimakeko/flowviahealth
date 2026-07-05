import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "../db/prisma.ts";
import { CONSENT_TEXT_VERSION, normalizeE164Phone, safeBodyPreview } from "./compliance.ts";
import type { ConsentSource, ConsentStatus, MessageDirection, SmsEnrollment, SmsMessageLog, SmsStoreAdapter, TelnyxWebhookEventLog } from "./store-types.ts";

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : undefined;
}

function auditMetadata(value: Prisma.JsonValue | null): Record<string, string | number | boolean | null> | undefined {
  if (!value || Array.isArray(value) || typeof value !== "object") return undefined;

  return Object.entries(value).reduce<Record<string, string | number | boolean | null>>((metadata, [key, item]) => {
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null) {
      metadata[key] = item;
    }
    return metadata;
  }, {});
}

async function writeAudit(input: {
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  const prisma = getPrismaClient();
  await prisma.auditLog.create({
    data: {
      actorType: "system",
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadataJson: input.metadata as Prisma.InputJsonObject | undefined,
    },
  });
}

async function mapEnrollment(record: {
  id: string;
  phone: string;
  normalizedPhone: string;
  fullName: string;
  email: string | null;
  status: string;
  source: string;
  confirmedAt: Date | null;
  optedOutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Promise<SmsEnrollment> {
  const prisma = getPrismaClient();
  const auditEvents = await prisma.auditLog.findMany({
    where: { entityType: "SmsConsentEnrollment", entityId: record.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    id: record.id,
    phone: record.normalizedPhone || record.phone,
    name: record.fullName,
    email: record.email ?? undefined,
    status: record.status as ConsentStatus,
    source: record.source as ConsentSource,
    consentTimestamp: record.createdAt.toISOString(),
    lastConfirmedTimestamp: toIso(record.confirmedAt),
    lastOptOutTimestamp: toIso(record.optedOutAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    auditEvents: auditEvents.map((event) => ({
      id: event.id,
      type: event.action,
      timestamp: event.createdAt.toISOString(),
      metadata: auditMetadata(event.metadataJson),
    })),
  };
}

function mapMessage(record: {
  id: string;
  direction: string;
  phone: string;
  body: string;
  providerMessageId: string | null;
  status: string | null;
  createdAt: Date;
  eventType: string;
  dryRun: boolean;
}): SmsMessageLog {
  return {
    id: record.id,
    direction: record.direction as MessageDirection,
    phone: record.phone,
    bodyPreview: safeBodyPreview(record.body),
    body: record.body,
    providerId: record.providerMessageId ?? undefined,
    status: record.status ?? undefined,
    timestamp: record.createdAt.toISOString(),
    eventType: record.eventType,
    dryRun: record.dryRun,
  };
}

function mapWebhookEvent(record: {
  id: string;
  telnyxEventId: string;
  eventType: string;
  processedAt: Date | null;
  createdAt: Date;
}): TelnyxWebhookEventLog {
  return {
    id: record.id,
    telnyxEventId: record.telnyxEventId,
    eventType: record.eventType,
    processedAt: toIso(record.processedAt),
    createdAt: record.createdAt.toISOString(),
  };
}

export function createPrismaSmsStoreAdapter(): SmsStoreAdapter {
  return {
    async getSmsStoreSnapshot() {
      const prisma = getPrismaClient();
      const [enrollmentRecords, messageRecords, webhookRecords] = await Promise.all([
        prisma.smsConsentEnrollment.findMany({
          orderBy: { updatedAt: "desc" },
          take: 200,
        }),
        prisma.smsMessage.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        prisma.telnyxWebhookEvent.findMany({
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
      ]);

      return {
        enrollments: await Promise.all(enrollmentRecords.map(mapEnrollment)),
        messages: messageRecords.map(mapMessage),
        webhookEvents: webhookRecords.map(mapWebhookEvent),
      };
    },

    async findEnrollmentByPhone(phone) {
      const prisma = getPrismaClient();
      const normalizedPhone = normalizeE164Phone(phone);
      const enrollment = await prisma.smsConsentEnrollment.findUnique({
        where: { normalizedPhone },
      });
      return enrollment ? mapEnrollment(enrollment) : null;
    },

    async upsertPendingConsent(input) {
      const prisma = getPrismaClient();
      const normalizedPhone = normalizeE164Phone(input.phone);
      const enrollment = await prisma.smsConsentEnrollment.upsert({
        where: { normalizedPhone },
        create: {
          phone: input.phone,
          normalizedPhone,
          fullName: input.name,
          email: input.email || undefined,
          status: "pending_confirmation",
          source: "sms_consent_page",
          consentTextVersion: CONSENT_TEXT_VERSION,
        },
        update: {
          phone: input.phone,
          fullName: input.name,
          email: input.email || undefined,
          status: "pending_confirmation",
          source: "sms_consent_page",
          consentTextVersion: CONSENT_TEXT_VERSION,
        },
      });

      await writeAudit({
        action: "consent_pending_confirmation",
        entityType: "SmsConsentEnrollment",
        entityId: enrollment.id,
        metadata: { source: "sms_consent_page" },
      });

      return mapEnrollment(enrollment);
    },

    async activateEnrollment(phone, eventType = "inbound_opt_in") {
      const prisma = getPrismaClient();
      const normalizedPhone = normalizeE164Phone(phone);
      const enrollment = await prisma.smsConsentEnrollment.upsert({
        where: { normalizedPhone },
        create: {
          phone: normalizedPhone,
          normalizedPhone,
          fullName: "Unknown SMS contact",
          status: "active",
          source: "sms_consent_page",
          consentTextVersion: CONSENT_TEXT_VERSION,
          confirmedAt: new Date(),
        },
        update: {
          status: "active",
          confirmedAt: new Date(),
        },
      });

      await writeAudit({
        action: eventType,
        entityType: "SmsConsentEnrollment",
        entityId: enrollment.id,
      });

      return mapEnrollment(enrollment);
    },

    async optOutEnrollment(phone, eventType = "inbound_opt_out") {
      const prisma = getPrismaClient();
      const normalizedPhone = normalizeE164Phone(phone);
      const enrollment = await prisma.smsConsentEnrollment.upsert({
        where: { normalizedPhone },
        create: {
          phone: normalizedPhone,
          normalizedPhone,
          fullName: "Unknown SMS contact",
          status: "opted_out",
          source: "sms_consent_page",
          consentTextVersion: CONSENT_TEXT_VERSION,
          optedOutAt: new Date(),
        },
        update: {
          status: "opted_out",
          optedOutAt: new Date(),
        },
      });

      await writeAudit({
        action: eventType,
        entityType: "SmsConsentEnrollment",
        entityId: enrollment.id,
      });

      return mapEnrollment(enrollment);
    },

    async logSmsMessage(input) {
      const prisma = getPrismaClient();
      const message = await prisma.smsMessage.create({
        data: {
          direction: input.direction,
          phone: normalizeE164Phone(input.phone),
          body: input.body,
          providerMessageId: input.providerId,
          status: input.status,
          eventType: input.eventType,
          dryRun: input.dryRun ?? false,
        },
      });
      return mapMessage(message);
    },

    async updateMessageDeliveryStatus(input) {
      const prisma = getPrismaClient();
      const normalizedPhone = input.phone ? normalizeE164Phone(input.phone) : "unknown";

      const existing = input.providerId
        ? await prisma.smsMessage.findFirst({ where: { providerMessageId: input.providerId }, orderBy: { createdAt: "desc" } })
        : null;

      if (existing) {
        const updated = await prisma.smsMessage.update({
          where: { id: existing.id },
          data: { status: input.status, eventType: input.eventType },
        });
        return mapMessage(updated);
      }

      const message = await prisma.smsMessage.create({
        data: {
          direction: "outbound",
          phone: normalizedPhone,
          body: "",
          providerMessageId: input.providerId,
          status: input.status,
          eventType: input.eventType,
        },
      });
      return mapMessage(message);
    },

    async recordTelnyxWebhookEvent(input) {
      const prisma = getPrismaClient();
      const telnyxEventId = input.telnyxEventId || `unknown_${randomUUID()}`;
      try {
        await prisma.telnyxWebhookEvent.create({
          data: {
            telnyxEventId,
            eventType: input.eventType,
            payloadJson: input.payload as Prisma.InputJsonValue,
            processedAt: input.processedAt ? new Date(input.processedAt) : undefined,
          },
        });
        return { created: true, telnyxEventId };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return { created: false, telnyxEventId };
        }
        throw error;
      }
    },

    async resetSmsStoreForTests() {
      if (process.env.NODE_ENV === "production") {
        throw new Error("Refusing to reset Prisma SMS tables in production.");
      }

      const prisma = getPrismaClient();
      await prisma.$transaction([
        prisma.auditLog.deleteMany(),
        prisma.telnyxWebhookEvent.deleteMany(),
        prisma.smsMessage.deleteMany(),
        prisma.smsConsentEnrollment.deleteMany(),
      ]);
    },
  };
}
