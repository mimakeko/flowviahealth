import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { normalizeE164Phone, safeBodyPreview } from "./compliance.ts";
import type { SmsAuditEvent, SmsEnrollment, SmsMessageLog, SmsStoreAdapter, SmsStoreSnapshot, TelnyxWebhookEventLog } from "./store-types.ts";

const EMPTY_STORE: SmsStoreSnapshot = { enrollments: [], messages: [], webhookEvents: [] };
const STORE_DIRECTORY = "data";
const DEFAULT_STORE_PATH = `${STORE_DIRECTORY}/flowvia-sms-store.json`;
const TEST_STORE_PATH = `${STORE_DIRECTORY}/flowvia-sms-store.test.json`;

function storePath() {
  return process.env.FLOWVIA_SMS_STORE_MODE === "test" ? TEST_STORE_PATH : DEFAULT_STORE_PATH;
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

async function readStore(): Promise<SmsStoreSnapshot> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<SmsStoreSnapshot>;
    return {
      enrollments: Array.isArray(parsed.enrollments) ? parsed.enrollments : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      webhookEvents: Array.isArray(parsed.webhookEvents) ? parsed.webhookEvents : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY_STORE };
    throw error;
  }
}

async function writeStore(snapshot: SmsStoreSnapshot) {
  await mkdir(STORE_DIRECTORY, { recursive: true });
  const targetPath = storePath();
  const tempPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(tempPath, targetPath);
}

async function mutateStore<T>(mutator: (snapshot: SmsStoreSnapshot) => T | Promise<T>) {
  const snapshot = await readStore();
  const result = await mutator(snapshot);
  await writeStore(snapshot);
  return result;
}

function audit(type: string, metadata?: SmsAuditEvent["metadata"]): SmsAuditEvent {
  return { id: createId("audit"), type, timestamp: new Date().toISOString(), metadata };
}

