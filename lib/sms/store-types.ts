export type ConsentStatus = "pending_confirmation" | "active" | "opted_out";
export type ConsentSource = "sms_consent_page";
export type MessageDirection = "inbound" | "outbound";

export type SmsAuditEvent = {
  id: string;
  type: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type SmsEnrollment = {
  id: string;
  phone: string;
  name: string;
  email?: string;
  status: ConsentStatus;
  source: ConsentSource;
  consentTimestamp: string;
  lastConfirmedTimestamp?: string;
  lastOptOutTimestamp?: string;
  createdAt: string;
  updatedAt: string;
  auditEvents: SmsAuditEvent[];
};

export type SmsMessageLog = {
  id: string;
  direction: MessageDirection;
  phone: string;
  bodyPreview: string;
  body?: string;
  providerId?: string;
  status?: string;
  timestamp: string;
  eventType: string;
  enrollmentId?: string;
  dryRun?: boolean;
};

export type TelnyxWebhookEventLog = {
  id: string;
  telnyxEventId: string;
  eventType: string;
  processedAt?: string;
  createdAt: string;
};

export type SmsStoreSnapshot = {
  enrollments: SmsEnrollment[];
  messages: SmsMessageLog[];
  webhookEvents?: TelnyxWebhookEventLog[];
};

export type SmsStoreAdapter = {
  getSmsStoreSnapshot(): Promise<SmsStoreSnapshot>;
  findEnrollmentByPhone(phone: string): Promise<SmsEnrollment | null>;
  upsertPendingConsent(input: { phone: string; name: string; email?: string }): Promise<SmsEnrollment>;
  activateEnrollment(phone: string, eventType?: string): Promise<SmsEnrollment>;
  optOutEnrollment(phone: string, eventType?: string): Promise<SmsEnrollment>;
  logSmsMessage(input: {
    direction: MessageDirection;
    phone: string;
    body: string;
    providerId?: string;
    status?: string;
    eventType: string;
    enrollmentId?: string;
    storeFullBody?: boolean;
    dryRun?: boolean;
  }): Promise<SmsMessageLog>;
  updateMessageDeliveryStatus(input: {
    providerId?: string;
    phone?: string;
    status: string;
    eventType: string;
  }): Promise<SmsMessageLog>;
  recordTelnyxWebhookEvent(input: {
    telnyxEventId?: string;
    eventType: string;
    payload: unknown;
    processedAt?: string;
  }): Promise<{ created: boolean; telnyxEventId: string }>;
  resetSmsStoreForTests(): Promise<void>;
};
