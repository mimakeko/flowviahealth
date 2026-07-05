import { createJsonSmsStoreAdapter } from "./json-store.ts";
import { createPrismaSmsStoreAdapter } from "./prisma-store.ts";
import { assertServerOnlyModule } from "./server-only.ts";
import type { SmsStoreAdapter } from "./store-types.ts";
export type {
  ConsentSource,
  ConsentStatus,
  MessageDirection,
  SmsAuditEvent,
  SmsEnrollment,
  SmsMessageLog,
  SmsStoreSnapshot,
} from "./store-types.ts";

assertServerOnlyModule();

let adapter: SmsStoreAdapter | null = null;

export type SmsStoreStatus = {
  backend: "json" | "prisma";
  label: string;
  reason: "database_configured" | "dev_database_missing" | "explicit_json" | "test_mode";
  warning?: string;
};

export function getSmsStoreStatus(): SmsStoreStatus {
  if (process.env.FLOWVIA_SMS_STORE_MODE === "test") {
    return {
      backend: "json",
      label: "JSON test store",
      reason: "test_mode",
      warning: "FLOWVIA_SMS_STORE_MODE=test is for route smokes only.",
    };
  }

  if (process.env.FLOWVIA_SMS_STORE_MODE === "json") {
    return {
      backend: "json",
      label: "JSON local store",
      reason: "explicit_json",
      warning: "Explicit JSON storage is local/dev only.",
    };
  }

  if (process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL) {
    return {
      backend: "json",
      label: "JSON dev fallback",
      reason: "dev_database_missing",
      warning: "DATABASE_URL is missing, so dev is using JSON fallback storage.",
    };
  }

  return {
    backend: "prisma",
    label: "Postgres",
    reason: "database_configured",
  };
}

function shouldUseJsonStore() {
  return getSmsStoreStatus().backend === "json";
}

function getSmsStoreAdapter() {
  if (adapter) return adapter;

  if (shouldUseJsonStore()) {
    adapter = createJsonSmsStoreAdapter();
    return adapter;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in production. Flowvia will not use local JSON SMS storage in production.");
  }

  adapter = createPrismaSmsStoreAdapter();
  return adapter;
}

export function getSmsStoreMode() {
  return getSmsStoreStatus().backend;
}

export async function getSmsStoreSnapshot() {
  return getSmsStoreAdapter().getSmsStoreSnapshot();
}

export async function findEnrollmentByPhone(phone: string) {
  return getSmsStoreAdapter().findEnrollmentByPhone(phone);
}

export async function upsertPendingConsent(input: { phone: string; name: string; email?: string }) {
  return getSmsStoreAdapter().upsertPendingConsent(input);
}

export async function activateEnrollment(phone: string, eventType = "inbound_opt_in") {
  return getSmsStoreAdapter().activateEnrollment(phone, eventType);
}

export async function optOutEnrollment(phone: string, eventType = "inbound_opt_out") {
  return getSmsStoreAdapter().optOutEnrollment(phone, eventType);
}

export async function logSmsMessage(input: Parameters<SmsStoreAdapter["logSmsMessage"]>[0]) {
  return getSmsStoreAdapter().logSmsMessage(input);
}

export async function updateMessageDeliveryStatus(input: Parameters<SmsStoreAdapter["updateMessageDeliveryStatus"]>[0]) {
  return getSmsStoreAdapter().updateMessageDeliveryStatus(input);
}

export async function recordTelnyxWebhookEvent(input: Parameters<SmsStoreAdapter["recordTelnyxWebhookEvent"]>[0]) {
  return getSmsStoreAdapter().recordTelnyxWebhookEvent(input);
}

export async function resetSmsStoreForTests() {
  await getSmsStoreAdapter().resetSmsStoreForTests();
}