export function createJsonSmsStoreAdapter(): SmsStoreAdapter {
  return {
    async getSmsStoreSnapshot() {
      const snapshot = await readStore();
      return {
        enrollments: [...snapshot.enrollments].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        messages: [...snapshot.messages].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
        webhookEvents: [...(snapshot.webhookEvents ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      };
    },

    async findEnrollmentByPhone(phone) {
      const normalizedPhone = normalizeE164Phone(phone);
      const snapshot = await readStore();
      return snapshot.enrollments.find((enrollment) => enrollment.phone === normalizedPhone) ?? null;
    },

    async upsertPendingConsent(input) {
      const phone = normalizeE164Phone(input.phone);
      const now = new Date().toISOString();

      return mutateStore((snapshot) => {
        const existing = snapshot.enrollments.find((enrollment) => enrollment.phone === phone);
        if (existing) {
          existing.name = input.name;
          existing.email = input.email || undefined;
          existing.status = "pending_confirmation";
          existing.consentTimestamp = now;
          existing.updatedAt = now;
          existing.auditEvents.unshift(audit("consent_pending_confirmation", { source: "sms_consent_page" }));
          return existing;
        }

        const enrollment: SmsEnrollment = {
          id: createId("enrollment"),
          phone,
          name: input.name,
          email: input.email || undefined,
          status: "pending_confirmation",
          source: "sms_consent_page",
          consentTimestamp: now,
          createdAt: now,
          updatedAt: now,
          auditEvents: [audit("consent_pending_confirmation", { source: "sms_consent_page" })],
        };
        snapshot.enrollments.unshift(enrollment);
        return enrollment;
      });
    },

    async activateEnrollment(phone, eventType = "inbound_opt_in") {
      const normalizedPhone = normalizeE164Phone(phone);
      const now = new Date().toISOString();

      return mutateStore((snapshot) => {
        let enrollment = snapshot.enrollments.find((item) => item.phone === normalizedPhone);
        if (!enrollment) {
          enrollment = {
            id: createId("enrollment"),
            phone: normalizedPhone,
            name: "Unknown SMS contact",
            status: "active",
            source: "sms_consent_page",
            consentTimestamp: now,
            createdAt: now,
            updatedAt: now,
            auditEvents: [],
          };
          snapshot.enrollments.unshift(enrollment);
        }

        enrollment.status = "active";
        enrollment.lastConfirmedTimestamp = now;
        enrollment.updatedAt = now;
        enrollment.auditEvents.unshift(audit(eventType));
        return enrollment;
      });
    },

    async optOutEnrollment(phone, eventType = "inbound_opt_out") {
      const normalizedPhone = normalizeE164Phone(phone);
      const now = new Date().toISOString();

      return mutateStore((snapshot) => {
        let enrollment = snapshot.enrollments.find((item) => item.phone === normalizedPhone);
        if (!enrollment) {
          enrollment = {
            id: createId("enrollment"),
            phone: normalizedPhone,
            name: "Unknown SMS contact",
            status: "opted_out",
            source: "sms_consent_page",
            consentTimestamp: now,
            createdAt: now,
            updatedAt: now,
            auditEvents: [],
          };
          snapshot.enrollments.unshift(enrollment);
        }

        enrollment.status = "opted_out";
        enrollment.lastOptOutTimestamp = now;
        enrollment.updatedAt = now;
        enrollment.auditEvents.unshift(audit(eventType));
        return enrollment;
      });
    },

    async logSmsMessage(input) {
      const phone = normalizeE164Phone(input.phone);
      const message: SmsMessageLog = {
        id: createId("message"),
        direction: input.direction,
        phone,
        bodyPreview: safeBodyPreview(input.body),
        body: input.storeFullBody ? input.body : undefined,
        providerId: input.providerId,
        status: input.status,
        timestamp: new Date().toISOString(),
        eventType: input.eventType,
        enrollmentId: input.enrollmentId,
        dryRun: input.dryRun,
      };

      return mutateStore((snapshot) => {
        snapshot.messages.unshift(message);
        snapshot.messages = snapshot.messages.slice(0, 500);
        return message;
      });
    },

    async updateMessageDeliveryStatus(input) {
      const now = new Date().toISOString();
      return mutateStore((snapshot) => {
        const message = snapshot.messages.find((item) => {
          if (input.providerId) return item.providerId === input.providerId;
          return input.phone ? item.phone === normalizeE164Phone(input.phone) : false;
        });

        if (message) {
          message.status = input.status;
          message.eventType = input.eventType;
          message.timestamp = now;
          return message;
        }

        const placeholder: SmsMessageLog = {
          id: createId("message"),
          direction: "outbound",
          phone: input.phone ? normalizeE164Phone(input.phone) : "unknown",
          bodyPreview: "",
          providerId: input.providerId,
          status: input.status,
          timestamp: now,
          eventType: input.eventType,
        };
        snapshot.messages.unshift(placeholder);
        return placeholder;
      });
    },

    async recordTelnyxWebhookEvent(input) {
      const telnyxEventId = input.telnyxEventId || `unknown_${createId("event")}`;
      const now = new Date().toISOString();

      return mutateStore((snapshot) => {
        snapshot.webhookEvents ??= [];
        const existing = snapshot.webhookEvents.find((event) => event.telnyxEventId === telnyxEventId);
        if (existing) return { created: false, telnyxEventId };

        const event: TelnyxWebhookEventLog = {
          id: createId("webhook"),
          telnyxEventId,
          eventType: input.eventType,
          processedAt: input.processedAt,
          createdAt: now,
        };
        snapshot.webhookEvents.unshift(event);
        snapshot.webhookEvents = snapshot.webhookEvents.slice(0, 500);
        return { created: true, telnyxEventId };
      });
    },

    async resetSmsStoreForTests() {
      await writeStore({ enrollments: [], messages: [], webhookEvents: [] });
    },
  };
}
