export const SMS_TEMPLATE_IDS = {
  CONSENT_CONFIRMATION: "consent_confirmation",
  OPT_IN_CONFIRMED: "opt_in_confirmed",
  HELP: "help",
  OPT_OUT_CONFIRMED: "opt_out_confirmed",
  APPOINTMENT_UPDATE_PLACEHOLDER: "appointment_update_placeholder",
  SERVICE_UPDATE_PLACEHOLDER: "service_update_placeholder",
} as const;

export type SmsTemplateId = (typeof SMS_TEMPLATE_IDS)[keyof typeof SMS_TEMPLATE_IDS];

export type SmsTemplate = {
  body: string;
  id: SmsTemplateId;
  transactionalOnly: true;
};

export const SMS_TEMPLATES: Record<SmsTemplateId, SmsTemplate> = {
  [SMS_TEMPLATE_IDS.CONSENT_CONFIRMATION]: {
    id: SMS_TEMPLATE_IDS.CONSENT_CONFIRMATION,
    transactionalOnly: true,
    body: "Flowvia Health: Reply YES to confirm enrollment in transactional SMS notifications for appointments, reminders, care coordination, and service updates. Msg & data rates may apply. Reply STOP to opt out.",
  },
  [SMS_TEMPLATE_IDS.OPT_IN_CONFIRMED]: {
    id: SMS_TEMPLATE_IDS.OPT_IN_CONFIRMED,
    transactionalOnly: true,
    body: "Flowvia Health: You are subscribed to transactional SMS notifications for appointment scheduling, reminders, care coordination, and service updates. Message frequency varies. Message and data rates may apply. Reply HELP for assistance or STOP to opt out.",
  },
  [SMS_TEMPLATE_IDS.HELP]: {
    id: SMS_TEMPLATE_IDS.HELP,
    transactionalOnly: true,
    body: "Flowvia Health: Visit https://flowviahealth.com/contact or email support@flowviahealth.com for assistance. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out. Do not use SMS for emergencies.",
  },
  [SMS_TEMPLATE_IDS.OPT_OUT_CONFIRMED]: {
    id: SMS_TEMPLATE_IDS.OPT_OUT_CONFIRMED,
    transactionalOnly: true,
    body: "Flowvia Health: You have been unsubscribed and will no longer receive SMS messages. Reply START to subscribe again.",
  },
  [SMS_TEMPLATE_IDS.APPOINTMENT_UPDATE_PLACEHOLDER]: {
    id: SMS_TEMPLATE_IDS.APPOINTMENT_UPDATE_PLACEHOLDER,
    transactionalOnly: true,
    body: "Flowvia Health: Appointment scheduling update. Please contact Flowvia Health if you have questions. Reply STOP to opt out.",
  },
  [SMS_TEMPLATE_IDS.SERVICE_UPDATE_PLACEHOLDER]: {
    id: SMS_TEMPLATE_IDS.SERVICE_UPDATE_PLACEHOLDER,
    transactionalOnly: true,
    body: "Flowvia Health: Service update. Please contact Flowvia Health if you have questions. Reply STOP to opt out.",
  },
} as const;

export const CONSENT_CONFIRMATION_SMS = SMS_TEMPLATES[SMS_TEMPLATE_IDS.CONSENT_CONFIRMATION].body;
export const OPT_IN_CONFIRMED_SMS = SMS_TEMPLATES[SMS_TEMPLATE_IDS.OPT_IN_CONFIRMED].body;
export const HELP_SMS = SMS_TEMPLATES[SMS_TEMPLATE_IDS.HELP].body;
export const OPT_OUT_CONFIRMED_SMS = SMS_TEMPLATES[SMS_TEMPLATE_IDS.OPT_OUT_CONFIRMED].body;
export const APPOINTMENT_UPDATE_PLACEHOLDER_SMS = SMS_TEMPLATES[SMS_TEMPLATE_IDS.APPOINTMENT_UPDATE_PLACEHOLDER].body;

export const FORBIDDEN_SMS_TEMPLATE_PLACEHOLDERS = [
  "diagnosis",
  "condition",
  "medication",
  "treatment",
  "symptoms",
  "clinical_note",
  "therapy_plan",
  "wound",
  "pain_score",
] as const;

const forbiddenPlaceholderPattern = new RegExp(`\\b(${FORBIDDEN_SMS_TEMPLATE_PLACEHOLDERS.join("|")})\\b`, "i");
const approvedTemplateBodies = new Set(Object.values(SMS_TEMPLATES).map((template) => template.body));

export function getApprovedSmsTemplates() {
  return Object.values(SMS_TEMPLATES);
}

export function assertSmsTemplatesAreSafe() {
  const unsafe = getApprovedSmsTemplates().filter((template) => forbiddenPlaceholderPattern.test(template.body));
  if (unsafe.length > 0) {
    throw new Error(`SMS templates contain forbidden clinical placeholders: ${unsafe.map((template) => template.id).join(", ")}`);
  }
}

export function assertApprovedSmsTemplateBody(body: string) {
  assertSmsTemplatesAreSafe();
  if (!approvedTemplateBodies.has(body)) {
    throw new Error("Flowvia app-generated SMS must use an approved transactional template.");
  }
}
